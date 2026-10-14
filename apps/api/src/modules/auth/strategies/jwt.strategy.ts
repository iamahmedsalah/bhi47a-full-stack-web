import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  role: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly userCache = new Map<
    string,
    {
      user: {
        _id: string;
        role: string;
        name: string;
        email?: string;
        studentCode?: string;
        permissions?: string[];
        mustChangePassword?: boolean;
        tokenVersion: number;
        isActive: boolean;
      };
      cachedAt: number;
    }
  >();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        if (!req || !req.cookies) return null;
        return req.cookies['access_token'] || null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  invalidate(userId?: string) {
    if (!userId) {
      this.userCache.clear();
      return;
    }
    this.userCache.delete(userId);
  }

  async validate(payload: JwtPayload) {
    const now = Date.now();
    const cached = this.userCache.get(payload.sub);

    if (
      cached &&
      now - cached.cachedAt < this.CACHE_TTL_MS &&
      (payload.tokenVersion ?? 0) === cached.user.tokenVersion
    ) {
      if (!cached.user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
      return cached.user;
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Session has expired');
    }

    const authUser = {
      _id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
      studentCode: user.studentCode,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion ?? 0,
      isActive: user.isActive,
    };

    if (this.userCache.size > 2000) {
      const threshold = now - this.CACHE_TTL_MS;
      for (const [k, v] of this.userCache.entries()) {
        if (v.cachedAt < threshold) this.userCache.delete(k);
      }
    }
    this.userCache.set(payload.sub, { user: authUser, cachedAt: now });

    return authUser;
  }
}
