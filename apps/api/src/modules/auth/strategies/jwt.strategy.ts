import { Injectable, UnauthorizedException, Optional } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { AuthSessionStore } from '../services/auth-session-store.service';
import { measureDatabaseStage } from '../../../core/metrics/request-query-context';

export interface JwtPayload {
  sub: string;
  role: string;
  tokenVersion?: number;
  sid?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    @Optional() private readonly sessions?: AuthSessionStore,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        const token: unknown = req?.cookies?.access_token;
        return typeof token === 'string' ? token : null;
      },
      ignoreExpiration: false,
      passReqToCallback: true,
      algorithms: ['HS256'],
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    if (
      typeof payload.sub !== 'string' ||
      !/^[a-f\d]{24}$/i.test(payload.sub) ||
      (payload.tokenVersion !== undefined &&
        (!Number.isSafeInteger(payload.tokenVersion) ||
          payload.tokenVersion < 0))
    ) {
      throw new UnauthorizedException('Invalid session');
    }

    if (!this.sessions)
      throw new UnauthorizedException('Session store unavailable');
    await measureDatabaseStage('auth.session', () =>
      this.sessions!.assertActive(payload, req.cookies?.access_token),
    );

    // Load current account policy for every request, including across replicas.
    // Never share validation promises between tokens with different versions.
    const user = await measureDatabaseStage('auth.user', () =>
      this.usersService.findByIdForAuth(payload.sub),
    );
    if (
      !user ||
      !user.isActive ||
      (user.lockUntil && user.lockUntil > new Date()) ||
      (user.lockedUntil && user.lockedUntil > new Date())
    ) {
      throw new UnauthorizedException('User not found or inactive');
    }
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Session has expired');
    }

    return {
      _id: user._id.toString(),
      role: user.role,
      staffType: user.staffType,
      name: user.name,
      email: user.email,
      studentCode: user.studentCode,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion ?? 0,
      sessionId: payload.sid,
      isActive: user.isActive,
    };
  }
}
