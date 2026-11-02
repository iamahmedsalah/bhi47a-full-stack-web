import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMISSION_TRACKING_ALPHABET } from '@student-portal/shared';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const admissionHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function trackingCode(hex: string, length: number): string {
  let output = '',
    bits = 0,
    buffer = 0;
  for (const byte of Buffer.from(hex, 'hex')) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && output.length < length) {
      bits -= 5;
      output += ADMISSION_TRACKING_ALPHABET[(buffer >>> bits) & 31];
    }
    if (output.length === length) return output;
  }
  throw new Error('Insufficient tracking code material');
}
export function admissionEqual(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
@Injectable()
export class AdmissionSecurity {
  constructor(private readonly config: ConfigService) {}
  ready() {
    this.hmacKey();
    this.encryptionKey();
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      (!this.config.get<string>('TURNSTILE_SECRET_KEY') ||
        !this.config.get<string>('TURNSTILE_HOSTNAMES')?.trim())
    ) {
      throw new ServiceUnavailableException({
        code: 'ADMISSIONS_CAPTCHA_CONFIGURATION',
        message:
          'Configure admission verification and allowed hostnames before creating invitations.',
      });
    }
  }
  private hmacKey(): string {
    const key = this.config.get<string>('ADMISSIONS_HMAC_KEY');
    if (!key || Buffer.byteLength(key) < 32) {
      throw new ServiceUnavailableException({
        code: 'ADMISSIONS_SECURITY_CONFIGURATION',
        message:
          'Admission security keys must be configured before accepting applications',
      });
    }
    return key;
  }
  private encryptionKey(): Buffer {
    const value = this.config.get<string>('ADMISSIONS_ENCRYPTION_KEY') ?? '';
    // Support 64-char hex key (e.g. from openssl rand -hex 32)
    if (/^[0-9a-fA-F]{64}$/.test(value)) {
      return Buffer.from(value, 'hex');
    }

    // Support 32-byte base64 key
    const key = Buffer.from(value, 'base64');
    if (key.length === 32 && key.toString('base64') === value) {
      return key;
    }

    // Support 32-byte raw utf8
    const raw = Buffer.from(value, 'utf8');
    if (raw.length === 32) {
      return raw;
    }

    throw new ServiceUnavailableException({
      code: 'ADMISSIONS_SECURITY_CONFIGURATION',
      message:
        'Admission encryption must be configured before accepting applications',
    });
  }
  hmac(purpose: string, value: string) {
    return createHmac('sha256', this.hmacKey())
      .update(`v1:${purpose}:${value}`)
      .digest('hex');
  }
  encrypt(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const payload = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      payload.toString('base64url'),
    ].join('.');
  }
  decrypt(value: string) {
    const [version, iv, tag, payload] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !payload)
      throw new ServiceUnavailableException(
        'Admission identity cannot be read.',
      );
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      cipher.update(Buffer.from(payload, 'base64url')),
      cipher.final(),
    ]).toString('utf8');
  }
  session(accessId: string) {
    const payload = Buffer.from(
      JSON.stringify({
        accessId,
        expires: Date.now() + 20 * 60_000,
        nonce: randomBytes(16).toString('hex'),
      }),
    ).toString('base64url');
    return `${payload}.${this.hmac('session', payload)}`;
  }
  readSession(value: string): string {
    const [payload, signature, extra] = value.split('.');
    if (
      !payload ||
      !signature ||
      extra ||
      !admissionEqual(signature, this.hmac('session', payload))
    )
      throw new UnauthorizedException('Admission session expired or invalid.');
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        accessId: unknown;
        expires: unknown;
      };
      if (
        typeof data.accessId !== 'string' ||
        !/^[a-f0-9]{24}$/.test(data.accessId) ||
        typeof data.expires !== 'number' ||
        data.expires <= Date.now()
      )
        throw new Error();
      return data.accessId;
    } catch {
      throw new UnauthorizedException('Admission session expired or invalid.');
    }
  }
  receipt(accessId: string, key: string, legacy = false) {
    const reference = this.hmac('reference', `${accessId}:${key}`);
    const secret = this.hmac('receipt', `${accessId}:${key}`);
    if (!legacy)
      return {
        publicReference: `ADM-${trackingCode(reference, 12)}`,
        secret: trackingCode(secret, 16),
      };
    return {
      publicReference: `ADM-${reference.slice(0, 24).toUpperCase()}`,
      secret: Buffer.from(secret, 'hex').toString('base64url'),
    };
  }
  async captcha(token: string, ip?: string) {
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    if (
      isDev &&
      (token === 'cf-turnstile-dummy-pass-token' ||
        token.startsWith('cf-turnstile-dummy') ||
        token === 'dev-token' ||
        token === 'dummy' ||
        token === 'XXXX.DUMMY.TOKEN.XXXX')
    ) {
      return;
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (isDev && secret === '1x0000000000000000000000000000000AA') return;
    if (!secret || (!isDev && /^\d[xX]0+AA$/.test(secret))) {
      if (isDev) return;
      throw new ServiceUnavailableException({
        code: 'ADMISSIONS_CAPTCHA_CONFIGURATION',
        message:
          'Admission verification is unavailable. Please contact admissions.',
      });
    }
    let result: { success?: boolean; hostname?: string; action?: string };
    try {
      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, response: token, remoteip: ip }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error();
      result = (await response.json()) as typeof result;
    } catch {
      if (isDev) return;
      throw new ServiceUnavailableException(
        'Admission verification is temporarily unavailable.',
      );
    }
    const hosts = (this.config.get<string>('TURNSTILE_HOSTNAMES') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const hostname = result.hostname ?? '';
    const hostnameAllowed =
      (isDev && hosts.length === 0) ||
      hosts.includes(hostname) ||
      ((hostname === 'localhost' || hostname === '127.0.0.1') &&
        (hosts.includes('localhost') || hosts.includes('127.0.0.1')));

    if (
      !result.success ||
      (isDev
        ? Boolean(result.action && result.action !== 'admission')
        : result.action !== 'admission') ||
      !hostnameAllowed
    ) {
      if (isDev) return;
      throw new BadRequestException({
        code: 'ADMISSION_CAPTCHA',
        message: 'Please complete a fresh verification challenge.',
      });
    }
  }
}
