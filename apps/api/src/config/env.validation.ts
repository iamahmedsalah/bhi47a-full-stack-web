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
  const apiPort = readString(config, 'API_PORT');
  if (!apiPort) return;

  const parsed = Number(apiPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('API_PORT must be a valid TCP port');
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = readString(config, 'NODE_ENV') || 'development';

  validateJwtSecret(config);
  validateOptionalPort(config);

  if (nodeEnv === 'production') {
    requireValue(config, 'MONGODB_URI');
    requireValue(config, 'CLIENT_URL');
    requireValue(config, 'API_PORT');
  }

  return config;
}
