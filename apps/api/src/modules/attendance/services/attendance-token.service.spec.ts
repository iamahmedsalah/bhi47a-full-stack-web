import { AttendanceTokenService } from './attendance-token.service';
import * as crypto from 'crypto';

describe('AttendanceTokenService', () => {
  let service: AttendanceTokenService;
  const mockSessionId = '507f1f77bcf86cd799439011';
  let mockSecret: string;

  beforeEach(() => {
    service = new AttendanceTokenService();
    mockSecret = service.generateSessionSecret();
  });

  describe('generateSessionSecret', () => {
    it('should generate a 64-character hexadecimal random secret', () => {
      const secret = service.generateSessionSecret();
      expect(secret).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(secret)).toBe(true);
    });

    it('should generate unique secrets on each invocation', () => {
      const s1 = service.generateSessionSecret();
      const s2 = service.generateSessionSecret();
      expect(s1).not.toEqual(s2);
    });
  });

  describe('generateRotatingToken', () => {
    it('should generate a token composed of sessionId, timeBucket, and HMAC signature', () => {
      const payload = service.generateRotatingToken(
        mockSessionId,
        mockSecret,
        25,
        'https://portal.bhi47a.edu',
      );

      expect(payload.token).toBeDefined();
      expect(payload.manualCode).toMatch(/^[A-F0-9]{6}-\d{6}$/);
      const parts = payload.token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(mockSessionId);
      expect(Number(parts[1])).toBeGreaterThan(0);
      expect(parts[2]).toHaveLength(32);

      expect(payload.rotationSeconds).toBe(25);
      expect(payload.remainingSeconds).toBeGreaterThanOrEqual(1);
      expect(payload.remainingSeconds).toBeLessThanOrEqual(25);
      expect(payload.checkInUrl).toContain(
        `/attendance/check-in?t=${payload.token}`,
      );
    });
  });

  describe('validateManualCode', () => {
    it('should validate a freshly generated rotating fallback code', () => {
      const { manualCode } = service.generateRotatingToken(
        mockSessionId,
        mockSecret,
        25,
      );

      expect(
        service.validateManualCode(manualCode, mockSessionId, mockSecret, 25),
      ).toEqual({ valid: true, sessionId: mockSessionId });
    });

    it('should reject a fallback code for another session', () => {
      const { manualCode } = service.generateRotatingToken(
        mockSessionId,
        mockSecret,
        25,
      );

      expect(
        service.validateManualCode(
          manualCode,
          '507f1f77bcf86cd799439022',
          mockSecret,
          25,
        ).valid,
      ).toBe(false);
    });
  });

  describe('validateToken', () => {
    it('should validate a freshly generated token successfully', () => {
      const { token } = service.generateRotatingToken(
        mockSessionId,
        mockSecret,
        25,
      );
      const result = service.validateToken(token, mockSecret, 25);

      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(mockSessionId);
    });

    it('should tolerate previous bucket within network latency tolerance', () => {
      const intervalMs = 25 * 1000;
      const currentBucket = Math.floor(Date.now() / intervalMs);
      const prevBucket = currentBucket - 1;

      // Construct token from previous bucket
      const dataToSign = `${mockSessionId}:${prevBucket}`;
      const sig = crypto
        .createHmac('sha256', mockSecret)
        .update(dataToSign)
        .digest('hex')
        .slice(0, 32);
      const token = `${mockSessionId}.${prevBucket}.${sig}`;

      const result = service.validateToken(token, mockSecret, 25);
      expect(result.valid).toBe(true);
    });

    it('should reject a token that is older than the allowed tolerance window (screenshot sharing)', () => {
      const intervalMs = 25 * 1000;
      const currentBucket = Math.floor(Date.now() / intervalMs);
      const expiredBucket = currentBucket - 2;

      const dataToSign = `${mockSessionId}:${expiredBucket}`;
      const sig = crypto
        .createHmac('sha256', mockSecret)
        .update(dataToSign)
        .digest('hex')
        .slice(0, 32);
      const token = `${mockSessionId}.${expiredBucket}.${sig}`;

      const result = service.validateToken(token, mockSecret, 25);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('ATTENDANCE_QR_EXPIRED');
    });

    it('should reject tokens with forged signatures', () => {
      const { token } = service.generateRotatingToken(
        mockSessionId,
        mockSecret,
        25,
      );
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.badbadbadbadbadbadbadbadbadbadba`;

      const result = service.validateToken(tamperedToken, mockSecret, 25);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_ATTENDANCE_TOKEN');
    });

    it('should reject malformed tokens', () => {
      expect(service.validateToken('invalid', mockSecret, 25).valid).toBe(
        false,
      );
      expect(service.validateToken('a.b', mockSecret, 25).valid).toBe(false);
      expect(service.validateToken('', mockSecret, 25).valid).toBe(false);
    });
  });
});
