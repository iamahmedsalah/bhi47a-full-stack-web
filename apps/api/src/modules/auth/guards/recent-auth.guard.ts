import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RecentAuthService } from '../services/recent-auth.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';

export const SENSITIVE_OPERATION = 'sensitive-operation';
export const SensitiveOperation = (operation: string) =>
  SetMetadata(SENSITIVE_OPERATION, operation);

@Injectable()
export class RecentAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly recent: RecentAuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const operation = this.reflector.getAllAndOverride<string>(
      SENSITIVE_OPERATION,
      [context.getHandler(), context.getClass()],
    );
    if (!operation) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const concrete = operation.endsWith(':id')
      ? operation.replace(/:id$/, `:${String(req.params.id)}`)
      : operation;
    await this.recent.require(
      req.user!._id,
      req.cookies?.access_token,
      concrete,
    );
    return true;
  }
}
