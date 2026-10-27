export const CORS_BLOCKED_ERROR_PREFIX = 'CORS blocked';

function normalizeOriginPattern(pattern: string) {
  return pattern.trim().replace(/\/+$/, '');
}

export function parseAllowedOrigins(rawOrigins: string) {
  return rawOrigins
    .split(',')
    .map(normalizeOriginPattern)
    .filter((origin) => {
      if (!origin || origin.includes('*')) return false;
      try {
        const url = new URL(origin);
        return (
          ['https:', 'http:'].includes(url.protocol) && url.origin === origin
        );
      } catch {
        return false;
      }
    });
}

export function isOriginAllowed(origin: string, allowedOrigins: string[]) {
  const normalizedOrigin = normalizeOriginPattern(origin);

  return allowedOrigins.some((allowedOrigin) => {
    return !allowedOrigin.includes('*') && normalizedOrigin === allowedOrigin;
  });
}

export function isCorsBlockedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(CORS_BLOCKED_ERROR_PREFIX)
  );
}
