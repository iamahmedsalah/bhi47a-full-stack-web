import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthLoginService } from '../modules/auth/services/auth-login.service';
import { UsersService } from '../modules/users/users.service';
import { getClientIp } from '../common/rate-limit/rate-limit.rules';
import { isOriginAllowed } from '../config/cors-origins';

describe('confirmed containment regressions', () => {
  it.each([
    { aud: 'attacker-client' },
    { iss: 'https://evil.example' },
    { exp: 1 },
    { email_verified: false },
    { sub: '' },
    { nonce: undefined },
  ])(
    'rejects invalid Google ID claims %j even after SDK verification',
    async (invalid) => {
      const nonce = {
        consumeGoogleNonce: jest.fn().mockResolvedValue(undefined),
      };
      const login = new AuthLoginService(
        {} as never,
        {} as never,
        {} as never,
        new ConfigService({
          GOOGLE_CLIENT_ID: 'expected.apps.googleusercontent.com',
        }),
        {} as never,
        undefined,
        nonce as never,
      );
      const internal = login as unknown as {
        googleOAuthClient: { verifyIdToken: ReturnType<typeof jest.fn> };
        verifyGoogleCredential: (
          value: string,
          flow: unknown,
        ) => Promise<unknown>;
      };
      const payload = {
        sub: 'verified-subject',
        email: 'synthetic@example.com',
        email_verified: true,
        aud: 'expected.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce: 'synthetic-nonce',
        ...invalid,
      };
      const verify = jest
        .spyOn(internal.googleOAuthClient as any, 'verifyIdToken')
        .mockResolvedValue({ getPayload: () => payload });
      try {
        await expect(
          internal.verifyGoogleCredential('synthetic-id-token', {
            flowId: 'flow',
            proof: 'proof',
            origin: 'http://localhost:3000',
          }),
        ).rejects.toThrow();
      } finally {
        verify.mockRestore();
      }
    },
  );
  it('does not trust a caller supplied forwarded-for address', () => {
    const request = {
      headers: { 'x-forwarded-for': 'attacker' },
      ip: '192.0.2.10',
      socket: { remoteAddress: '192.0.2.10' },
    } as unknown as Request;
    expect(getClientIp(request)).toBe('192.0.2.10');
  });

  it('never grants credentialed wildcard preview origins', () => {
    expect(
      isOriginAllowed('https://preview.example.com', ['https://*.example.com']),
    ).toBe(false);
  });

  it('looks up a Google login only by immutable subject', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const users = new UsersService({ findOne } as never);
    await users.findLinkedGoogleAccount({
      googleId: 'verified-subject',
      googleEmail: 'reassigned@example.com',
    });
    expect(findOne).toHaveBeenCalledWith({ googleId: 'verified-subject' });
  });

  it('does not rescue a rejected ID token with a bearer userinfo lookup', async () => {
    const login = new AuthLoginService(
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({
        GOOGLE_CLIENT_ID: 'expected.apps.googleusercontent.com',
      }),
      {} as never,
    );
    const internal = login as unknown as {
      googleOAuthClient: { verifyIdToken: ReturnType<typeof jest.fn> };
      verifyGoogleCredential: (value: string) => Promise<unknown>;
    };
    const verify = jest
      .spyOn(internal.googleOAuthClient as any, 'verifyIdToken')
      .mockRejectedValue(new Error('Invalid audience'));
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sub: 'subject',
          email: 'verified@example.com',
          email_verified: true,
        }),
    } as Response);
    try {
      await expect(
        internal.verifyGoogleCredential('invalid-id-token'),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'expected.apps.googleusercontent.com',
        }),
      );
    } finally {
      verify.mockRestore();
      fetch.mockRestore();
    }
  });
});
