import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Types, type Connection } from 'mongoose';
import {
  formatStudentCode,
  parseStudentCode,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  PERMISSIONS,
} from '@student-portal/shared';
import { analyzeCodeSnapshot, type SnapshotSources } from './audit-snapshot';
import { AdmissionTransactions } from './admission-transactions.service';
import {
  CodeAuditQueryDto,
  InitializeCodeYearDto,
  RecoverStudentCodeDto,
} from './dto/student-code.dto';
import { StudentCodesController } from './student-codes.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';

const year = '2025-2026';
const prefix = '26';
const empty = (): SnapshotSources => ({
  users: [],
  profiles: [],
  entries: [],
  policy: null,
  periodExists: true,
  truncated: false,
});
describe('Student-code format, audit and safety policy', () => {
  it('keeps a verified 270001 owner visible when a legacy registry entry belongs to 2027-2028', () => {
    const source = empty(),
      owner = new Types.ObjectId(),
      profile = new Types.ObjectId();
    source.users = [{ _id: owner, role: 'student', studentCode: '270001' }];
    source.profiles = [
      {
        _id: profile,
        userId: owner,
        studentCode: '270001',
        fullName: 'Existing student',
        academicYear: '2026-2027',
      },
    ];
    source.entries = [
      {
        studentCode: '270001',
        academicYear: '2027-2028',
        yearPrefix: '27',
        sequence: 1,
        status: 'ASSIGNED',
        currentStudentId: owner,
        assignmentHistory: [],
      },
    ];
    const result = analyzeCodeSnapshot('2026-2027', '27', source);
    expect(result.rows[0]).toMatchObject({
      status: 'REQUIRES_REVIEW',
      reason: 'REGISTRY_YEAR_MISMATCH',
      observedStudentId: String(owner),
      studentProfileId: String(profile),
      studentName: 'Existing student',
      studentAcademicYear: '2026-2027',
      registryAcademicYear: '2027-2028',
    });
    expect(result.rows[0].currentStudentId).toBeUndefined();
    expect(result.canInitialize).toBe(false);
    expect(source.entries[0].academicYear).toBe('2027-2028');
  });
  it('returns a verified student profile and bilingual owner name without changing the audit fingerprint', () => {
    const source = empty();
    const owner = new Types.ObjectId();
    const profileId = new Types.ObjectId();
    source.users = [{ _id: owner, role: 'student', studentCode: '260001' }];
    source.profiles = [
      {
        _id: profileId,
        userId: owner,
        studentCode: '260001',
        fullName: 'Student',
        fullNameAr: 'طالب',
        department: 'BIS',
        level: '1',
      },
    ];
    const first = analyzeCodeSnapshot(year, prefix, source);
    expect(first.rows[0]).toMatchObject({
      currentStudentId: String(owner),
      studentProfileId: String(profileId),
      studentName: 'Student',
      studentNameAr: 'طالب',
      department: 'BIS',
    });
    source.profiles[0].fullName = 'Updated';
    expect(analyzeCodeSnapshot(year, prefix, source).fingerprint).toBe(
      first.fingerprint,
    );
  });
  it('ignores text aliases that cannot collide with a six-digit code', () => {
    const input = empty();
    input.users.push({
      _id: new Types.ObjectId(),
      role: 'staff',
      username: '26_staff',
      userCode: 'STD-26_custom',
    });
    const snapshot = analyzeCodeSnapshot(year, prefix, input);
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.canInitialize).toBe(true);
  });
  it.each([
    [1, '260001'],
    [999, '260999'],
    [1000, '261000'],
    [9034, '269034'],
    [9999, '269999'],
  ])(
    'formats sequence %s without a suffix or checksum',
    (sequence, expected) => {
      expect(formatStudentCode(prefix, sequence)).toBe(expected);
      expect(parseStudentCode(String(expected), prefix)).toBe(sequence);
    },
  );
  it.each([0, -1, 10000, 1.5, NaN])(
    'fails closed for invalid or exhausted sequences %s',
    (sequence) => expect(() => formatStudentCode(prefix, sequence)).toThrow(),
  );
  it.each(['260000', '2612345', '27ABCD', '270001', '26123'])(
    'does not silently reinterpret legacy/malformed code %s',
    (code) => expect(parseStudentCode(code, prefix)).toBeUndefined(),
  );
  it('never infers the prefix from the host clock or academic year', () => {
    const snapshot = analyzeCodeSnapshot('2037-2038', '06', empty());
    expect(snapshot.canInitialize).toBe(true);
    expect(formatStudentCode('06', 1)).toBe('060001');
  });
  it('leaves missing gaps unverified and holds inactive identities', () => {
    const input = empty();
    const id = new Types.ObjectId();
    input.users.push({
      _id: id,
      role: 'student',
      studentCode: '260003',
      username: '260003',
      userCode: 'STD-260003',
    });
    input.profiles.push({
      _id: new Types.ObjectId(),
      userId: id,
      studentCode: '260003',
    });
    const snapshot = analyzeCodeSnapshot(year, prefix, input);
    expect(snapshot.summary).toMatchObject({
      ASSIGNED: 1,
      MISSING: 2,
      AVAILABLE: 0,
    });
    expect(snapshot.rows[0]).toMatchObject({
      status: 'MISSING',
      reason: 'UNVERIFIED_GAP',
    });
    expect(snapshot.canInitialize).toBe(true);
  });
  it('classifies ambiguous identities and blocks initialization', () => {
    const input = empty();
    const id = new Types.ObjectId();
    input.users.push({ _id: id, role: 'staff', username: '260001' });
    input.profiles.push({
      _id: new Types.ObjectId(),
      userId: id,
      studentCode: '260002',
    });
    const snapshot = analyzeCodeSnapshot(year, prefix, input);
    expect(snapshot.rows.map((row) => row.reason)).toEqual([
      'ALIAS_CONFLICT',
      'ORPHANED_PROFILE',
    ]);
    expect(snapshot.canInitialize).toBe(false);
  });
  it('detects ownership changes but produces a stable preview for reordered source rows', () => {
    const input = empty();
    const id = new Types.ObjectId();
    input.users.push({ _id: id, role: 'student', studentCode: '260001' });
    input.profiles.push({
      _id: new Types.ObjectId(),
      userId: id,
      studentCode: '260001',
    });
    const initial = analyzeCodeSnapshot(year, prefix, input).fingerprint;
    expect(
      analyzeCodeSnapshot(year, prefix, {
        ...input,
        users: [...input.users].reverse(),
      }).fingerprint,
    ).toBe(initial);
    input.profiles[0].userId = new Types.ObjectId();
    expect(analyzeCodeSnapshot(year, prefix, input).fingerprint).not.toBe(
      initial,
    );
    expect(analyzeCodeSnapshot(year, prefix, input).canInitialize).toBe(false);
  });
  it('does not enable initialization after a truncated scan or before period setup', () => {
    expect(
      analyzeCodeSnapshot(year, prefix, { ...empty(), truncated: true })
        .canInitialize,
    ).toBe(false);
    expect(
      analyzeCodeSnapshot(year, prefix, { ...empty(), periodExists: false })
        .canInitialize,
    ).toBe(false);
  });
  it('keeps defaults unprivileged and requires explicit delegated mutation permissions', () => {
    for (const permissions of Object.values(STAFF_TYPE_DEFAULT_PERMISSIONS))
      expect(
        permissions.some((permission) =>
          String(permission).startsWith('student_codes.'),
        ),
      ).toBe(false);
    for (const [name, permission] of [
      ['initialize', PERMISSIONS.STUDENT_CODES_MANAGE],
      ['hold', PERMISSIONS.STUDENT_CODES_MANAGE],
      ['recover', PERMISSIONS.STUDENT_CODES_RECOVER],
      ['deleteStudent', PERMISSIONS.STUDENT_CODES_DELETE_STUDENT],
    ]) {
      const method = Object.getOwnPropertyDescriptor(
        StudentCodesController.prototype,
        name,
      )!.value;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        PERMISSIONS.STUDENT_CODES_READ,
        permission,
      ]);
    }
  });
});

