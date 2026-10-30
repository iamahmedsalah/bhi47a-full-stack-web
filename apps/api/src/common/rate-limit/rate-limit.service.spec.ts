import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/types/authenticated-request';
import type { AppLoggerService } from '../../core/logger/logger.service';
import { RateLimiterService } from './rate-limit.service';

function request(path: string, userId?: string): AuthenticatedRequest {
  return {
    method: 'POST',
    path,
    originalUrl: path,
    ip: '192.0.2.10',
    socket: { remoteAddress: '192.0.2.10' },
    headers: { 'accept-language': 'en' },
    body: {},
    ...(userId ? { user: { _id: userId } } : {}),
  } as unknown as AuthenticatedRequest;
}

describe('shared-network rate limiting', () => {
  let limiter: RateLimiterService;
  let res: Response;
  let blocks: jest.Mock;
  let setHeader: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-30T14:00:00Z') });
    blocks = jest.fn();
    limiter = new RateLimiterService(
      new ConfigService({ NODE_ENV: 'test', RATE_LIMIT_STORE: 'memory' }),
      { log: jest.fn(), warn: jest.fn() } as unknown as AppLoggerService,
      undefined,
      { recordRateLimitBlock: blocks } as never,
    );
    setHeader = jest.fn();
    status = jest.fn().mockReturnThis();
    res = { setHeader, status, json: jest.fn() } as unknown as Response;
  });
  afterEach(() => jest.useRealTimers());

  async function anonymous(req: Request): Promise<boolean> {
    const next = jest.fn();
    await limiter.apply(req, res, next);
    return next.mock.calls.length === 1;
  }

  it('allows 10,000 distinct accounts over 15 minutes through one campus IP', async () => {
    for (let index = 0; index < 10000; index++) {
      // 20 logins/sec, below the coarse network budget; no hashing/DB capacity claim.
      if (index % 20 === 0) jest.advanceTimersByTime(1000);
      const req = request('/api/auth/student/login');
      req.body = { studentCode: `student-${index}` };
      expect(await anonymous(req)).toBe(true);
    }
    expect(blocks).not.toHaveBeenCalled();
  });

  it('does not let nonce traffic lock out password users and still caps nonces', async () => {
    for (let index = 0; index < 1200; index++) {
      expect(await anonymous(request('/api/auth/google/nonce'))).toBe(true);
    }
    expect(await anonymous(request('/api/auth/google/nonce'))).toBe(false);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(blocks).toHaveBeenCalledWith('google-nonce');
    const login = request('/api/auth/student/login');
    login.body = { studentCode: 'separate-student' };
    expect(await anonymous(login)).toBe(true);
    jest.advanceTimersByTime(60000);
    expect(await anonymous(request('/api/auth/google/nonce'))).toBe(true);
  });

  it('keeps the account password budget across changing IPs', async () => {
    for (let index = 0; index < 9; index++) {
      const req = request('/api/auth/student/login');
      Object.defineProperty(req, 'ip', { value: `192.0.2.${index + 1}` });
      req.body = { studentCode: 'target-student' };
      expect(await anonymous(req)).toBe(index < 8);
    }
    expect(blocks).toHaveBeenCalledWith('student-login');
  });

  it('allows 10,000 students behind one IP to save and submit independently', async () => {
    for (let index = 0; index < 10000; index++) {
      await limiter.enforceAuthenticated(
        request('/api/students/me/quizzes/quiz/save-draft', `student-${index}`),
        res,
      );
      await limiter.enforceAuthenticated(
        request('/api/students/me/quizzes/quiz/submit', `student-${index}`),
        res,
      );
    }
    expect(blocks).not.toHaveBeenCalled();
  });

  it('separates draft saves, submission, and classmates; changing IP cannot reset a user budget', async () => {
    const draft = request(
      '/api/students/me/quizzes/quiz/save-draft',
      'student-a',
    );
    for (let index = 0; index < 60; index++)
      await limiter.enforceAuthenticated(draft, res);
    await expect(
      limiter.enforceAuthenticated(draft, res),
    ).rejects.toMatchObject({ status: 429 });
    await limiter.enforceAuthenticated(
      request('/api/students/me/quizzes/quiz/submit', 'student-a'),
      res,
    );
    await limiter.enforceAuthenticated(
      request('/api/students/me/quizzes/quiz/save-draft', 'student-b'),
      res,
    );
    const rotated = request(draft.path, 'student-a');
    Object.defineProperty(rotated, 'ip', { value: '203.0.113.50' });
    await expect(
      limiter.enforceAuthenticated(rotated, res),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('defers protected rules to the guard and refuses unverified identities', async () => {
    const req = request('/api/students/me/quizzes/quiz/submit');
    req.body = { userId: 'forged-student' };
    req.headers.authorization = 'Bearer unverified';
    expect(await anonymous(req)).toBe(true);
    await expect(limiter.enforceAuthenticated(req, res)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('retains the five-attempt Google OTP budget per verified user', async () => {
    const req = request('/api/auth/google/link/verify-otp', 'student-a');
    for (let index = 0; index < 5; index++)
      await limiter.enforceAuthenticated(req, res);
    await expect(limiter.enforceAuthenticated(req, res)).rejects.toMatchObject({
      status: 429,
    });
    expect(blocks).toHaveBeenCalledWith('google-verify-otp');
    await limiter.enforceAuthenticated(request(req.path, 'student-b'), res);
  });

  it('fails closed with 503 when the shared counter is unavailable', async () => {
    jest
      .spyOn(limiter.getStore(), 'increment')
      .mockRejectedValue(new Error('offline'));
    expect(await anonymous(request('/api/auth/google/nonce'))).toBe(false);
    expect(status).toHaveBeenCalledWith(503);
    await expect(
      limiter.enforceAuthenticated(
        request('/api/students/me/quizzes/q/submit', 'student'),
        res,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
