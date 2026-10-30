import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/types/authenticated-request';
import { RateLimiterService } from './rate-limit.service';

/** Register after JWT, CSRF and authorization guards. */
@Injectable()
export class AuthenticatedRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    await this.rateLimiter.enforceAuthenticated(
      http.getRequest<AuthenticatedRequest>(),
      http.getResponse<Response>(),
    );
    return true;
  }
}