describe('Student-code DTOs and transaction boundary', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const body = {
    academicYear: year,
    yearPrefix: prefix,
    fingerprint: 'a'.repeat(64),
    reason: 'Reviewed all identity records.',
    confirmed: true,
  };
  it.each([
    { ...body, confirmed: 'true' },
    { ...body, confirmed: false },
    { ...body, reason: 'short' },
    { ...body, studentCode: '269034' },
    { ...body, yearPrefix: '266' },
  ])(
    'rejects invalid initialization or implicit confirmations',
    async (value) => {
      await expect(
        pipe.transform(value, {
          type: 'body',
          metatype: InitializeCodeYearDto,
        }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('requires the explicit never-assigned attestation and bounds scan queries', async () => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: RecoverStudentCodeDto }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { ...body, neverAssignedConfirmed: 'true' },
        { type: 'body', metatype: RecoverStudentCodeDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { academicYear: year, yearPrefix: prefix, limit: 101 },
        { type: 'query', metatype: CodeAuditQueryDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects standalone MongoDB before any preparation or callback writes', async () => {
    const startSession = jest.fn();
    const prepare = jest.fn();
    const work = jest.fn();
    const connection = {
      db: {
        admin: () => ({
          command: () => Promise.resolve({ logicalSessionTimeoutMinutes: 30 }),
        }),
      },
      startSession,
    };
    await expect(
      new AdmissionTransactions(connection as unknown as Connection).run(
        work,
        prepare,
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'ADMISSION_TRANSACTIONS_REQUIRED' },
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
  it('always ends the session and reports uniqueness races as a conflict', async () => {
    const endSession = jest.fn().mockResolvedValue(undefined);
    const withTransaction = jest.fn().mockRejectedValue({ code: 11000 });
    const connection = {
      db: {
        admin: () => ({
          command: () =>
            Promise.resolve({
              setName: 'test-rs',
              logicalSessionTimeoutMinutes: 30,
            }),
        }),
      },
      startSession: () => Promise.resolve({ withTransaction, endSession }),
    };
    await expect(
      new AdmissionTransactions(connection as unknown as Connection).run(
        jest.fn(),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'CODE_WRITE_CONFLICT' },
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(withTransaction.mock.calls[0][1]).toMatchObject({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  });
});
