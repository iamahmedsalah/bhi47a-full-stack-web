import type { ConfigService } from '@nestjs/config';

export function readPasskeyConfig(config: ConfigService) {
  const enabled = config.get<string>('PASSKEYS_ENABLED') === 'true';
  if (!enabled)
    return { enabled: false as const, rpID: '', origins: [] as string[] };
  const rpID = config.get<string>('PASSKEY_RP_ID', '').trim();
  const origins = config
    .get<string>('PASSKEY_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // WEB_BASE_URL is an explicitly configured trusted origin. Include it when
  // it is within this RP, so a canonical DNS change does not leave reauth on
  // an outdated origin list. Never infer trust from request headers.
  const canonical = config
    .get<string>('WEB_BASE_URL', '')
    .trim()
    .replace(/\/+$/, '');
  if (canonical) {
    const url = new URL(canonical);
    if (
      url.origin === canonical &&
      (url.hostname === rpID || url.hostname.endsWith(`.${rpID}`)) &&
      !origins.includes(canonical)
    )
      origins.push(canonical);
  }
  if (
    !rpID ||
    !origins.length ||
    !/^[a-z0-9.-]+$/.test(rpID) ||
    rpID.includes('..')
  ) {
    throw new Error('Passkeys require an explicit RP ID and exact origins');
  }
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      origin.includes('*') ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          url.hostname === 'localhost' &&
          rpID === 'localhost'
        )) ||
      (url.hostname !== rpID && !url.hostname.endsWith(`.${rpID}`)) ||
      (config.get<string>('NODE_ENV') === 'production' &&
        url.protocol !== 'https:')
    ) {
      throw new Error('Invalid passkey origin or RP ID relationship');
    }
  }
  // Exact website host only: prevents public-suffix and overly broad parent RP configuration.
  if (!origins.some((origin) => new URL(origin).hostname === rpID)) {
    throw new Error('RP ID must match an explicitly configured website host');
  }
  return { enabled: true as const, rpID, origins };
}
