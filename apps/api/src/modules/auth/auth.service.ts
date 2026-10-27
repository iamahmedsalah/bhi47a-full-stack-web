import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AuthLoginService } from './services/auth-login.service';
import { AuthPasswordService } from './services/auth-password.service';
import { AuthSessionService } from './services/auth-session.service';
import { UsersService } from '../users/users.service';
import type { StudentLoginDto } from './dto/student-login.dto';
import type { AdminLoginDto } from './dto/admin-login.dto';
import type { GoogleFlowProof } from './services/auth-login.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type {
  ForgotPasswordDto,
  ResetPasswordOtpDto,
} from './dto/forgot-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly loginService: AuthLoginService,
    private readonly passwordService: AuthPasswordService,
    private readonly sessionService: AuthSessionService,
    private readonly usersService: UsersService,
  ) {}

  // ── Authentication & Login ─────────────────────────────────────
  studentLogin(dto: StudentLoginDto) {
    return this.loginService.studentLogin(dto);
  }

  adminLogin(dto: AdminLoginDto) {
    return this.loginService.adminLogin(dto);
  }

  googleLogin(credential: string, flow?: GoogleFlowProof) {
    return this.loginService.googleLogin(credential, flow);
  }

  startGoogleLink(userId: string, email: string, acceptLanguage?: string) {
    return this.loginService.startGoogleLink(userId, email, acceptLanguage);
  }

  unlinkGoogle(userId: string) {
    return this.loginService.unlinkGoogle(userId);
  }

  verifyGoogleOtp(userId: string, otp: string) {
    return this.loginService.verifyGoogleOtp(userId, otp);
  }

  verifyGoogleOAuth(
    userId: string,
    credential: string,
    flow?: GoogleFlowProof,
  ) {
    return this.loginService.verifyGoogleOAuth(userId, credential, flow);
  }

  // ── Password Management ────────────────────────────────────────
  changePassword(userId: string, dto: ChangePasswordDto) {
    return this.passwordService.changePassword(userId, dto);
  }

  forgotPassword(dto: ForgotPasswordDto, acceptLanguage?: string) {
    return this.passwordService.forgotPassword(dto, acceptLanguage);
  }

  resetPasswordOtp(dto: ResetPasswordOtpDto, acceptLanguage?: string) {
    return this.passwordService.resetPasswordOtp(dto, acceptLanguage);
  }

  // ── Session & Cookies ──────────────────────────────────────────
  getMe(userId: string) {
    return this.sessionService.getMe(userId);
  }

  setCookieToken(res: Response, token: string) {
    return this.sessionService.setCookieToken(res, token);
  }

  clearCookieToken(res: Response) {
    return this.sessionService.clearCookieToken(res);
  }

  refreshCsrfToken(res: Response, token?: string) {
    return this.sessionService.refreshCsrfToken(res, token);
  }

  revokeSession(token: string) {
    return this.sessionService.revokeSession(token);
  }

  updateTheme(userId: string, theme: 'light' | 'dark' | 'system') {
    return this.usersService.updateTheme(userId, theme);
  }

  // ── Session Heartbeat & Activity ──────────────────────────────
  async recordHeartbeat(
    userId: string,
    body: { route?: string; action?: string; actionAr?: string },
    userAgent?: string,
  ) {
    const { action, actionAr } = body.action
      ? { action: body.action, actionAr: body.actionAr || body.action }
      : mapRouteToAction(body.route);
    const device = parseDeviceFromUserAgent(userAgent);
    await this.usersService.recordUserActivity(userId, {
      route: body.route,
      action,
      actionAr,
      device,
    });
  }

  async recordLogout(userId?: string) {
    if (!userId) return;
    await this.usersService.recordLogout(userId);
  }
}

export function mapRouteToAction(route?: string): {
  action: string;
  actionAr: string;
} {
  if (!route) return { action: 'Browsing Portal', actionAr: 'تصفح البوابة' };
  const r = route.toLowerCase();
  if (r.includes('/attendance')) {
    return {
      action: 'Checking Attendance',
      actionAr: 'متابعة وتسجيل الحضور',
    };
  }
  if (r.includes('/quizzes') || r.includes('/quiz')) {
    return {
      action: 'Taking / Reviewing Quizzes',
      actionAr: 'حل أو استعراض الاختبارات',
    };
  }
  if (r.includes('/results') || r.includes('/grades')) {
    return {
      action: 'Viewing Academic Results',
      actionAr: 'الاطلاع على النتائج والتقديرات',
    };
  }
  if (r.includes('/courses')) {
    return {
      action: 'Browsing Courses & Materials',
      actionAr: 'تصفح المقررات والمناهج',
    };
  }
  if (r.includes('/registration')) {
    return {
      action: 'Course Registration',
      actionAr: 'تسجيل المقررات الدراسية',
    };
  }
  if (r.includes('/exam-schedule') || r.includes('/exam-place')) {
    return {
      action: 'Checking Exam Schedule & Hall',
      actionAr: 'الاطلاع على جدول ومقار اللجان',
    };
  }
  if (r.includes('/complaints')) {
    return {
      action: 'Complaints & Inquiries',
      actionAr: 'تقديم أو متابعة الشكاوى',
    };
  }
  if (r.includes('/academic-advising')) {
    return { action: 'Academic Advising', actionAr: 'الإرشاد الأكاديمي' };
  }
  if (r.includes('/academic-email')) {
    return {
      action: 'Academic Email Portal',
      actionAr: 'البريد الجامعي الرسمي',
    };
  }
  if (r.includes('/profile')) {
    return {
      action: 'Viewing Student Profile',
      actionAr: 'استعراض الملف الشخصي',
    };
  }
  if (r.includes('/dashboard')) {
    return { action: 'Student Dashboard', actionAr: 'لوحة التحكم الرئيسية' };
  }
  if (r.includes('/admin')) {
    return { action: 'Admin Portal', actionAr: 'لوحة الإدارة' };
  }
  return { action: 'Active in Portal', actionAr: 'متواجد بالبوابة' };
}

export function parseDeviceFromUserAgent(ua?: string): string {
  if (!ua) return 'Web Browser';
  const u = ua.toLowerCase();
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) {
    if (u.includes('android')) return 'Mobile (Android)';
    if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) {
      return 'Mobile (iOS)';
    }
    return 'Mobile Browser';
  }
  if (u.includes('windows')) return 'Desktop (Windows)';
  if (u.includes('macintosh') || u.includes('mac os')) return 'Desktop (macOS)';
  if (u.includes('linux')) return 'Desktop (Linux)';
  return 'Desktop Browser';
}
