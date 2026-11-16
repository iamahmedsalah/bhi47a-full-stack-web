import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';

describe('JWT parallel validation', () => {
  const payload = {
    sub: '507f1f77bcf86cd799439011',
    role: 'staff',
    tokenVersion: 3,
    iat: 1,
    exp: 2,
  };
  const request = { cookies: { access_token: 'synthetic' } } as Request;

  function setup() {
    const account = {
      _id: payload.sub,
      role: 'staff',
      isActive: true,
      tokenVersion: 3,
      permissions: ['control.read'],
    };
    const findByIdForAuth = jest.fn().mockResolvedValue(account);
    const assertActive = jest.fn().mockResolvedValue(undefined);
    const strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'test-secret' }),
      { findByIdForAuth } as never,
      { assertActive } as never,
    );
    return { strategy, findByIdForAuth, assertActive, account };
  }

  it('starts both reads before the session read finishes', async () => {
    const test = setup();
    let complete!: () => void;
    test.assertActive.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const validation = test.strategy.validate(request, payload);
    expect(test.findByIdForAuth).toHaveBeenCalledWith(payload.sub);
    complete();
    await expect(validation).resolves.toMatchObject({
      permissions: ['control.read'],
    });
    test.account.permissions = [];
    await expect(
      test.strategy.validate(request, payload),
    ).resolves.toMatchObject({ permissions: [] });
    expect(test.findByIdForAuth).toHaveBeenCalledTimes(2);
  });

  it('rejects a revoked session even if the account is valid', async () => {
    const test = setup();
    test.assertActive.mockRejectedValueOnce(
      new UnauthorizedException('revoked'),
    );
    await expect(
      test.strategy.validate(request, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects changed token versions and inactive accounts', async () => {
    const test = setup();
    test.account.tokenVersion++;
    await expect(
      test.strategy.validate(request, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    test.account.tokenVersion = 3;
    test.account.isActive = false;
    await expect(
      test.strategy.validate(request, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
