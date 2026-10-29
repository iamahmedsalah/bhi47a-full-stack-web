import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/public.decorator';

describe('request-local JWT validation reuse', () => {
  const reflector = new Reflector();
  const handler = () => undefined;
  const context = (request: object) =>
    ({
      getHandler: () => handler,
      getClass: () => JwtAuthGuard,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;
  const principal = { _id: 'fixture-user', role: 'student' };
  let authenticate: jest.SpyInstance;
  beforeEach(() => {
    authenticate = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockImplementation((ctx) => {
        ctx.switchToHttp().getRequest<{ user?: object }>().user = principal;
        return Promise.resolve(true);
      });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteMetadata(IS_PUBLIC_KEY, handler);
    Reflect.deleteMetadata(IS_OPTIONAL_AUTH_KEY, handler);
  });

  it('shares validation between global and controller instances on the same request', async () => {
    const ctx = context({ cookies: { access_token: 'fixture-token' } });
    await new JwtAuthGuard(reflector).canActivate(ctx);
    await new JwtAuthGuard(reflector).canActivate(ctx);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it('never reuses authentication across requests, even with the same cookie', async () => {
    const guard = new JwtAuthGuard(reflector);
    await guard.canActivate(
      context({ cookies: { access_token: 'same-token' } }),
    );
    authenticate.mockRejectedValueOnce(new UnauthorizedException('Revoked'));
    await expect(
      guard.canActivate(context({ cookies: { access_token: 'same-token' } })),
    ).rejects.toThrow('Revoked');
    expect(authenticate).toHaveBeenCalledTimes(2);
  });
  it('does not trust a preexisting principal and revalidates changed cookies/principals', async () => {
    const request = {
      cookies: { access_token: 'one' },
      user: { forged: true } as object,
    };
    const guard = new JwtAuthGuard(reflector);
    const ctx = context(request);
    await guard.canActivate(ctx);
    expect(request.user).toBe(principal);
    request.cookies.access_token = 'two';
    await guard.canActivate(ctx);
    request.user = { forged: true };
    await guard.canActivate(ctx);
    expect(authenticate).toHaveBeenCalledTimes(3);
  });
  it('coalesces concurrent validations without caching a failure', async () => {
    const guard = new JwtAuthGuard(reflector);
    const ctx = context({ cookies: { access_token: 'one' } });
    authenticate.mockRejectedValueOnce(new UnauthorizedException('Invalid'));
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid');
    await Promise.all([guard.canActivate(ctx), guard.canActivate(ctx)]);
    expect(authenticate).toHaveBeenCalledTimes(2);
  });
  it('preserves public and optional authentication and fails closed on storage errors', async () => {
    const guard = new JwtAuthGuard(reflector);
    const ctx = context({});
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
    Reflect.deleteMetadata(IS_PUBLIC_KEY, handler);
    Reflect.defineMetadata(IS_OPTIONAL_AUTH_KEY, true, handler);
    authenticate.mockRejectedValueOnce(new UnauthorizedException());
    expect(await guard.canActivate(ctx)).toBe(true);
    authenticate.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(guard.canActivate(ctx)).rejects.toThrow('Storage unavailable');
  });
});
