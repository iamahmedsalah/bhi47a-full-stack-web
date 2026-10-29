import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  IS_PUBLIC_IN_DEV_KEY,
  IS_OPTIONAL_AUTH_KEY,
} from '../decorators/public.decorator';

interface RequestValidation {
  token: unknown;
  principal: unknown;
  pending: Promise<boolean>;
}
// Global and controller guards can be distinct instances. Only a successful,
// unchanged authentication on this exact request may be reused by either one.
const requestValidations = new WeakMap<object, RequestValidation>();

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
        await this.authenticateRequest(context);
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
        // Missing/invalid token: continue anonymously; handler enforces policy.
      }
      return true;
    }

    return this.authenticateRequest(context);
  }

  private authenticateRequest(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: { access_token?: unknown };
      user?: unknown;
    }>();
    const token = request.cookies?.access_token;
    const previous = requestValidations.get(request);
    if (
      previous &&
      previous.token === token &&
      previous.principal === request.user
    ) {
      return previous.pending;
    }
    const validation: RequestValidation = {
      token,
      principal: request.user,
      pending: Promise.resolve(false),
    };
    // Start after installing the entry so synchronous failures are evicted too.
    validation.pending = Promise.resolve().then(async () => {
      try {
        const allowed = await (super.canActivate(context) as Promise<boolean>);
        if (allowed && request.user) {
          validation.principal = request.user;
        } else if (requestValidations.get(request) === validation) {
          requestValidations.delete(request);
        }
        return allowed;
      } catch (error) {
        if (requestValidations.get(request) === validation)
          requestValidations.delete(request);
        throw error;
      }
    });
    requestValidations.set(request, validation);
    return validation.pending;
  }
}
