import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AuthLoginService } from './services/auth-login.service';
import { AuthPasswordService } from './services/auth-password.service';
import { AuthSessionService } from './services/auth-session.service';
import { UsersService } from '../users/users.service';
import type { StudentLoginDto } from './dto/student-login.dto';
import type { AdminLoginDto } from './dto/admin-login.dto';
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

  googleLogin(credential: string) {
    return this.loginService.googleLogin(credential);
  }

  startGoogleLink(userId: string, email: string) {
    return this.loginService.startGoogleLink(userId, email);
  }

  unlinkGoogle(userId: string) {
    return this.loginService.unlinkGoogle(userId);
  }

  verifyGoogleOtp(userId: string, otp: string) {
    return this.loginService.verifyGoogleOtp(userId, otp);
  }

  verifyGoogleOAuth(userId: string, credential: string) {
    return this.loginService.verifyGoogleOAuth(userId, credential);
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

  refreshCsrfToken(res: Response) {
    return this.sessionService.refreshCsrfToken(res);
  }

  updateTheme(userId: string, theme: 'light' | 'dark' | 'system') {
    return this.usersService.updateTheme(userId, theme);
  }
}
