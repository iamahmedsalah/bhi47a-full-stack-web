import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { StudentLoginDto } from './dto/student-login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CookieOptions, Response } from 'express';
import { randomBytes } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async studentLogin(dto: StudentLoginDto) {
    const user = await this.usersService.findByStudentCode(dto.studentCode);
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
      const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)) : remaining * 60;
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
      const currentAttempts = updatedUser.failedLoginAttempts ?? updatedUser.loginAttempts ?? 0;
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

    // Successful login: reset attempts and update last login
    await Promise.all([
      this.usersService.resetLoginAttempts(user._id.toString()),
      this.usersService.updateLastLogin(user._id.toString()),
    ]);

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
    const user = await this.usersService.findByEmail(dto.email);
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
      const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)) : remaining * 60;
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
      const currentAttempts = updatedUser.failedLoginAttempts ?? updatedUser.loginAttempts ?? 0;
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

    // Successful login: reset attempts and update last login
    await Promise.all([
      this.usersService.resetLoginAttempts(user._id.toString()),
      this.usersService.updateLastLogin(user._id.toString()),
    ]);

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

    const updatedUser = await this.usersService.prepareGoogleLink(
      userId,
      email,
    );
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    return {
      googleEmail: updatedUser.googleEmail,
      googleLinkPending: updatedUser.googleLinkPending,
      status: googleClientId ? 'ready' : 'pending_configuration',
      message: googleClientId
        ? 'Google linking can continue when callback is enabled'
        : 'Google OAuth is saved as pending until GOOGLE_CLIENT_ID and callback are configured',
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
