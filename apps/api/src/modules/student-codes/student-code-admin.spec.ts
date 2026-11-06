import 'reflect-metadata';
import { Types, type ClientSession } from 'mongoose';
import { StudentCodeAdminService } from './student-code-admin.service';
import { StudentCodesService } from './student-codes.service';
import { StudentCodesController } from './student-codes.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { StudentCodeStore } from './student-code-store.service';
import type { AdmissionTransactions } from './admission-transactions.service';
import type { ManageStudentCodeDto } from './dto/student-code.dto';

const query = <T>(value: T) => ({
  session: (_session: ClientSession) => ({
    lean: () => Promise.resolve(value),
  }),
});
describe('Administrator code decisions and historical identity isolation', () => {
  function fixture() {
    const owner = new Types.ObjectId(),
      actor = String(new Types.ObjectId()),
      session = {} as ClientSession;
    const row = {
      studentCode: '280001',
      status: 'RELEASED',
      reason: 'PREVIOUS_OWNER_BLOCKED',
      sequence: 1,
      observedStudentId: undefined as string | undefined,
      currentStudentId: undefined as string | undefined,
    };
    const entry = {
      _id: new Types.ObjectId(),
      status: 'RELEASED',
      academicYear: '2027-2028',
      currentStudentId: undefined as Types.ObjectId | undefined,
      registrationRequestId: new Types.ObjectId(),
      assignmentHistory: [
        { studentId: owner, source: 'legacy', observedAt: new Date() },
      ],
    };
    const grade = {
      _id: new Types.ObjectId(),
      studentCode: '280001',
      grade: 97,
      studentId: owner,
    };
    const records: Record<string, Array<Record<string, unknown>>> = {
      grades: [grade],
      admission_requests: [
        {
          _id: new Types.ObjectId(),
          studentCode: '280001',
          status: 'CANCELLED',
          studentId: owner,
        },
      ],
    };
    const archive = { insertMany: jest.fn().mockResolvedValue({}) };
    const collections = new Map<
      string,
      { find: jest.Mock; deleteMany: jest.Mock; updateMany: jest.Mock }
    >();
    const collection = (name: string) => {
      if (name === 'student_code_archived_records') return archive;
      if (!collections.has(name))
        collections.set(name, {
          find: jest.fn(() => ({
            limit: () => ({
              toArray: () => Promise.resolve(records[name] ?? []),
            }),
          })),
          deleteMany: jest
            .fn()
            .mockResolvedValue({ deletedCount: records[name]?.length ?? 0 }),
          updateMany: jest
            .fn()
            .mockResolvedValue({ modifiedCount: records[name]?.length ?? 0 }),
        });
      return collections.get(name)!;
    };
    const usersExist = jest.fn().mockResolvedValue(null),
      profilesExist = jest.fn().mockResolvedValue(null);
    const store = {
      validateYear: jest.fn(),
      snapshot: jest.fn().mockResolvedValue({
        rows: [row],
        fingerprint: 'a'.repeat(64),
        policy: {},
        mappingConflict: false,
        truncated: false,
      }),
      entries: {
        findOne: () => query(entry),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        create: jest.fn(),
      },
      users: { exists: () => ({ session: usersExist }) },
      profiles: { exists: () => ({ session: profilesExist }) },
      connection: { db: { collection } },
      years: { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) },
      audits: { create: jest.fn().mockResolvedValue([]) },
    };
    const transactions = {
      run: (work: (session: ClientSession) => Promise<unknown>) =>
        work(session),
    };
    const service = new StudentCodeAdminService(
      store as unknown as StudentCodeStore,
      transactions as unknown as AdmissionTransactions,
    );
    const dto: ManageStudentCodeDto = {
      academicYear: '2027-2028',
      yearPrefix: '28',
      fingerprint: 'a'.repeat(64),
      reason: 'Reviewed original student and historical records.',
      confirmed: true,
      origin: 'import',
      sourceFile: 'historic-intake.xlsx',
      action: 'FREE',
    };
    return {
      service,
      store,
      dto,
      owner,
      actor,
      session,
      entry,
      row,
      records,
      archive,
      collections,
      grade,
      usersExist,
    };
  }
  it('exposes code reuse decisions only to administrators', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(
          StudentCodesController.prototype,
          'manage',
        )!.value,
      ),
    ).toEqual(['admin']);
  });
  it('archives previous-owner academic records and detaches cancelled admission aliases in the same transaction', async () => {
    const f = fixture();
    await expect(
      f.service.manage('280001', f.dto, f.actor),
    ).resolves.toMatchObject({ status: 'AVAILABLE' });
    expect(f.archive.insertMany.mock.calls[0][0][0]).toMatchObject({
      collection: 'grades',
      record: f.grade,
      previousStudentIds: [f.owner],
    });
    expect(f.archive.insertMany.mock.calls[0][1]).toEqual({
      session: f.session,
    });
    expect(f.collections.get('grades')!.deleteMany.mock.calls[0][1]).toEqual({
      session: f.session,
    });
    expect(
      f.collections.get('admission_requests')!.deleteMany,
    ).not.toHaveBeenCalled();
    expect(
      f.collections.get('admission_requests')!.updateMany.mock.calls[0][1],
    ).toEqual({
      $set: { formerStudentCode: '280001' },
      $unset: { studentCode: '' },
    });
    expect(f.store.entries.updateOne.mock.calls[0][1]).toMatchObject({
      $set: { status: 'AVAILABLE', reuseAuthorized: true },
      $unset: { currentStudentId: 1, registrationRequestId: 1 },
    });
    expect(f.store.audits.create.mock.calls[0][0][0]).toMatchObject({
      action: 'ADMIN_FREED',
      details: {
        reportedOrigin: 'import',
        sourceFile: 'historic-intake.xlsx',
        archivedRecords: { grades: 1, admission_requests: 1 },
      },
    });
  });
  it('bans reuse without moving or deleting any academic records', async () => {
    const f = fixture();
    await expect(
      f.service.manage('280001', { ...f.dto, action: 'BAN' }, f.actor),
    ).resolves.toMatchObject({ status: 'RELEASED' });
    expect(f.archive.insertMany).not.toHaveBeenCalled();
    expect(
      f.store.entries.updateOne.mock.calls[0][1].$set.reuseAuthorized,
    ).toBe(false);
  });
  it('rejects stale or actively owned codes before archiving', async () => {
    const f = fixture();
    await expect(
      f.service.manage(
        '280001',
        { ...f.dto, fingerprint: 'b'.repeat(64) },
        f.actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_PREVIEW_CHANGED' } });
    f.usersExist.mockResolvedValue({ _id: f.owner });
    await expect(
      f.service.manage('280001', f.dto, f.actor),
    ).rejects.toMatchObject({ response: { code: 'CODE_ACTIVE_OWNER' } });
    expect(f.archive.insertMany).not.toHaveBeenCalled();
    expect(f.store.entries.updateOne).not.toHaveBeenCalled();
  });
  it('corrects the registry intake year only after confirming the same existing owner', async () => {
    const f = fixture();
    f.row.reason = 'REGISTRY_YEAR_MISMATCH';
    f.row.observedStudentId = String(f.owner);
    f.entry.status = 'ASSIGNED';
    f.entry.currentStudentId = f.owner;
    f.entry.academicYear = '2028-2029';
    await expect(
      f.service.manage(
        '280001',
        { ...f.dto, action: 'CONFIRM_OWNER' },
        f.actor,
      ),
    ).resolves.toMatchObject({ status: 'ASSIGNED' });
    expect(f.store.entries.updateOne.mock.calls[0][1]).toEqual({
      $set: { academicYear: '2027-2028' },
    });
    expect(f.archive.insertMany).not.toHaveBeenCalled();
    expect(f.store.audits.create.mock.calls[0][0][0]).toMatchObject({
      action: 'OWNER_REVIEWED',
      details: { previousAcademicYear: '2028-2029' },
    });
  });
});

