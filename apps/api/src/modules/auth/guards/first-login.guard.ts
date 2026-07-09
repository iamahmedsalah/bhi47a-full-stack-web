import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = new Set([
  'GET /api/auth/me',
  'GET /api/auth/csrf',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
]);

@Injectable()
export class FirstLoginGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user?.mustChangePassword) {
      return true;
    }

    const path = (request.originalUrl || request.url).split('?')[0];
    const routeKey = `${request.method.toUpperCase()} ${path}`;
    if (ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.has(routeKey)) {
      return true;
    }

    throw new ForbiddenException(
      'Password change is required before continuing',
    );
  }
}
