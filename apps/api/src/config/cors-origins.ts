function normalizeOriginPattern(pattern: string) {
  return pattern.trim().replace(/\/+$/, '');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseAllowedOrigins(rawOrigins: string) {
  return rawOrigins.split(',').map(normalizeOriginPattern).filter(Boolean);
}

export function isOriginAllowed(origin: string, allowedOrigins: string[]) {
  const normalizedOrigin = normalizeOriginPattern(origin);

  return allowedOrigins.some((allowedOrigin) => {
    if (!allowedOrigin.includes('*')) {
      return normalizedOrigin === allowedOrigin;
    }

    const pattern = escapeRegex(allowedOrigin).replace(/\\\*/g, '[^/]+');
    return new RegExp(`^${pattern}$`, 'i').test(normalizedOrigin);
  });
}
