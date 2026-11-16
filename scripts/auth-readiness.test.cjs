const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkAuthReadiness, validateAuthResponse } = require('./auth-readiness.cjs');

test('capability readiness accepts enabled and disabled policies but rejects database failures', () => {
  for (const enabled of [true, false]) {
    assert.equal(validateAuthResponse('capabilities', 200, { success: true, data: { enabled, studentLoginEnabled: false } }), true);
  }
  for (const status of [401, 500, 503]) {
    assert.equal(validateAuthResponse('capabilities', status, { success: false }), false);
    assert.equal(validateAuthResponse('anonymous-session', status, { success: false, statusCode: status }), status === 401);
  }
  assert.equal(validateAuthResponse('capabilities', 200, { enabled: true }), false);
});

test('smoke test uses anonymous read-only requests without login or session credentials', async () => {
  const calls = [];
  await checkAuthReadiness('https://example.test', async (url, options) => {
    calls.push({ url: String(url), options });
    return url.pathname.endsWith('/me')
      ? { status: 401, json: async () => ({ success: false, statusCode: 401 }) }
      : { status: 200, json: async () => ({ success: true, data: { enabled: true, studentLoginEnabled: true } }) };
  });
  assert.equal(calls.length, 2);
  for (const { options } of calls) {
    assert.equal(options.method, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.body, undefined);
  }
});

test('a successful public page cannot mask failed authentication database access', async () => {
  await assert.rejects(checkAuthReadiness('https://example.test', async () => ({ status: 500, json: async () => ({ success: false }) })), /capabilities.*HTTP 500/);
});
