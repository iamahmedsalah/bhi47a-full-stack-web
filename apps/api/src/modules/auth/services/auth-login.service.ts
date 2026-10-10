import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';
import { EmailsService } from '../../emails/emails.service';
import { StudentLoginDto } from '../dto/student-login.dto';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { AuthSessionService } from './auth-session.service';
import { renderOtpEmailTemplate } from '../../emails/templates/email-template.builder';

interface VerifiedGoogleAccount {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

function normalizeArabicNumerals(value?: string): string {
  if (!value) return '';
  return value.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

@Injectable()
export class AuthLoginService {
  private readonly googleOAuthClient = new OAuth2Client();

  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: AuthSessionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailsService: EmailsService,
  ) {}

  async studentLogin(dto: StudentLoginDto) {
    const cleanStudentCode = normalizeArabicNumerals(dto.studentCode);
    const cleanPassword = normalizeArabicNumerals(dto.password);

    const user = await this.usersService.findByIdentifier(cleanStudentCode);
    if (!user) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new UnauthorizedException('الحساب غير مفعّل');

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

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

    let isPasswordValid = await this.usersService.validatePassword(
      user,
      cleanPassword,
    );
    if (!isPasswordValid && user.mustChangePassword && user.nationalId) {
      const cleanNid = normalizeArabicNumerals(user.nationalId);
      if (cleanPassword === cleanNid) {
        isPasswordValid = true;
        // Self-heal: update passwordHash in the background so future checks are lightning-fast
        const freshHash = await bcrypt.hash(cleanNid, 10);
        await this.usersService.updatePasswordHashDirect(
          user._id.toString(),
          freshHash,
        );
      }
    }
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

    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );

    const token = this.sessionService.generateToken(
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
    if (!user) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new UnauthorizedException('الحساب غير مفعّل');
    if (user.role === 'student')
      throw new UnauthorizedException('غير مصرح بالدخول');

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

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

    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );

    const token = this.sessionService.generateToken(
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

  async startGoogleLink(
    userId: string,
    email: string,
    acceptLanguage?: string,
  ) {
    const isEn = acceptLanguage?.toLowerCase().startsWith('en');
    const lang: 'ar' | 'en' = isEn ? 'en' : 'ar';

    const user = await this.usersService.findById(userId);
    if (user.role !== 'student') {
      throw new UnauthorizedException(
        isEn
          ? 'Only student accounts can link Google'
          : 'حسابات الطلاب فقط يمكنها ربط Google',
      );
    }

    if (user.googleLinkedAt && !user.googleLinkPending) {
      throw new BadRequestException(
        isEn
          ? 'Google account is already linked. Unlink it before linking another account.'
          : 'حساب Google مربوط بالفعل بهذا الحساب. قم بإلغاء الربط أولاً إن أردت تغييره.',
      );
    }

    const { user: updatedUser, otp } =
      await this.usersService.prepareGoogleLink(userId, email);

    const emailHtml = renderOtpEmailTemplate({
      title: isEn
        ? 'Google Account Link Verification'
        : 'تأكيد ربط حساب Google',
      preheader: isEn
        ? 'Verify your Google account link for Student Portal'
        : 'استخدم رمز التحقق لإكمال ربط حساب Google ببوابة الطالب',
      greetingName: user.name,
      arabicMessage:
        'لقد طلبت ربط حساب Google الخاص بك ببوابة الطالب. استخدم رمز التحقق التالي لإكمال عملية الربط:',
      englishMessage:
        'You requested to link your Google account to the student portal. Use the verification code below to complete the link:',
      otp,
      lang,
    });

    let emailDeliveryStatus: 'sent' | 'failed' = 'sent';
    let devOtp: string | undefined;

    try {
      await this.emailsService.send({
        to: [email],
        subject: isEn
          ? 'Google Account Verification Code | Student Portal'
          : 'رمز تأكيد ربط حساب Google | بوابة الطالب',
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
      message: isEn
        ? 'A 6-digit verification code (OTP) was sent to your Google account'
        : 'تم إرسال رمز التحقق (OTP) إلى بريد Google الخاص بك بنجاح',
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
}
