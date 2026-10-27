import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response, CookieOptions } from 'express';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../../users/users.service';
import type { UserDocument } from '../../users/schemas/user.schema';
import {
  AuthSessionStore,
  sessionDigest,
  type SessionClaims,
} from './auth-session-store.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly sessionStore?: AuthSessionStore,
  ) {}

  generateToken(userId: string, role: string, tokenVersion: number): string {
    return this.jwtService.sign(
      {
        sub: userId,
        role,
        tokenVersion,
        sid: randomBytes(32).toString('base64url'),
      },
      {
        issuer: this.configService.get<string>('JWT_ISSUER', 'student-portal'),
        audience: this.configService.get<string>(
          'JWT_AUDIENCE',
          'student-portal-web',
        ),
      },
    );
  }

  async completeCredentialLogin(user: UserDocument) {
    await this.usersService.resetAttemptsAndUpdateLastLogin(
      user._id.toString(),
    );
    return {
      token: this.generateToken(
        user._id.toString(),
        user.role,
        user.tokenVersion ?? 0,
      ),
      user: await this.getMe(user._id.toString()),
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      staffType: user.staffType,
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

  async setCookieToken(res: Response, token: string) {
    const claims = this.jwtService.verify<SessionClaims>(token, {
      algorithms: ['HS256'],
    });
    if (
      !this.sessionStore ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= Date.now()
    )
      throw new UnauthorizedException('Session persistence unavailable');
    await this.sessionStore.register(claims);
    const maxAge = Math.max(0, claims.exp * 1000 - Date.now());
    res.cookie('access_token', token, {
      ...this.getCookieOptions(true),
      maxAge,
    });
    return this.setCsrfToken(res, maxAge);
  }

  clearCookieToken(res: Response) {
    const httpOnlyOpts = this.getCookieOptions(true);
    const nonHttpOnlyOpts = this.getCookieOptions(false);

    res.clearCookie('access_token', httpOnlyOpts);
    res.clearCookie('csrf_token', nonHttpOnlyOpts);

    if (httpOnlyOpts.domain) {
      res.clearCookie('access_token', { ...httpOnlyOpts, domain: undefined });
      res.clearCookie('csrf_token', { ...nonHttpOnlyOpts, domain: undefined });
    }
  }

  refreshCsrfToken(res: Response, token?: string) {
    const claims = token
      ? this.jwtService.verify<SessionClaims>(token, { algorithms: ['HS256'] })
      : undefined;
    return this.setCsrfToken(
      res,
      claims ? Math.max(0, claims.exp * 1000 - Date.now()) : undefined,
    );
  }

  private setCsrfToken(res: Response, maxAge = 7 * 24 * 60 * 60 * 1000) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      ...this.getCookieOptions(false),
      maxAge,
    });
    return csrfToken;
  }

  async revokeSession(token: string) {
    if (!this.sessionStore)
      throw new UnauthorizedException('Session persistence unavailable');
    await this.sessionStore.revoke(
      this.jwtService.verify<SessionClaims>(token, { algorithms: ['HS256'] }),
      token,
    );
  }

  async listSessions(userId: string, token: string) {
    if (!this.sessionStore) throw new UnauthorizedException();
    const claims = this.jwtService.verify<SessionClaims>(token, {
      algorithms: ['HS256'],
    });
    return this.sessionStore.list(
      userId,
      sessionDigest(claims.sid ?? `legacy:${token}`),
      claims.tokenVersion ?? 0,
    );
  }

  async revokeOwnedSession(userId: string, id: string) {
    if (!this.sessionStore) throw new UnauthorizedException();
    await this.sessionStore.revokeOwned(userId, id);
    return { ok: true };
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
