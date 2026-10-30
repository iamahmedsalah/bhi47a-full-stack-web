import type { Request } from 'express';
import { findRateLimitRule, findRateLimitRules } from './rate-limit.rules';

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
  it.each([
    '/api/auth/passkeys/login/options',
    '/api/auth/passkeys/login/verify',
  ])('rate limits %s without trusting forwarded-for', (path) => {
    const first = buildRequest(path, {});
    const second = buildRequest(path, {});
    second.headers['x-forwarded-for'] = '198.51.100.99';
    const rule = findRateLimitRule(first);
    expect(rule?.name).toBe('passkeys');
    expect(rule?.keyGenerator?.(first)).toBe('10.0.0.1');
    expect(rule?.keyGenerator?.(second)).toBe('10.0.0.1');
  });
  it('gives nonce preparation its own budget without spending login attempts', () => {
    const rules = findRateLimitRules(
      buildRequest('/api/auth/google/nonce', {}),
    );
    expect(rules.map((rule) => rule.name)).toEqual(['google-nonce']);
  });

  it('preserves both per-account password limits and a coarse network limit', () => {
    const rules = findRateLimitRules(
      buildRequest('/api/auth/student/login', { studentCode: '2026001' }),
    );
    expect(rules.map((rule) => rule.name)).toEqual([
      'auth-ip',
      'student-login',
    ]);
    expect(rules[0].windowMs).toBe(60000);
    expect(rules[1].windowMs).toBe(15 * 60000);
  });

  it.each([
    '/api/auth/passkeys/reauthenticate',
    '/api/auth/passkeys/register/options',
    '/api/auth/passkeys/register/verify',
  ])('uses authenticated budgets for %s', (path) => {
    const rules = findRateLimitRules(buildRequest(path, {}));
    expect(rules.map((rule) => rule.name)).toEqual(['passkey-security']);
    expect(rules[0].scope).toBe('authenticated');
  });

  it('applies both authenticated Google linking and stricter OTP limits', () => {
    const rules = findRateLimitRules(
      buildRequest('/api/auth/google/link/verify-otp', {}),
    );
    expect(rules.map((rule) => rule.name)).toEqual([
      'google-link',
      'google-verify-otp',
    ]);
    expect(rules.every((rule) => rule.scope === 'authenticated')).toBe(true);
  });
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
    expect(rule!.keyGenerator?.(req)).toBe('10.0.0.1');
  });
});
