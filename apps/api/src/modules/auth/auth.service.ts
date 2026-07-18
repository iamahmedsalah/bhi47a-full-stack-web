import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { EmailsService } from '../emails/emails.service';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../academic-emails/schemas/academic-email.schema';
import { StudentLoginDto } from './dto/student-login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ForgotPasswordDto,
  ResetPasswordOtpDto,
} from './dto/forgot-password.dto';
import { CookieOptions, Response } from 'express';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { renderOtpEmailTemplate } from '../emails/templates/email-template.builder';

interface VerifiedGoogleAccount {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

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
export class AuthService {
  private readonly googleOAuthClient = new OAuth2Client();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailsService: EmailsService,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(AcademicEmail.name)
    private academicEmailModel: Model<AcademicEmailDocument>,
  ) {}

  async studentLogin(dto: StudentLoginDto) {
    const user = await this.usersService.findByIdentifier(dto.studentCode);
    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('الحساب غير مفعّل');
    }

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

    // Check account lock before password validation
    if (this.usersService.isAccountLocked(user)) {
      const remaining = this.usersService.getLockRemainingMinutes(user);
      const lockedUntil = user.lockUntil || user.lockedUntil;
      const secondsLeft = lockedUntil
        ? Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
        : remaining * 60;
      throw new UnauthorizedException({
        message: `تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد ${remaining} دقيقة`,
        locked: true,
        lockRemainingSeconds: secondsLeft,
      });
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      dto.password,
    );
    if (!isPasswordValid) {
      await this.usersService.incrementLoginAttempts(user._id.toString());
      const updatedUser = await this.usersService.findById(user._id.toString());
      const currentAttempts =
        updatedUser.failedLoginAttempts ?? updatedUser.loginAttempts ?? 0;
      const attemptsLeft = Math.max(0, maxAttempts - currentAttempts);

      if (this.usersService.isAccountLocked(updatedUser)) {
        throw new UnauthorizedException({
          message: 'تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة خاطئة',
          locked: true,
          lockRemainingSeconds: lockDurationMinutes * 60,
        });
      }

      throw new UnauthorizedException({
        message: 'بيانات الدخول غير صحيحة',
        attemptsLeft,
        maxAttempts,
      });
    }

