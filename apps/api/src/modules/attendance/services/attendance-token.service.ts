import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ATTENDANCE_CONFIG_DEFAULTS } from '@student-portal/shared';

export interface GeneratedQrPayload {
  token: string;
  manualCode: string;
  checkInUrl: string;
  rotationSeconds: number;
  remainingSeconds: number;
  expiresAt: Date;
}

export interface TokenValidationResult {
  valid: boolean;
  code?:
    | 'INVALID_ATTENDANCE_TOKEN'
    | 'ATTENDANCE_QR_EXPIRED'
    | 'ATTENDANCE_TOKEN_MALFORMED';
  message?: string;
  sessionId?: string;
}

const MANUAL_CODE_PATTERN = /^[A-F0-9]{6}-\d{6}$/i;

@Injectable()
export class AttendanceTokenService {
  private generateManualCodeForBucket(
    sessionId: string,
    sessionSecret: string,
    timeBucket: number,
  ): string {
    const digest = crypto
      .createHmac('sha256', sessionSecret)
      .update(`${sessionId}:${timeBucket}:manual`)
      .digest();
    const digits = (digest.readUInt32BE(0) % 1_000_000)
      .toString()
      .padStart(6, '0');

    return `${sessionId.slice(-6).toUpperCase()}-${digits}`;
  }

  isManualCode(value: string): boolean {
    return MANUAL_CODE_PATTERN.test(value.trim());
  }

  getManualCodeSessionSuffix(value: string): string | null {
    const normalized = value.trim().toUpperCase();
    return this.isManualCode(normalized) ? normalized.slice(0, 6) : null;
  }

  /**
   * Generates a 256-bit cryptographically secure random hexadecimal secret
   * used exclusively by the specific attendance session for HMAC token verification.
   */
  generateSessionSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates a time-bucketed rotating QR credential for an active session.
   *
   * @param sessionId Session ObjectId string
   * @param sessionSecret Session secret key
   * @param rotationSeconds Period in seconds for which each QR token is valid (default: 25s)
   * @param baseUrl Optional web application base URL for check-in redirect link
   */
  generateRotatingToken(
    sessionId: string,
    sessionSecret: string,
    rotationSeconds: number = ATTENDANCE_CONFIG_DEFAULTS.QR_ROTATION_SECONDS,
    baseUrl: string = '',
  ): GeneratedQrPayload {
    const now = Date.now();
    const intervalMs = rotationSeconds * 1000;
    const timeBucket = Math.floor(now / intervalMs);

    const dataToSign = `${sessionId}:${timeBucket}`;
    const signature = crypto
      .createHmac('sha256', sessionSecret)
      .update(dataToSign)
      .digest('hex')
      .slice(0, 32);

    const token = `${sessionId}.${timeBucket}.${signature}`;
    const manualRotationSeconds = Math.max(rotationSeconds, 60);
    const manualTimeBucket = Math.floor(now / (manualRotationSeconds * 1000));
    const manualCode = this.generateManualCodeForBucket(
      sessionId,
      sessionSecret,
      manualTimeBucket,
    );

    const timeInCurrentBucket = now % intervalMs;
    const remainingMs = intervalMs - timeInCurrentBucket;
    const remainingSeconds = Math.max(1, Math.floor(remainingMs / 1000));
    const expiresAt = new Date(now + remainingMs);

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const checkInUrl = `${normalizedBaseUrl}/attendance/check-in?t=${token}`;

    return {
      token,
      manualCode,
      checkInUrl,
      rotationSeconds,
      remainingSeconds,
      expiresAt,
    };
  }

