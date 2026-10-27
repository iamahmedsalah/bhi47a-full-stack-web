import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  ANY_PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { measureSynchronousStage } from '../../../core/metrics/request-query-context';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    return measureSynchronousStage('authorization.permissions', () =>
      this.check(context),
    );
  }

  private check(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredAnyPermissions = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasRequired = requiredPermissions && requiredPermissions.length > 0;
    const hasAnyRequired =
      requiredAnyPermissions && requiredAnyPermissions.length > 0;

    if (!hasRequired && !hasAnyRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Admin has all permissions
    if (user.role === 'admin') return true;

    if (hasRequired) {
      const hasAll = requiredPermissions.every((permission: string) =>
        user.permissions?.includes(permission),
      );
      if (!hasAll) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    if (hasAnyRequired) {
      const hasAny = requiredAnyPermissions.some((permission: string) =>
        user.permissions?.includes(permission),
      );
      if (!hasAny) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }
}