    // Successful login: reset attempts and update last login in a single write operation
    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );

    const token = this.generateToken(
      user._id.toString(),
      user.role,
      user.tokenVersion ?? 0,
    );

    return {
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        studentCode: user.studentCode,
        email: user.email,
        phone: user.phone,
        googleEmail: user.googleEmail,
        googleLinkPending: user.googleLinkPending,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async adminLogin(dto: AdminLoginDto) {
    const user = await this.usersService.findByIdentifier(dto.email);
    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('الحساب غير مفعّل');
    }

    if (user.role === 'student') {
      throw new UnauthorizedException('غير مصرح بالدخول');
    }

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

    // Check account lock before password validation
    if (this.usersService.isAccountLocked(user)) {
      const remaining = this.usersService.getLockRemainingMinutes(user);
      const lockedUntil = user.lockUntil || user.lockedUntil;
      const secondsLeft = lockedUntil
        ? Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
        : remaining * 60;
      throw new UnauthorizedException({
        message: `تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد ${remaining} دقيقة`,
        locked: true,
        lockRemainingSeconds: secondsLeft,
      });
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      dto.password,
    );
    if (!isPasswordValid) {
      await this.usersService.incrementLoginAttempts(user._id.toString());
      const updatedUser = await this.usersService.findById(user._id.toString());
      const currentAttempts =
        updatedUser.failedLoginAttempts ?? updatedUser.loginAttempts ?? 0;
      const attemptsLeft = Math.max(0, maxAttempts - currentAttempts);

      if (this.usersService.isAccountLocked(updatedUser)) {
        throw new UnauthorizedException({
          message: 'تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة خاطئة',
          locked: true,
          lockRemainingSeconds: lockDurationMinutes * 60,
        });
      }

      throw new UnauthorizedException({
        message: 'بيانات الدخول غير صحيحة',
        attemptsLeft,
        maxAttempts,
      });
    }

    // Successful login: reset attempts and update last login in a single write operation
    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );

    const token = this.generateToken(
      user._id.toString(),
      user.role,
      user.tokenVersion ?? 0,
    );

    return {
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);

    const isValid = await this.usersService.validatePassword(
      user,
      dto.currentPassword,
    );
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const updatedUser = await this.usersService.updatePassword(
      userId,
      dto.newPassword,
    );
    return {
      message: 'Password changed successfully',
      token: this.generateToken(
        updatedUser._id.toString(),
        updatedUser.role,
        updatedUser.tokenVersion ?? 0,
      ),
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      studentCode: user.studentCode,
      googleEmail: user.googleEmail,
      googleLinkedAt: user.googleLinkedAt,
      googleLinkPending: user.googleLinkPending ?? false,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion ?? 0,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async startGoogleLink(userId: string, email: string) {
    const user = await this.usersService.findById(userId);
    if (user.role !== 'student') {
      throw new UnauthorizedException('Only student accounts can link Google');
    }

    if (user.googleLinkedAt && !user.googleLinkPending) {
      throw new BadRequestException(
        'Google account is already linked. Unlink it before linking another account.',
      );
    }

    const { user: updatedUser, otp } =
      await this.usersService.prepareGoogleLink(userId, email);

    let emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #0f766e; margin: 0;">بوابة الطالب | Google Linking</h2>
        </div>
        <div style="direction: rtl; text-align: right; margin-bottom: 25px;">
          <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">مرحباً <strong>${user.name}</strong>،</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">لقد طلبت ربط حساب Google الخاص بك ببوابة الطالب. رمز التحقق الخاص بك هو:</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-family: monospace; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #0f766e;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #64748b;">* ينتهي هذا الرمز بعد 15 دقيقة.</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <div style="direction: ltr; text-align: left;">
          <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">You requested to link your Google account to the student portal. Your verification OTP code is:</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-family: monospace; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #0f766e;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #64748b;">* This code expires in 15 minutes.</p>
        </div>
      </div>
    `;

    emailHtml = renderOtpEmailTemplate({
      title: 'Google Account Verification',
      preheader: 'Verify your Google account link for Student Portal',
      greetingName: user.name,
      arabicMessage:
        'لقد طلبت ربط حساب Google الخاص بك ببوابة الطالب. استخدم رمز التحقق التالي لإكمال الربط.',
      englishMessage:
        'You requested to link your Google account to the student portal. Use the verification code below to complete the link.',
      otp,
    });

    let emailDeliveryStatus: 'sent' | 'failed' = 'sent';
    let devOtp: string | undefined;

    try {
      await this.emailsService.send({
        to: [email],
        subject: 'تأكيد ربط حساب Google | Verify Google Link',
        html: emailHtml,
        event: 'google_linking_otp',
      });
    } catch (err) {
      emailDeliveryStatus = 'failed';
      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        devOtp = otp;
      }
      console.warn('Failed to send Google verification email:', err);
    }

    return {
      googleEmail: updatedUser.googleEmail,
      googleLinkPending: updatedUser.googleLinkPending,
      emailDeliveryStatus,
      devOtp,
      status: 'ready',
      message: 'تم إرسال رمز التحقق (OTP) إلى بريد Google الخاص بك بنجاح',
    };
  }

  async unlinkGoogle(userId: string) {
    const user = await this.usersService.findById(userId);
    if (user.role !== 'student') {
      throw new UnauthorizedException(
        'Only student accounts can unlink Google',
      );
    }

    await this.usersService.clearGoogleLink(userId);
    return { message: 'Google account link removed successfully' };
  }

  async verifyGoogleOtp(userId: string, otp: string) {
    const user = await this.usersService.findById(userId);
    if (!user.googleLinkOtp || !user.googleLinkOtpExpiresAt) {
      throw new BadRequestException(
        'لم يتم طلب ربط Google لهذا الحساب أو انتهت صلاحية الكود',
      );
    }

    if (user.googleLinkOtpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('انتهت صلاحية رمز التحقق (OTP)');
    }

    const otpMatches = await bcrypt.compare(otp, user.googleLinkOtp);
    if (!otpMatches) {
      throw new BadRequestException('رمز التحقق (OTP) غير صحيح');
    }

    user.googleLinkPending = false;
    user.googleLinkedAt = new Date();
    user.googleLinkOtp = undefined;
    user.googleLinkOtpExpiresAt = undefined;
    await user.save();

    return { message: 'تم ربط حساب Google بنجاح' };
  }

  async verifyGoogleOAuth(userId: string, credential: string) {
    const user = await this.usersService.findById(userId);
    if (user.role !== 'student') {
      throw new UnauthorizedException('Only student accounts can link Google');
    }

    let googleAccount: VerifiedGoogleAccount;
    try {
      googleAccount = await this.verifyGoogleCredential(credential);
    } catch {
      throw new UnauthorizedException(
        'فشل التحقق من حساب Google. يرجى المحاولة مرة أخرى.',
      );
    }

    if (user.googleEmail && user.googleEmail !== googleAccount.email) {
      throw new BadRequestException(
        'حساب Google لا يطابق البريد الإلكتروني الذي تم إعداده للربط',
      );
    }

    const existing = await this.usersService.findLinkedGoogleAccount({
      googleId: googleAccount.googleId,
      googleEmail: googleAccount.email,
    });
    if (existing && existing._id.toString() !== userId) {
      throw new BadRequestException('حساب Google هذا مرتبط بطالب آخر بالفعل');
    }

    user.googleId = googleAccount.googleId;
    user.googleEmail = googleAccount.email;
    if (!user.avatarUrl && googleAccount.picture) {
      user.avatarUrl = googleAccount.picture;
    }
    user.googleLinkPending = false;
    user.googleLinkedAt = new Date();
    user.googleLinkOtp = undefined;
    user.googleLinkOtpExpiresAt = undefined;
    await user.save();

    return { message: 'تم ربط حساب Google بنجاح' };
  }

  async googleLogin(credential: string) {
    let googleAccount: VerifiedGoogleAccount;
    try {
      googleAccount = await this.verifyGoogleCredential(credential);
    } catch {
      throw new UnauthorizedException(
        'فشل تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.',
      );
    }

    const user = await this.usersService.findLinkedGoogleAccount({
      googleId: googleAccount.googleId,
      googleEmail: googleAccount.email,
    });
    if (!user) {
      throw new UnauthorizedException(
        'حساب Google هذا غير مرتبط بأي طالب مسجل. يرجى ربط الحساب أولاً من صفحة الملف الشخصي.',
      );
    }

    if (user.role !== 'student') {
      throw new UnauthorizedException(
        'Only student accounts can use Google login',
      );
    }

    if (user.googleLinkPending && user.googleEmail === googleAccount.email) {
      user.googleId = googleAccount.googleId;
      user.googleEmail = googleAccount.email;
      user.googleLinkPending = false;
      user.googleLinkedAt = new Date();
      user.googleLinkOtp = undefined;
      user.googleLinkOtpExpiresAt = undefined;
      if (!user.avatarUrl && googleAccount.picture) {
        user.avatarUrl = googleAccount.picture;
      }
      await user.save();
    }

    if (user.googleLinkPending) {
      throw new UnauthorizedException(
        'ربط حساب Google معلق. يرجى تأكيد رمز التحقق أولاً.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('الحساب معطل');
    }

    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );
    if (!user.googleId) {
      user.googleId = googleAccount.googleId;
      if (!user.avatarUrl && googleAccount.picture) {
        user.avatarUrl = googleAccount.picture;
      }
      await user.save();
    }
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
    user.resetPasswordExpireAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
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
        isEn
          ? 'Invalid verification code (OTP)'
          : 'رمز التحقق (OTP) غير صحيح',
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

  setCookieToken(res: Response, token: string) {
    res.cookie('access_token', token, {
      ...this.getCookieOptions(true),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return this.setCsrfToken(res);
  }

  clearCookieToken(res: Response) {
    res.clearCookie('access_token', this.getCookieOptions(true));
    res.clearCookie('csrf_token', this.getCookieOptions(false));
  }

  refreshCsrfToken(res: Response) {
    return this.setCsrfToken(res);
  }

  private setCsrfToken(res: Response) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      ...this.getCookieOptions(false),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return csrfToken;
  }

  private getCookieOptions(httpOnly: boolean): CookieOptions {
    const rawSameSite = this.configService
      .get<string>('COOKIE_SAME_SITE', 'lax')
      .toLowerCase();
    const sameSite: CookieOptions['sameSite'] =
      rawSameSite === 'none' || rawSameSite === 'strict' ? rawSameSite : 'lax';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
    const options: CookieOptions = {
      httpOnly,
      secure:
        this.configService.get('NODE_ENV') === 'production' ||
        sameSite === 'none',
      sameSite,
      path: '/',
    };

    if (cookieDomain?.trim()) {
      options.domain = cookieDomain.trim();
    }

    return options;
  }

  private async getPasswordRecoveryEmail(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.usersService.findById(userId);
    if (user?.email && user.email.trim()) return user.email.trim();
    if (user?.googleEmail && user.googleEmail.trim()) return user.googleEmail.trim();

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

  private getGoogleClientId(): string {
    const clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      this.configService.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID');

    if (!clientId?.trim()) {
      throw new UnauthorizedException(
        'Google OAuth client ID is not configured',
      );
    }

    return clientId.trim();
  }

  private async verifyGoogleCredential(
    credential: string,
  ): Promise<VerifiedGoogleAccount> {
    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: this.getGoogleClientId(),
      });
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || !payload.email_verified) {
        throw new UnauthorizedException('Google account is not verified');
      }

      return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name,
        picture: payload.picture,
      };
    } catch {
      try {
        const res = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${credential}` },
          },
        );
        if (res.ok) {
          const info = (await res.json()) as {
            sub?: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
            picture?: string;
          };
          if (info.sub && info.email && info.email_verified) {
            return {
              googleId: info.sub,
              email: info.email.toLowerCase(),
              name: info.name,
              picture: info.picture,
            };
          }
        }
      } catch {
        // ignore
      }
      throw new UnauthorizedException('Google account is not verified');
    }
  }

  private generateToken(
    userId: string,
    role: string,
    tokenVersion: number,
  ): string {
    return this.jwtService.sign({
      sub: userId,
      role,
      tokenVersion,
    });
  }

  async updateTheme(userId: string, theme: 'light' | 'dark' | 'system') {
    return this.usersService.updateTheme(userId, theme);
  }
}
