function validateAuthResponse(kind, status, body) {
  if (kind === 'capabilities') {
    return status === 200 && body?.success === true &&
      typeof body.data?.enabled === 'boolean' &&
      typeof body.data?.studentLoginEnabled === 'boolean';
  }
  // An anonymous request must be rejected normally, not crash with a 5xx.
  return kind === 'anonymous-session' && status === 401 &&
    body?.success === false && body.statusCode === 401;
}

async function checkAuthReadiness(base, request = fetch) {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Expected a public HTTP origin without credentials');
  }
  const checks = [
    ['capabilities', '/api/auth/passkeys/capabilities'],
    ['anonymous-session', '/api/auth/me'],
  ];
  for (const [kind, path] of checks) {
    const response = await request(new URL(path, url), {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    let body;
    try { body = await response.json(); } catch { /* Report only status/path. */ }
    if (!validateAuthResponse(kind, response.status, body)) {
      throw new Error(`${path}: authentication readiness failed (HTTP ${response.status})`);
    }
    console.log(`PASS ${kind}`);
  }
}

if (require.main === module) {
  checkAuthReadiness(process.argv[2]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { checkAuthReadiness, validateAuthResponse };
