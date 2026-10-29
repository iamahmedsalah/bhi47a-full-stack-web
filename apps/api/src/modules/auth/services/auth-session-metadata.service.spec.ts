import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  AuthSessionMetadataService,
  isPublicSessionIp,
  parseSessionDevice,
} from './auth-session-metadata.service';

const request = (ip: string, headers: Record<string, string> = {}) =>
  ({ ip, headers }) as Request;

describe('session device and network metadata', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0',
      'Windows',
      'Microsoft Edge',
      'computer',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15 Safari/604.1',
      'iOS',
      'Safari',
      'mobile',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0) Version/18.0 Mobile/15 Safari/604.1',
      'iPadOS',
      'Safari',
      'tablet',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',
      'Android',
      'Google Chrome',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36',
      'Android',
      'Google Chrome',
      'tablet',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605',
      'macOS',
      'Safari',
      'computer',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64) Chrome/130.0',
      'ChromeOS',
      'Google Chrome',
      'computer',
    ],
  ])(
    'parses %s without inventing a Windows version',
    (ua, os, browser, device) => {
      expect(parseSessionDevice(ua)).toEqual({ os, browser, device });
    },
  );
  it('leaves unknown device and browser values unknown', () => {
    expect(parseSessionDevice()).toEqual({
      os: undefined,
      browser: undefined,
      device: 'unknown',
    });
  });
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
    'not-an-ip',
  ])('does not look up non-public address %s', (ip) => {
    expect(isPublicSessionIp(ip)).toBe(false);
  });
  it('uses trusted Express IP, ignores forged forwarded/geo headers and never treats speed as connection type', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new AuthSessionMetadataService(
      new ConfigService({ SESSION_IP_LOOKUP_ENABLED: 'false' }),
    );
    const metadata = await service.resolve(
      request('::ffff:192.168.1.2', {
        'x-forwarded-for': '8.8.8.8',
        'x-vercel-forwarded-for': '8.8.4.4',
        'x-vercel-ip-city': 'Cairo',
        'x-client-network-type': '4g',
      }),
    );
    expect(metadata.ip).toBe('192.168.1.2');
    expect(metadata.location).toBeUndefined();
    expect(metadata.networkType).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses Vercel edge metadata only on Vercel, with real session coordinates', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new AuthSessionMetadataService(
      new ConfigService({ VERCEL: '1' }),
    );
    const metadata = await service.resolve(
      request('127.0.0.1', {
        'x-vercel-forwarded-for': '8.8.8.8',
        'x-vercel-ip-city': 'Alexandria',
        'x-vercel-ip-country': 'EG',
        'x-vercel-ip-latitude': '31.2',
        'x-vercel-ip-longitude': '29.9',
        'x-client-network-type': 'cellular',
      }),
    );
    expect(metadata).toMatchObject({
      ip: '8.8.8.8',
      location: 'Alexandria',
      country: 'EG',
      latitude: 31.2,
      longitude: 29.9,
      networkType: 'cellular',
      locationSource: 'vercel',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses bounded HTTPS public-IP lookups, caches them, and does not infer Wi-Fi from the ISP', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          city: 'Alexandria',
          country_code: 'EG',
          latitude: 31.2,
          longitude: 29.9,
          connection: { isp: 'Example ISP' },
        }),
      ),
    );
    const service = new AuthSessionMetadataService(new ConfigService());
    const metadata = await service.resolve(request('8.8.8.8'));
    expect(metadata).toMatchObject({
      location: 'Alexandria',
      isp: 'Example ISP',
      locationSource: 'ipwhois',
    });
    expect(metadata.networkType).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://ipwho.is/8.8.8.8?fields='),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        redirect: 'error',
      }),
    );
    await service.resolve(request('8.8.8.8'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['timeout', 'rate-limit', 'invalid-data'])(
    'keeps authentication available on location lookup %s',
    async (failure) => {
      const fetchMock = jest.spyOn(globalThis, 'fetch');
      if (failure === 'timeout')
        fetchMock.mockRejectedValue(new Error('timeout'));
      else
        fetchMock.mockResolvedValue(
          new Response(JSON.stringify({ success: false }), {
            status: failure === 'rate-limit' ? 429 : 200,
          }),
        );
      const service = new AuthSessionMetadataService(new ConfigService());
      const metadata = await service.resolve(request('8.8.8.8'));
      expect(metadata.ip).toBe('8.8.8.8');
      expect(metadata.location).toBeUndefined();
      expect(metadata.latitude).toBeUndefined();
    },
  );
});
