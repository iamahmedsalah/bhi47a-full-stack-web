import type { Request } from 'express';
import { findRateLimitRule } from './rate-limit.rules';

function buildRequest(path: string, body: Record<string, unknown>): Request {
  return {
    method: 'POST',
    path,
    originalUrl: path,
    headers: { 'x-forwarded-for': '203.0.113.7' },
    body,
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
  } as unknown as Request;
}

describe('rate limit rules - password recovery keys', () => {
  it.each(['/api/auth/forgot-password', '/api/auth/reset-password-otp'])(
    'keys %s on the target identifier so rotating IPs cannot bypass it',
    (path) => {
      const first = buildRequest(path, { identifier: ' 2026001 ' });
      const second = buildRequest(path, { identifier: '2026001' });
      second.headers['x-forwarded-for'] = '198.51.100.99';

      const rule = findRateLimitRule(first);
      expect(rule).toBeDefined();
      expect(rule!.keyGenerator?.(first)).toBe('2026001');
      expect(rule!.keyGenerator?.(second)).toBe('2026001');
    },
  );

  it('falls back to the client IP when no identifier is sent', () => {
    const req = buildRequest('/api/auth/reset-password-otp', {});
    const rule = findRateLimitRule(req);
    expect(rule!.keyGenerator?.(req)).toBe('203.0.113.7');
  });
});
