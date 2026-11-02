import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { defaultPasswordHasher } from '../../../security/password-hasher';
import { UsersService } from '../../users/users.service';
import { EmailsService } from '../../emails/emails.service';
import { StudentLoginDto } from '../dto/student-login.dto';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { AuthSessionService } from './auth-session.service';
import {
  buildOtpEmail,
  resolveEmailLanguage,
} from '../../emails/templates/email-content';

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

import { Optional } from '@nestjs/common';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { RecentAuthService } from './recent-auth.service';
export interface GoogleFlowProof {
  flowId: string;
  proof: string;
  origin: string;
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
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly recentAuth?: RecentAuthService,
  ) {}

  async studentLogin(dto: StudentLoginDto) {
    const cleanStudentCode = normalizeArabicNumerals(dto.studentCode);
    const cleanPassword = normalizeArabicNumerals(dto.password);

    let user = await this.usersService.findByStudentCode(cleanStudentCode);
    if (!user) {
      user = await this.usersService.findByIdentifier(cleanStudentCode);
    }
    if (!user) {
      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    if (!user.isActive) {
      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException('الحساب غير مفعّل');
    }

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

    if (this.usersService.isAccountLocked(user)) {
      this.metricsService?.recordLoginAttempt('locked');
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
      cleanPassword,
    );
    if (!isPasswordValid) {
      await this.usersService.incrementLoginAttempts(user._id.toString());
      const updatedUser = await this.usersService.findById(user._id.toString());
      const currentAttempts =
        updatedUser.failedLoginAttempts ?? updatedUser.loginAttempts ?? 0;
      const attemptsLeft = Math.max(0, maxAttempts - currentAttempts);

      if (this.usersService.isAccountLocked(updatedUser)) {
        this.metricsService?.recordLoginAttempt('locked');
        throw new UnauthorizedException({
          message: 'تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة خاطئة',
          locked: true,
          lockRemainingSeconds: lockDurationMinutes * 60,
        });
      }

      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException({
        message: 'بيانات الدخول غير صحيحة',
        attemptsLeft,
        maxAttempts,
      });
    }

    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );
    this.metricsService?.recordLoginAttempt('success');

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
    const cleanEmail = dto.email.trim().toLowerCase();
    let user = await this.usersService.findByEmail(cleanEmail);
    if (!user) {
      user = await this.usersService.findByIdentifier(dto.email);
    }
    if (!user) {
      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    if (!user.isActive) {
      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException('الحساب غير مفعّل');
    }
    if (user.role === 'student') {
      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException('غير مصرح بالدخول');
    }

    const maxAttempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
    const lockDurationMinutes = Number(process.env.AUTH_LOCK_MINUTES) || 30;

    if (this.usersService.isAccountLocked(user)) {
      this.metricsService?.recordLoginAttempt('locked');
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
        this.metricsService?.recordLoginAttempt('locked');
        throw new UnauthorizedException({
          message: 'تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة خاطئة',
          locked: true,
          lockRemainingSeconds: lockDurationMinutes * 60,
        });
      }

      this.metricsService?.recordLoginAttempt('invalid_credentials');
      throw new UnauthorizedException({
        message: 'بيانات الدخول غير صحيحة',
        attemptsLeft,
        maxAttempts,
      });
    }

    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );
    this.metricsService?.recordLoginAttempt('success');

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
        nameAr: (user as { nameAr?: string }).nameAr,
        role: user.role,
        staffType: user.staffType,
        titlePrefix: user.titlePrefix,
        email: user.email,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async googleLogin(credential: string, flow?: GoogleFlowProof) {
    let googleAccount: VerifiedGoogleAccount;
    try {
      googleAccount = await this.verifyGoogleCredential(credential, flow);
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
      throw new UnauthorizedException({
        code: 'GOOGLE_ACCOUNT_NOT_LINKED',
        message:
          'حساب Google هذا غير مرتبط بأي حساب طالب. يرجى تسجيل الدخول أولاً بكود الطالب والرقم القومي، ثم ربط حساب Google من صفحة الملف الشخصي.',
        messageEn:
          'This Google account is not linked to any registered student. Please sign in using your Student Code and Password first, then link Google from your Profile page.',
      });
    }

    if (user.role !== 'student') {
      throw new UnauthorizedException({
        code: 'GOOGLE_NOT_STUDENT',
        message: 'تسجيل الدخول عبر Google مخصص لحسابات الطلاب فقط.',
        messageEn: 'Only student accounts are authorized to use Google login.',
      });
    }

    if (
      user.googleId !== googleAccount.googleId ||
      this.usersService.isAccountLocked(user)
    )
      throw new UnauthorizedException(
        'Google sign-in is unavailable for this account',
      );

    if (user.googleLinkPending) {
      throw new UnauthorizedException({
        code: 'GOOGLE_LINK_PENDING',
        message:
          'ربط حساب Google قيد التأكيد. يرجى تسجيل الدخول أولاً بكود الطالب وتأكيد رمز التحقق في صفحة الملف الشخصي.',
        messageEn:
          'Google account linking is pending confirmation. Please sign in with your Student Code and verify the OTP in your Profile.',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'الحساب معطل. يرجى مراجعة إدارة شؤون الطلاب.',
        messageEn: 'Account is deactivated. Please contact student affairs.',
      });
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
    const lang = resolveEmailLanguage(acceptLanguage);
    const isEn = lang === 'en';

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

    const emailContent = buildOtpEmail({
      purpose: 'google-link',
      greetingName: user.name,
      otp,
      lang,
      portalUrl:
        this.configService.get<string>('CLIENT_URL') ||
        this.configService.get<string>('APP_URL'),
    });

    let emailDeliveryStatus: 'sent' | 'failed' = 'sent';
    let devOtp: string | undefined;

    try {
      await this.emailsService.send({
        to: [email],
        ...emailContent,
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

    const otpMatches = await defaultPasswordHasher.verify(
      otp,
      user.googleLinkOtp,
    );
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

  async verifyGoogleOAuth(
    userId: string,
    credential: string,
    flow?: GoogleFlowProof,
  ) {
    const user = await this.usersService.findById(userId);
    if (user.role !== 'student') {
      throw new UnauthorizedException('Only student accounts can link Google');
    }

    let googleAccount: VerifiedGoogleAccount;
    try {
      googleAccount = await this.verifyGoogleCredential(credential, flow);
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
    flow?: GoogleFlowProof,
  ): Promise<VerifiedGoogleAccount> {
    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: this.getGoogleClientId(),
      });
      const payload = ticket.getPayload();

      if (
        !payload?.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        payload.aud !== this.getGoogleClientId() ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(
          payload.iss,
        ) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= Date.now() / 1000
      ) {
        throw new UnauthorizedException('Google account is not verified');
      }

      if (
        this.configService.get<string>('GOOGLE_NONCE_REQUIRED', 'true') !==
        'false'
      ) {
        const nonce = (payload as { nonce?: unknown }).nonce;
        if (!flow || !this.recentAuth || typeof nonce !== 'string')
          throw new UnauthorizedException('Google login flow required');
        await this.recentAuth.consumeGoogleNonce(
          flow.flowId,
          flow.proof,
          nonce,
          flow.origin,
        );
      }

      return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name,
        picture: payload.picture,
      };
    } catch {
      throw new UnauthorizedException('Google account is not verified');
    }
  }
}
