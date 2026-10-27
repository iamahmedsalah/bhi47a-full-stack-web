import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  isOriginAllowed,
  parseAllowedOrigins,
} from '../../../config/cors-origins';

const BROWSER_AUTH = 'browser-auth';
export const BrowserAuth = () => SetMetadata(BROWSER_AUTH, true);
@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}
  canActivate(context: ExecutionContext) {
    if (
      !this.reflector.getAllAndOverride<boolean>(BROWSER_AUTH, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origins = parseAllowedOrigins(
      this.config.get<string>('CLIENT_URL', 'http://localhost:3000'),
    );
    if (!req.headers.origin || !isOriginAllowed(req.headers.origin, origins))
      throw new ForbiddenException('Authentication origin is not allowed');
    return true;
  }
}
