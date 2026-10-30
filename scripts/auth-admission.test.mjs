import assert from 'node:assert/strict';
import test from 'node:test';
import { trustedProxySources } from '../apps/api/src/config/trusted-proxy.ts';
import { findRateLimitRules } from '../apps/api/src/common/rate-limit/rate-limit.rules.ts';

test('rejects every zero-mask spelling instead of trusting the whole internet', () => {
  for (const source of ['0.0.0.0/0', '0.0.0.0/00', '127.0.0.1/000', '::/00']) {
    assert.throws(() => trustedProxySources(source));
  }
  assert.equal(trustedProxySources(), false);
  assert.deepEqual(trustedProxySources('127.0.0.1/32,::1/128'), ['127.0.0.1/32', '::1/128']);
});

test('Google route limits cannot shadow the stricter OTP budget', () => {
  const path = '/api/auth/google/link/verify-otp';
  const request = { method: 'POST', path, originalUrl: path, ip: '192.0.2.10', socket: { remoteAddress: '192.0.2.10' }, headers: { 'x-forwarded-for': 'attacker' } };
  const rules = findRateLimitRules(request);
  assert.deepEqual(rules.map((rule) => rule.name), ['google-link', 'google-verify-otp']);
  assert.ok(rules.every((rule) => rule.scope === 'authenticated'));
  assert.equal(rules.find((rule) => rule.name === 'google-verify-otp').max, Number(process.env.GOOGLE_OTP_RATE_LIMIT || 5));
});
