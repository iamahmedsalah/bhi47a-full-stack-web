const PLACEHOLDER_VALUES = new Set([
  'fallback-secret',
  'your-jwt-secret-change-this',
  'change-me',
  'changeme',
  'secret',
]);

function readString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const normalized = `${value}`.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requireValue(config: Record<string, unknown>, key: string): string {
  const value = readString(config, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function validateJwtSecret(config: Record<string, unknown>) {
  const secret = requireValue(config, 'JWT_SECRET');
  const lower = secret.toLowerCase();

  if (PLACEHOLDER_VALUES.has(lower)) {
    throw new Error('JWT_SECRET uses an unsafe placeholder value');
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes');
  }
}

function validateOptionalPort(config: Record<string, unknown>) {
  const apiPort = readString(config, 'API_PORT') ?? readString(config, 'PORT');
  if (!apiPort) return;

  const parsed = Number(apiPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('API_PORT must be a valid TCP port');
  }
}

function validateGoogleClientIds(config: Record<string, unknown>) {
  const apiClientId = readString(config, 'GOOGLE_CLIENT_ID');
  const webClientId = readString(config, 'NEXT_PUBLIC_GOOGLE_CLIENT_ID');

  if (apiClientId && webClientId && apiClientId !== webClientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID must match',
    );
  }
}

function validateEmailProvider(
  config: Record<string, unknown>,
  nodeEnv: string,
) {
  const hasResend = !!readString(config, 'RESEND_API_KEY');
  const hasSmtpUser = !!readString(config, 'SMTP_USER');
  const hasSmtpPass = !!readString(config, 'SMTP_PASS');

  if (hasSmtpUser !== hasSmtpPass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured together');
  }

  const smtpPort = readString(config, 'SMTP_PORT');
  if (smtpPort) {
    const parsed = Number(smtpPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error('SMTP_PORT must be a valid TCP port');
    }
  }

  if (nodeEnv === 'production' && !hasResend && !(hasSmtpUser && hasSmtpPass)) {
    throw new Error(
      'Production requires SMTP_USER/SMTP_PASS or RESEND_API_KEY',
    );
  }
}

function validateCookieConfig(
  config: Record<string, unknown>,
  nodeEnv: string,
) {
  const sameSite = (
    readString(config, 'COOKIE_SAME_SITE') ?? 'lax'
  ).toLowerCase();
  const clientUrl = readString(config, 'CLIENT_URL') ?? '';

  if (nodeEnv !== 'production') return;

  // Detect cross-origin deployment: web and API on different hosts.
  // *.vercel.app subdomains are always cross-origin to each other.
  // In that case the browser will refuse to send SameSite=Lax cookies on
  // XHR/fetch requests, which causes 401s on every authenticated API call
  // immediately after login.
  const hasVercelWebOrigin = clientUrl
    .split(',')
    .map((u) => u.trim())
    .some((u) => u.includes('vercel.app') || u.startsWith('https://'));

  if (hasVercelWebOrigin && sameSite !== 'none') {
    throw new Error(
      'COOKIE_SAME_SITE must be "none" when the web and API are on different ' +
        'origins (e.g. separate *.vercel.app domains or any cross-origin setup). ' +
        'With SameSite=Lax the browser will not send cookies on XHR/fetch ' +
        'requests, causing 401s on every authenticated API call after login. ' +
        'Set COOKIE_SAME_SITE=none in the API Vercel environment variables.',
    );
  }
}

function validateWebBaseUrl(config: Record<string, unknown>, nodeEnv: string) {
  const webBaseUrl = readString(config, 'WEB_BASE_URL');

  if (!webBaseUrl) {
    if (nodeEnv === 'production') {
      throw new Error(
        'WEB_BASE_URL is required in production so attendance QR links point to the web app',
      );
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(webBaseUrl);
  } catch {
    throw new Error('WEB_BASE_URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('WEB_BASE_URL must use http or https');
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = readString(config, 'NODE_ENV') || 'development';

  validateJwtSecret(config);
  validateOptionalPort(config);
  validateGoogleClientIds(config);
  validateEmailProvider(config, nodeEnv);
  validateCookieConfig(config, nodeEnv);
  validateWebBaseUrl(config, nodeEnv);

  if (nodeEnv === 'production') {
    requireValue(config, 'MONGODB_URI');
    requireValue(config, 'CLIENT_URL');
    if (!readString(config, 'API_PORT') && !readString(config, 'PORT')) {
      throw new Error('API_PORT or PORT is required');
    }
  }

  return config;
}