describe('Recorded upload and manual-entry origins', () => {
  it('records filename, upload session, absolute row and actor only for matching saved identities', async () => {
    const owner = new Types.ObjectId(),
      actor = String(new Types.ObjectId());
    const profiles = [
      { studentCode: '280001', userId: owner, academicYear: '2027-2028' },
      {
        studentCode: '280002',
        userId: new Types.ObjectId(),
        academicYear: '2027-2028',
      },
    ];
    const find = <T>(value: T) => ({
      select: () => ({ lean: () => Promise.resolve(value) }),
    });
    const insertMany = jest.fn().mockResolvedValue([]);
    const store = {
      profiles: { find: () => find(profiles) },
      users: { find: () => find([{ studentCode: '280001', _id: owner }]) },
      audits: { insertMany },
    };
    const service = new StudentCodesService(
      store as unknown as StudentCodeStore,
      {} as AdmissionTransactions,
    );
    await service.recordImport([{ studentCode: '280001', rowNum: 3 }], actor, {
      sourceFile: 'old-students.xlsx',
      batchId: 'upload-123',
      batchIndex: 1,
      rowOffset: 100,
    });
    expect(insertMany.mock.calls[0][0]).toHaveLength(1);
    expect(insertMany.mock.calls[0][0][0]).toMatchObject({
      action: 'IMPORTED',
      source: 'import',
      actorId: new Types.ObjectId(actor),
      details: {
        sourceFile: 'old-students.xlsx',
        batchId: 'upload-123',
        batchIndex: 1,
        rowNumber: 103,
        originVerification: 'system_recorded',
      },
    });
    await service.recordImport(
      [{ studentCode: '280001', rowNum: 0 }],
      actor,
      undefined,
      'manual',
    );
    expect(insertMany.mock.calls[1][0][0]).toMatchObject({
      action: 'MANUAL_CREATED',
      source: 'manual',
      reason: 'Manually added student.',
    });
  });
});
