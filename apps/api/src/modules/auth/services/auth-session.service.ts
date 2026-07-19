import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response, CookieOptions } from 'express';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../../users/users.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateToken(
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
}