  /**
   * Validates the short projector-friendly fallback code against the current
   * or immediately previous rotation bucket.
   */
  validateManualCode(
    rawCode: string,
    sessionId: string,
    sessionSecret: string,
    rotationSeconds: number = ATTENDANCE_CONFIG_DEFAULTS.QR_ROTATION_SECONDS,
  ): TokenValidationResult {
    const normalized = rawCode.trim().toUpperCase();
    if (!this.isManualCode(normalized)) {
      return {
        valid: false,
        code: 'ATTENDANCE_TOKEN_MALFORMED',
        message: 'Attendance code format is invalid.',
      };
    }

    if (!sessionId.toUpperCase().endsWith(normalized.slice(0, 6))) {
      return {
        valid: false,
        code: 'INVALID_ATTENDANCE_TOKEN',
        message: 'Attendance code does not match this session.',
      };
    }

    const manualRotationSeconds = Math.max(rotationSeconds, 60);
    const currentBucket = Math.floor(
      Date.now() / (manualRotationSeconds * 1000),
    );
    const candidateCodes = [currentBucket, currentBucket - 1].map((bucket) =>
      this.generateManualCodeForBucket(sessionId, sessionSecret, bucket),
    );
    const supplied = Buffer.from(normalized, 'utf8');
    const valid = candidateCodes.some((candidate) => {
      const expected = Buffer.from(candidate, 'utf8');
      return (
        supplied.length === expected.length &&
        crypto.timingSafeEqual(supplied, expected)
      );
    });

    return valid
      ? { valid: true, sessionId }
      : {
          valid: false,
          code: 'ATTENDANCE_QR_EXPIRED',
          message: 'Attendance code is invalid or has expired.',
        };
  }

  /**
   * Validates a student check-in token against the session's internal secret.
   * Tolerates a 1-step historical window (current bucket and immediately preceding bucket)
   * to accommodate realistic mobile camera processing and network transit latency (~5s),
   * while rejecting screenshots or shared codes once the tolerance expires.
   */
  validateToken(
    rawToken: string,
    sessionSecret: string,
    rotationSeconds: number = ATTENDANCE_CONFIG_DEFAULTS.QR_ROTATION_SECONDS,
  ): TokenValidationResult {
    if (!rawToken || typeof rawToken !== 'string') {
      return {
        valid: false,
        code: 'ATTENDANCE_TOKEN_MALFORMED',
        message: 'رمز الحضور غير صالح أو مفقود',
      };
    }

    const parts = rawToken.split('.');
    if (parts.length !== 3) {
      return {
        valid: false,
        code: 'ATTENDANCE_TOKEN_MALFORMED',
        message: 'صيغة رمز الحضور غير صحيحة',
      };
    }

    const [sessionId, timeBucketStr, signature] = parts;
    const tokenBucket = parseInt(timeBucketStr, 10);

    if (isNaN(tokenBucket) || !sessionId || !signature) {
      return {
        valid: false,
        code: 'ATTENDANCE_TOKEN_MALFORMED',
        message: 'بيانات رمز الحضور غير مكتملة',
      };
    }

    const now = Date.now();
    const intervalMs = rotationSeconds * 1000;
    const currentBucket = Math.floor(now / intervalMs);

    // Reject tokens from the future or tokens older than 1 previous bucket (tolerance)
    if (tokenBucket > currentBucket) {
      return {
        valid: false,
        code: 'INVALID_ATTENDANCE_TOKEN',
        message: 'رمز الحضور غير صالح أو صادر في توقيت غير متزامن',
      };
    }

    // Allow the current and immediately previous bucket for camera/network latency.
    // A wider window would make captured QR codes replayable for substantially longer.
    const bucketDiff = currentBucket - tokenBucket;
    if (bucketDiff > 1) {
      return {
        valid: false,
        code: 'ATTENDANCE_QR_EXPIRED',
        message:
          'انتهت صلاحية رمز الاستجابة السريعة (QR). يرجى مسح الرمز الجديد المعروض على الشاشة.',
      };
    }

    // Recompute signature for the token's bucket
    const dataToSign = `${sessionId}:${tokenBucket}`;
    const expectedSignature = crypto
      .createHmac('sha256', sessionSecret)
      .update(dataToSign)
      .digest('hex')
      .slice(0, 32);

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return {
        valid: false,
        code: 'INVALID_ATTENDANCE_TOKEN',
        message: 'رمز الحضور مزور أو غير متطابق مع الجلسة الحالية',
      };
    }

    return {
      valid: true,
      sessionId,
    };
  }
}
