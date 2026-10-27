import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthLoginService } from './auth-login.service';
import { AuthSessionService } from './auth-session.service';
import type { UsersService } from '../../users/users.service';
import type { EmailsService } from '../../emails/emails.service';
import type { AuthSessionStore } from './auth-session-store.service';

const userId = '507f1f77bcf86cd799439011';
const secret = 'passkey-regression-test-secret-at-least-32-bytes';

describe('existing password, Google and session contracts', () => {
  const jwt = new JwtService({ secret, signOptions: { expiresIn: '7d' } });
  const config = new ConfigService({
    NODE_ENV: 'production',
    COOKIE_SAME_SITE: 'none',
  });
  const user = {
    _id: userId,
    role: 'student',
    isActive: true,
    name: 'Test',
    studentCode: '2026001',
    email: 'test@example.com',
    googleId: 'verified-google-sub',
    googleEmail: 'test@example.com',
    googleLinkPending: false,
    mustChangePassword: false,
    tokenVersion: 3,
    permissions: ['courses.read'],
  };
  const users = {
    findById: jest.fn(),
    findByStudentCode: jest.fn(),
    findLinkedGoogleAccount: jest.fn(),
    validatePassword: jest.fn(),
    isAccountLocked: jest.fn(),
    resetAttemptsAndUpdateLastLogin: jest.fn(),
  };
  let sessions: AuthSessionService;
  let login: AuthLoginService;
  beforeEach(() => {
    jest.clearAllMocks();
    users.findById.mockResolvedValue(user);
    users.findByStudentCode.mockResolvedValue(user);
    users.findLinkedGoogleAccount.mockResolvedValue(user);
    users.validatePassword.mockResolvedValue(true);
    users.isAccountLocked.mockReturnValue(false);
    users.resetAttemptsAndUpdateLastLogin.mockResolvedValue(undefined);
    sessions = new AuthSessionService(
      users as unknown as UsersService,
      jwt,
      config,
      {
        register: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthSessionStore,
    );
    login = new AuthLoginService(
      users as unknown as UsersService,
      sessions,
      jwt,
      config,
      {} as EmailsService,
    );
    // Provider transport is mocked; real Google credentials are a staging check.
    jest
      .spyOn(
        login as unknown as {
          verifyGoogleCredential: (
            credential: string,
          ) => Promise<{ googleId: string; email: string }>;
        },
        'verifyGoogleCredential',
      )
      .mockResolvedValue({ googleId: user.googleId, email: user.googleEmail });
  });
  it('keeps student password claims and identity', async () => {
    const result = await login.studentLogin({
      studentCode: user.studentCode,
      password: 'current-password',
    });
    expect(jwt.verify(result.token)).toEqual(
      expect.objectContaining({
        sub: userId,
        role: 'student',
        tokenVersion: 3,
      }),
    );
    expect(result.user._id).toBe(userId);
  });
  it('keeps verified linked Google identity, authorization and token semantics', async () => {
    const result = await login.googleLogin('mock-google-credential');
    expect(result.user._id).toBe(userId);
    expect(result.user.permissions).toEqual(user.permissions);
    expect(jwt.verify(result.token)).toEqual(
      expect.objectContaining({
        sub: userId,
        role: 'student',
        tokenVersion: 3,
      }),
    );
    expect(users.findLinkedGoogleAccount).toHaveBeenCalledWith({
      googleId: user.googleId,
      googleEmail: user.googleEmail,
    });
  });
  it('never creates an account for an unlinked Google identity', async () => {
    users.findLinkedGoogleAccount.mockResolvedValue(null);
    await expect(login.googleLogin('unlinked')).rejects.toThrow();
    expect(users.resetAttemptsAndUpdateLastLogin).not.toHaveBeenCalled();
  });
  it.each([
    { googleId: 'different-subject' },
    { isActive: false },
    { role: 'admin' },
  ])(
    'rejects a verified Google credential against incompatible stored policy %j',
    async (policy) => {
      users.findLinkedGoogleAccount.mockResolvedValue({ ...user, ...policy });
      await expect(
        login.googleLogin('synthetic-google-credential'),
      ).rejects.toThrow();
      expect(users.resetAttemptsAndUpdateLastLogin).not.toHaveBeenCalled();
    },
  );
  it('reuses activity and token issuance for credential login', async () => {
    const result = await sessions.completeCredentialLogin(user as never);
    expect(users.resetAttemptsAndUpdateLastLogin).toHaveBeenCalledWith(userId);
    expect(jwt.verify(result.token).sub).toBe(userId);
    expect(result.user).not.toHaveProperty('passwordHash');
  });
  it('preserves Secure, HttpOnly and SameSite plus CSRF refresh and logout cookie behavior', async () => {
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const res = { cookie, clearCookie } as unknown as Response;
    const token = sessions.generateToken(userId, 'student', 3);
    const csrf = await sessions.setCookieToken(res, token);
    expect(cookie).toHaveBeenCalledWith(
      'access_token',
      token,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'csrf_token',
      csrf,
      expect.objectContaining({ httpOnly: false, secure: true }),
    );
    expect(sessions.refreshCsrfToken(res)).not.toBe(csrf);
    sessions.clearCookieToken(res);
    expect(clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.objectContaining({ httpOnly: false }),
    );
  });
});
