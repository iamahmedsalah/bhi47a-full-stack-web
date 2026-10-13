import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  IS_PUBLIC_IN_DEV_KEY,
  IS_OPTIONAL_AUTH_KEY,
} from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isPublicInDev = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_IN_DEV_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicInDev && process.env.NODE_ENV !== 'production') {
      return true;
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isOptionalAuth) {
      try {
        await (super.canActivate(context) as Promise<boolean>);
      } catch {
        // Missing/invalid token: continue anonymously; handler enforces policy.
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
