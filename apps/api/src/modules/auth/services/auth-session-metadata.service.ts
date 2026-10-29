import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isIP } from 'node:net';

export interface SessionMetadata {
  metadataVersion: number;
  ip?: string;
  userAgent?: string;
  device: 'mobile' | 'tablet' | 'computer' | 'unknown';
  browser?: string;
  os?: string;
  networkType?: string;
  location?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  locationSource?: 'vercel' | 'ipwhois';
}

export function parseSessionDevice(userAgent = '') {
  let os: string | undefined;
  if (/ipad/i.test(userAgent)) os = 'iPadOS';
  else if (/iphone|ipod/i.test(userAgent)) os = 'iOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macOS';
  else if (/cros/i.test(userAgent)) os = 'ChromeOS';
  else if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser: string | undefined;
  if (/edg(?:e|a|ios)?\//i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/opr\/|opera/i.test(userAgent)) browser = 'Opera';
  else if (/samsungbrowser/i.test(userAgent)) browser = 'Samsung Internet';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Safari';

  const device: SessionMetadata['device'] =
    /ipad|tablet/i.test(userAgent) ||
    (/android/i.test(userAgent) && !/mobile/i.test(userAgent))
      ? 'tablet'
      : /mobile|iphone|ipod/i.test(userAgent)
        ? 'mobile'
        : os
          ? 'computer'
          : 'unknown';
  return { os, browser, device };
}

function header(req: Request | undefined, name: string) {
  const value = req?.headers?.[name];
  return typeof value === 'string' ? value.slice(0, 512) : undefined;
}

export function isPublicSessionIp(ip: string) {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Global unicast only; excludes loopback, local, multicast and mapped addresses.
  return version === 6 && /^[23]/i.test(ip) && !/^2001:db8:/i.test(ip);
}

function coordinates(latitude: unknown, longitude: unknown) {
  if (
    latitude === null ||
    longitude === null ||
    !['number', 'string'].includes(typeof latitude) ||
    !['number', 'string'].includes(typeof longitude) ||
    latitude === undefined ||
    longitude === undefined ||
    latitude === '' ||
    longitude === ''
  )
    return {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng }
    : {};
}

@Injectable()
export class AuthSessionMetadataService {
  private readonly cache = new Map<
    string,
    { expires: number; value: Partial<SessionMetadata> }
  >();

  constructor(private readonly config: ConfigService) {}

  async resolve(req?: Request): Promise<SessionMetadata> {
    const onVercel = this.config.get<string>('VERCEL') === '1';
    // Express resolves req.ip using the configured proxy allowlist. Only Vercel's
    // own runtime may use its edge-overwritten IP and geolocation headers.
    const rawIp =
      (onVercel ? header(req, 'x-vercel-forwarded-for') : undefined) ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '';
    const ip = rawIp.replace(/^::ffff:/, '').trim();
    const userAgent = header(req, 'user-agent');
    const reportedNetwork = header(req, 'x-client-network-type');
    const metadata: SessionMetadata = {
      metadataVersion: 1,
      ...parseSessionDevice(userAgent),
      userAgent,
      ip: isIP(ip) ? ip : undefined,
      networkType: [
        'wifi',
        'cellular',
        'ethernet',
        'bluetooth',
        'wimax',
      ].includes(reportedNetwork ?? '')
        ? reportedNetwork
        : undefined,
    };
    if (!isPublicSessionIp(ip)) return metadata;

    if (onVercel) {
      const city = header(req, 'x-vercel-ip-city');
      const country = header(req, 'x-vercel-ip-country');
      if (city || country) {
        let decodedCity = city;
        try {
          decodedCity = city ? decodeURIComponent(city) : undefined;
        } catch {
          /* Keep the encoded name. */
        }
        return {
          ...metadata,
          location: decodedCity,
          country,
          ...coordinates(
            header(req, 'x-vercel-ip-latitude'),
            header(req, 'x-vercel-ip-longitude'),
          ),
          locationSource: 'vercel',
        };
      }
    }
    if (this.config.get<string>('SESSION_IP_LOOKUP_ENABLED', 'true') !== 'true')
      return metadata;
    const cached = this.cache.get(ip);
    if (cached && cached.expires > Date.now())
      return { ...metadata, ...cached.value };
    let value: Partial<SessionMetadata> = {};
    try {
      // Fixed HTTPS host and a validated IP: no caller-controlled URLs or private IP lookups.
      const response = await fetch(
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country_code,latitude,longitude,connection.isp`,
        {
          signal: AbortSignal.timeout(1500),
          redirect: 'error',
        },
      );
      if (response.ok) {
        const body = (await response.json()) as {
          success?: boolean;
          city?: unknown;
          country_code?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          connection?: { isp?: unknown };
        };
        if (body.success === true)
          value = {
            location:
              typeof body.city === 'string'
                ? body.city.slice(0, 160)
                : undefined,
            country:
              typeof body.country_code === 'string'
                ? body.country_code.slice(0, 2)
                : undefined,
            isp:
              typeof body.connection?.isp === 'string'
                ? body.connection.isp.slice(0, 160)
                : undefined,
            ...coordinates(body.latitude, body.longitude),
            locationSource: 'ipwhois',
          };
      }
    } catch {
      /* Metadata outages must not prevent a verified sign-in. */
    }
    if (this.cache.size >= 500)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(ip, {
      expires: Date.now() + (value.locationSource ? 3600000 : 60000),
      value,
    });
    return { ...metadata, ...value };
  }
}
