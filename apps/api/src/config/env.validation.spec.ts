import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('rejects missing JWT_SECRET', () => {
    expect(() => validateEnv({})).toThrow('JWT_SECRET is required');
  });

  it('rejects placeholder JWT_SECRET values', () => {
    expect(() => validateEnv({ JWT_SECRET: 'fallback-secret' })).toThrow(
      'JWT_SECRET uses an unsafe placeholder value',
    );
  });

  it('rejects short JWT_SECRET values', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short-secret' })).toThrow(
      'JWT_SECRET must be at least 32 bytes',
    );
  });

  it('requires production database and client settings', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        API_PORT: '4000',
        RESEND_API_KEY: 're_test_key_123',
        WEB_BASE_URL: 'https://portal.example.edu',
      }),
    ).toThrow('MONGODB_URI is required');
  });

  it('accepts a valid production config', () => {
    expect(
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        MONGODB_URI: 'mongodb://localhost:27017/student-portal',
        CLIENT_URL: 'https://portal.example.edu',
        WEB_BASE_URL: 'https://portal.example.edu',
        COOKIE_SAME_SITE: 'none',
        API_PORT: '4000',
        RESEND_API_KEY: 're_test_key_123',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
    });
  });

  it('requires WEB_BASE_URL in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        MONGODB_URI: 'mongodb://localhost:27017/student-portal',
        CLIENT_URL: 'https://portal.example.edu',
        COOKIE_SAME_SITE: 'none',
        API_PORT: '4000',
        RESEND_API_KEY: 're_test_key_123',
      }),
    ).toThrow('WEB_BASE_URL is required in production');
  });

  it('rejects a non-HTTP WEB_BASE_URL', () => {
    expect(() =>
      validateEnv({
        JWT_SECRET: 'a'.repeat(32),
        WEB_BASE_URL: 'javascript:alert(1)',
      }),
    ).toThrow('WEB_BASE_URL must use http or https');
  });
});
