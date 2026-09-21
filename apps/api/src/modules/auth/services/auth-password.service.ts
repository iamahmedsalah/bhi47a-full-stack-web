import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';
import { EmailsService } from '../../emails/emails.service';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../../academic-emails/schemas/academic-email.schema';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  ForgotPasswordDto,
  ResetPasswordOtpDto,
} from '../dto/forgot-password.dto';
import { renderOtpEmailTemplate } from '../../emails/templates/email-template.builder';
import { AuthSessionService } from './auth-session.service';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: AuthSessionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailsService: EmailsService,
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(AcademicEmail.name)
    private readonly academicEmailModel: Model<AcademicEmailDocument>,
  ) {}

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findByIdWithNationalId(userId);

    const isValid = await this.usersService.validatePassword(
      user,
      dto.currentPassword,
    );
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password cannot be the same as current password / لا يمكن إعادة استخدام كلمة المرور الحالية',
      );
    }

    // Do not allow National ID as permanent password
    const trimmedNewPassword = dto.newPassword.trim();
    if (user.nationalId && trimmedNewPassword === user.nationalId.trim()) {
      throw new BadRequestException(
        'New password cannot be your National ID / لا يمكن استخدام الرقم القومي ككلمة مرور دائمة',
      );
    }

    const studentProfile = await this.studentProfileModel
      .findOne({ userId })
      .select('+nationalId')
      .lean();
    if (
      studentProfile?.nationalId &&
      trimmedNewPassword === studentProfile.nationalId.trim()
    ) {
      throw new BadRequestException(
        'New password cannot be your National ID / لا يمكن استخدام الرقم القومي ككلمة مرور دائمة',
      );
    }

    const updatedUser = await this.usersService.updatePassword(
      userId,
      dto.newPassword,
    );
    return {
      message: 'Password changed successfully',
      token: this.sessionService.generateToken(
        updatedUser._id.toString(),
        updatedUser.role,
        updatedUser.tokenVersion ?? 0,
      ),
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        role: updatedUser.role,
        mustChangePassword: false,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, acceptLanguage?: string) {
    const isEn = acceptLanguage?.toLowerCase().startsWith('en');
    const userLean = await this.usersService.findByIdentifier(dto.identifier);
    if (!userLean) {
      throw new NotFoundException(
        isEn ? 'Account not found' : 'الحساب غير موجود',
      );
    }

    const user = await this.usersService.findById(userLean._id.toString());
    const emailTo = await this.getPasswordRecoveryEmail(user._id.toString());

    if (!emailTo) {
      throw new BadRequestException(
        isEn
          ? 'No email address registered for this account yet. Please contact institute administration to set an email for password recovery.'
          : 'لا يوجد بريد إلكتروني مسجل لهذا الحساب حتى الآن. يرجى التواصل مع إدارة المعهد لتعيين بريد إلكتروني لاستعادة كلمة المرور.',
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = await bcrypt.hash(otp, 12);
    user.resetPasswordExpireAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const emailHtml = renderOtpEmailTemplate({
      title: 'Password Recovery',
      preheader:
        'Use this verification code to reset your Student Portal password',
      greetingName: user.name,
      arabicMessage:
        'لقد طلبت استعادة كلمة المرور الخاصة بك. استخدم رمز التحقق التالي لإكمال إعادة التعيين.',
      englishMessage:
        'You requested to recover your password. Use the verification code below to complete the reset.',
      otp,
    });

    try {
      await this.emailsService.send({
        to: [emailTo],
        subject: 'رمز استعادة كلمة المرور | Password Recovery OTP',
        html: emailHtml,
        event: 'password_reset_otp',
      });
    } catch (err) {
      console.warn('Failed to send forgot password email:', err);
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      console.log(
        `[Forgot Password Simulation] OTP for ${dto.identifier} sent to ${emailTo}: ${otp}`,
      );
    }

    const masked = maskEmail(emailTo);
    return {
      message: isEn
        ? `Verification code sent to email: ${masked}`
        : `تم إرسال رمز التحقق إلى البريد الإلكتروني: ${masked}`,
      email: masked,
    };
  }

  async resetPasswordOtp(dto: ResetPasswordOtpDto, acceptLanguage?: string) {
    const isEn = acceptLanguage?.toLowerCase().startsWith('en');
    const userLean = await this.usersService.findByIdentifier(dto.identifier);
    if (!userLean) {
      throw new NotFoundException(
        isEn ? 'Account not found' : 'الحساب غير موجود',
      );
    }

    if (!userLean.resetPasswordToken || !userLean.resetPasswordExpireAt) {
      throw new BadRequestException(
        isEn
          ? 'Password recovery was not requested or verification code expired'
          : 'لم يتم طلب استعادة كلمة المرور أو انتهت صلاحية الرمز',
      );
    }

    if (userLean.resetPasswordExpireAt.getTime() < Date.now()) {
      throw new BadRequestException(
        isEn
          ? 'Verification code (OTP) expired'
          : 'انتهت صلاحية رمز التحقق (OTP)',
      );
    }

    const otpMatches = await bcrypt.compare(
      dto.otp,
      userLean.resetPasswordToken,
    );
    if (!otpMatches) {
      throw new BadRequestException(
        isEn ? 'Invalid verification code (OTP)' : 'رمز التحقق (OTP) غير صحيح',
      );
    }

    await this.usersService.updatePassword(
      userLean._id.toString(),
      dto.newPassword,
    );

    const user = await this.usersService.findById(userLean._id.toString());
    user.resetPasswordToken = undefined;
    user.resetPasswordExpireAt = undefined;
    user.mustChangePassword = false;
    await user.save();

    await this.usersService.resetLoginAttempts(user._id.toString());

    const token = this.jwtService.sign({
      sub: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    });

    return {
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
        studentCode: user.studentCode,
        googleEmail: user.googleEmail,
        googleLinkedAt: user.googleLinkedAt,
        googleLinkPending: user.googleLinkPending,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  private async getPasswordRecoveryEmail(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.usersService.findById(userId);
    if (user?.email && user.email.trim()) return user.email.trim();
    if (user?.googleEmail && user.googleEmail.trim())
      return user.googleEmail.trim();

    const profile = await this.studentProfileModel
      .findOne({ userId })
      .select('academicEmail studentCode')
      .lean<{ academicEmail?: string; studentCode?: string }>();

    if (profile?.academicEmail && profile.academicEmail.trim()) {
      return profile.academicEmail.trim();
    }

    const searchCode = profile?.studentCode || user?.username;
    if (searchCode) {
      const acadDoc = await this.academicEmailModel
        .findOne({
          $or: [{ studentId: userId }, { studentCode: searchCode }],
        })
        .select('academicEmail')
        .lean<{ academicEmail?: string }>();

      if (acadDoc?.academicEmail && acadDoc.academicEmail.trim()) {
        return acadDoc.academicEmail.trim();
      }
    }

    return undefined;
  }
}
