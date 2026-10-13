import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  IS_PUBLIC_IN_DEV_KEY,
} from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!UNSAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const headerToken = request.headers['x-csrf-token'];
    const cookieToken = request.cookies?.csrf_token;

    if (
      !cookieToken ||
      typeof headerToken !== 'string' ||
      headerToken !== cookieToken
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
