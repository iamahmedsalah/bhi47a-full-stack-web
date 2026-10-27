import {
  CORS_BLOCKED_ERROR_PREFIX,
  isCorsBlockedError,
  isOriginAllowed,
  parseAllowedOrigins,
} from './cors-origins';

describe('CORS origin matching', () => {
  const origins = parseAllowedOrigins(
    'http://localhost:3000, https://bhi47a-support.vercel.app/, https://bhi47a-support-*.vercel.app',
  );

  it('allows exact origins and rejects wildcard Vercel preview origins', () => {
    expect(isOriginAllowed('http://localhost:3000', origins)).toBe(true);
    expect(isOriginAllowed('https://bhi47a-support.vercel.app', origins)).toBe(
      true,
    );
    expect(
      isOriginAllowed(
        'https://bhi47a-support-a7tl1k4ds-iamahmedsalahs-projects.vercel.app',
        origins,
      ),
    ).toBe(false);
  });

  it('rejects unrelated and suffix-confusion origins', () => {
    expect(isOriginAllowed('https://attacker.vercel.app', origins)).toBe(false);
    expect(
      isOriginAllowed(
        'https://bhi47a-support-preview.vercel.app.evil.test',
        origins,
      ),
    ).toBe(false);
  });

  it('classifies only the shared CORS rejection error', () => {
    expect(
      isCorsBlockedError(
        new Error(`${CORS_BLOCKED_ERROR_PREFIX}: https://attacker.test`),
      ),
    ).toBe(true);
    expect(isCorsBlockedError(new Error('Database unavailable'))).toBe(false);
    expect(isCorsBlockedError('CORS blocked')).toBe(false);
  });
});
