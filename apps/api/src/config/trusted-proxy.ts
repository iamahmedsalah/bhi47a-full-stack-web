import { isIP } from 'node:net';

export function trustedProxySources(raw?: string): false | string[] {
  if (!raw?.trim()) return false;
  const sources = raw.split(',').map((value) => value.trim());
  for (const source of sources) {
    const [address, mask, extra] = source.split('/');
    const version = isIP(address);
    if (
      !version ||
      extra !== undefined ||
      (mask !== undefined &&
        (!/^\d+$/.test(mask) || Number(mask) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        'TRUST_PROXY_CIDRS must contain explicit IP addresses or CIDRs',
      );
    if (Number(mask) === 0)
      throw new Error('Trusting every proxy is prohibited');
  }
  return sources;
}
