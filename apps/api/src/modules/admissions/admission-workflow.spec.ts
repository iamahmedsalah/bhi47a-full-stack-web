import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  canTransitionAdmission,
  isAdmissionNationalId,
  ADMISSION_REQUEST_STATUSES,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  ADMISSION_REFERENCE_PATTERN,
  ADMISSION_TRACKING_SECRET_PATTERN,
} from '@student-portal/shared';
import { AdmissionSecurity, admissionHash } from './admission-security.service';
import {
  ApproveApplicantDto,
  DecisionDto,
  PublicApplicantDto,
  PublicStatusDto,
} from './dto/admission-workflow.dto';
import {
  safeAdmissionCell,
  validateAdmissionWorkbook,
} from './admission-spreadsheets.service';

describe('Admission workflow boundaries', () => {
  const security = () =>
    new AdmissionSecurity(
      new ConfigService({
        NODE_ENV: 'test',
        ADMISSIONS_HMAC_KEY: 'synthetic-unit-test-key-at-least-32-bytes',
        ADMISSIONS_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
      }),
    );
  it.each(['30001010100001', '29912310100001', '30002290100001'])(
    'accepts a structurally valid identity %s',
    (value) => expect(isAdmissionNationalId(value)).toBe(true),
  );
  it.each([
    '30102290100001',
    '30002300100001',
    '39901010100001',
    '40001010100001',
    '3000101010000',
  ])('rejects an impossible identity %s', (value) =>
    expect(isAdmissionNationalId(value)).toBe(false),
  );
  it('owns all transitions and keeps terminal statuses terminal', () => {
    expect(canTransitionAdmission('PENDING', 'APPROVED')).toBe(true);
    expect(canTransitionAdmission('WAITLISTED', 'PENDING')).toBe(true);
    for (const from of ['APPROVED', 'REJECTED', 'CANCELLED'] as const)
      for (const to of ADMISSION_REQUEST_STATUSES)
        expect(canTransitionAdmission(from, to)).toBe(false);
  });
  it('authenticates encrypted identity and domain-separated hashes', () => {
    const service = security(),
      value = '30001010100001',
      encrypted = service.encrypt(value);
    expect(encrypted).not.toContain(value);
    expect(service.decrypt(encrypted)).toBe(value);
    expect(service.encrypt(value)).not.toBe(encrypted);
    expect(() => service.decrypt(encrypted.slice(0, -4) + 'xxxx')).toThrow();
    expect(service.hmac('pin', value)).not.toBe(
      service.hmac('national-id', value),
    );
    expect(admissionHash('secret')).not.toContain('secret');
  });
  it('requires independent configured keys rather than falling back to JWT', () => {
    const service = new AdmissionSecurity(
      new ConfigService({
        JWT_SECRET: 'long-enough-but-unrelated-to-admission-keys',
      }),
    );
    expect(() => service.encrypt('identity')).toThrow();
    expect(() => service.hmac('pin', '12345678')).toThrow();
  });
  it('expires and rejects forged admission sessions; receipts retry deterministically', () => {
    const service = security(),
      id = '100000000000000000000001';
    const session = service.session(id);
    expect(service.readSession(session)).toBe(id);
    expect(() => service.readSession(session + 'x')).toThrow();
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 21 * 60_000);
    expect(() => service.readSession(session)).toThrow();
    clock.mockRestore();
    expect(service.receipt(id, 'key')).toEqual(service.receipt(id, 'key'));
    expect(service.receipt(id, 'key')).toMatchObject({
      publicReference: expect.stringMatching(ADMISSION_REFERENCE_PATTERN),
      secret: expect.stringMatching(ADMISSION_TRACKING_SECRET_PATTERN),
    });
    expect(service.receipt(id, 'key').publicReference).toHaveLength(16);
    expect(service.receipt(id, 'key').secret).toHaveLength(16);
    expect(service.receipt(id, 'key', true).secret).toHaveLength(43);
    expect(service.receipt(id, 'another-key')).not.toEqual(
      service.receipt(id, 'key'),
    );
  });
  it('accepts easy-to-type compact tracking details and preserves case-sensitive legacy secrets', async () => {
    const compact = plainToInstance(PublicStatusDto, {
      publicReference: ' adm-abcd-efgh-2345 ',
      secret: 'abcd efgh 2345 6789',
    });
    expect(await validate(compact)).toHaveLength(0);
    expect(compact.publicReference).toBe('ADM-ABCDEFGH2345');
    expect(compact.secret).toBe('ABCDEFGH23456789');
    const legacySecret = 'aB0_-'.repeat(8) + 'xYz';
    const legacy = plainToInstance(PublicStatusDto, {
      publicReference: 'ADM-' + 'A'.repeat(24),
      secret: legacySecret,
    });
    expect(await validate(legacy)).toHaveLength(0);
    expect(legacy.secret).toBe(legacySecret);
    const hyphenatedLegacy = '-'.repeat(27) + 'ABCDEFGH23456789';
    expect(
      plainToInstance(PublicStatusDto, {
        publicReference: legacy.publicReference,
        secret: hyphenatedLegacy,
      }).secret,
    ).toBe(hyphenatedLegacy);
    expect(
      await validate(
        plainToInstance(PublicStatusDto, {
          publicReference: 'ADM-ABCD',
          secret: '123456',
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('validates guardians, phone, unknown fields and literal confirmations', async () => {
    const dto = plainToInstance(
      PublicApplicantDto,
      {
        fullName: 'Synthetic applicant',
        nationalId: '30001010100001',
        address: 'Synthetic address',
        phone: '01312345678',
        guardians: [],
        studentType: 'NEW',
        admissionSession: 'session',
        submissionKey: 'a'.repeat(32),
        captchaToken: '',
        isAdmin: true,
      },
      { enableImplicitConversion: true },
    );
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['phone', 'guardians', 'isAdmin']),
    );
    expect(
      (
        await validate(
          plainToInstance(
            DecisionDto,
            { revision: 0, reason: 'Valid reason', confirmed: 'true' },
            { enableImplicitConversion: true },
          ),
        )
      ).some((error) => error.property === 'confirmed'),
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(ApproveApplicantDto, {
            revision: 0,
            level: '5',
            semester: '1',
            department: 'GENERAL',
            passedCourses: [],
            confirmed: true,
          }),
        )
      ).some((error) => error.property === 'level'),
    ).toBe(true);
  });
  it.each(['=1+1', '+SUM(A1)', '-1+2', '@formula', '\tformula', '\rformula'])(
    'neutralizes spreadsheet content %j',
    (value) => expect(safeAdmissionCell(value)).toBe(`'${value}`),
  );
  it('rejects non-workbooks and tiny malicious archives', () => {
    for (const value of ['', 'X', '<xml>not excel</xml>'])
      expect(() => validateAdmissionWorkbook(Buffer.from(value))).toThrow();
  });
  it('gives no staff type automatic admission permissions', () => {
    for (const permissions of Object.values(STAFF_TYPE_DEFAULT_PERMISSIONS))
      expect(
        permissions.some(
          (permission) =>
            permission.startsWith('admissions.') ||
            permission.startsWith('student_codes.'),
        ),
      ).toBe(false);
  });
  it('rejects a Cloudflare test secret in production before verification', async () => {
    const service = new AdmissionSecurity(
      new ConfigService({
        NODE_ENV: 'production',
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        TURNSTILE_HOSTNAMES: 'portal.example.test',
      }),
    );
    await expect(service.captcha('synthetic-token')).rejects.toThrow();
  });
  it.each([
    'dummy',
    'dev-token',
    'cf-turnstile-dummy-pass-token',
    'XXXX.DUMMY.TOKEN.XXXX',
  ])(
    'never accepts a production test token without verification: %s',
    async (token) => {
      const service = new AdmissionSecurity(
        new ConfigService({
          NODE_ENV: 'production',
          TURNSTILE_SECRET_KEY: 'synthetic-real-key-not-a-cloudflare-test-key',
          TURNSTILE_HOSTNAMES: 'portal.example.test',
        }),
      );
      const fetcher = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        );
      try {
        await expect(service.captcha(token)).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
      } finally {
        fetcher.mockRestore();
      }
    },
  );
});
