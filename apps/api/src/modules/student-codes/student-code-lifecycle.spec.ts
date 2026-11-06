import { Types, type ClientSession } from 'mongoose';
import { StudentCodesService } from './student-codes.service';
import type { StudentCodeStore } from './student-code-store.service';
import type { AdmissionTransactions } from './admission-transactions.service';

const query = <T>(value: T) => ({
  session: (_session: ClientSession) => ({
    lean: () => Promise.resolve(value),
  }),
  lean: () => Promise.resolve(value),
});

describe('Student code lifecycle', () => {
  function fixture() {
    const owner = new Types.ObjectId();
    const actor = String(new Types.ObjectId());
    const session = {} as ClientSession;
    const entry = {
      _id: new Types.ObjectId(),
      status: 'ASSIGNED',
      currentStudentId: owner,
      assignmentHistory: [
        { studentId: owner, source: 'admission', observedAt: new Date() },
      ],
    };
    const row = {
      studentCode: '280001',
      sequence: 1,
      status: 'ASSIGNED',
      currentStudentId: String(owner),
      studentProfileId: String(new Types.ObjectId()),
    };
    const request = {
      _id: new Types.ObjectId(),
      studentId: owner,
      status: 'APPROVED',
      revision: 2,
      groupId: new Types.ObjectId(),
    };
    const requests = {
      findOne: jest.fn().mockResolvedValue(request),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const groups = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const store = {
      validateYear: jest.fn(),
      snapshot: jest.fn().mockResolvedValue({
        fingerprint: 'a'.repeat(64),
        rows: [row],
        policy: {},
        truncated: false,
        mappingConflict: false,
      }),
      connection: {
        db: {
          collection: (name: string) =>
            name === 'admission_requests' ? requests : groups,
        },
      },
      entries: {
        findOne: jest.fn(() => query(entry)),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        create: jest.fn(),
      },
      profiles: { deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }) },
      users: { deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }) },
      years: { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) },
      audits: { create: jest.fn().mockResolvedValue([]) },
      hasReferences: jest.fn().mockResolvedValue(false),
    };
    const transactions = {
      run: async (work: (value: ClientSession) => Promise<unknown>) =>
        work(session),
    };
    const service = new StudentCodesService(
      store as unknown as StudentCodeStore,
      transactions as unknown as AdmissionTransactions,
    );
    const input = {
      academicYear: '2027-2028',
      yearPrefix: '28',
      fingerprint: 'a'.repeat(64),
      reason: 'Reviewed identity and academic history.',
      confirmed: true as const,
    };
    return {
      service,
      store,
      input,
      owner,
      actor,
      session,
      requests,
      groups,
      entry,
      row,
    };
  }

  it('rejects stale deletion before any identity, seat or admission write', async () => {
    const f = fixture();
    await expect(
      f.service.deleteStudent(
        '280001',
        { ...f.input, fingerprint: 'b'.repeat(64) },
        f.actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_PREVIEW_CHANGED' } });
    expect(f.requests.updateOne).not.toHaveBeenCalled();
    expect(f.groups.updateOne).not.toHaveBeenCalled();
    expect(f.store.users.deleteOne).not.toHaveBeenCalled();
  });

  it('cancels enrollment, releases the seat and removes the login in one transaction while holding its code', async () => {
    const f = fixture();
    await expect(
      f.service.deleteStudent('280001', f.input, f.actor),
    ).resolves.toMatchObject({ status: 'RELEASED', codeReleased: false });
    expect(f.requests.updateOne.mock.calls[0][1].$set.status).toBe('CANCELLED');
    expect(f.groups.updateOne.mock.calls[0][1].$inc.enrolled).toBe(-1);
    const held = f.store.entries.updateOne.mock.calls[0][1].$set;
    expect(held.status).toBe('RELEASED');
    expect(held.assignmentHistory).toHaveLength(1);
    expect(held.assignmentHistory[0]).toMatchObject({
      source: 'admission',
      releasedBy: new Types.ObjectId(f.actor),
      releaseReason: f.input.reason,
    });
    for (const write of [
      f.requests.updateOne,
      f.groups.updateOne,
      f.store.entries.updateOne,
      f.store.users.deleteOne,
      f.store.profiles.deleteOne,
      f.store.audits.create,
    ])
      expect(write.mock.calls[0].at(-1)).toEqual({ session: f.session });
  });

  it('stops deletion before removing the login if group enrollment is inconsistent', async () => {
    const f = fixture();
    f.groups.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(
      f.service.deleteStudent('280001', f.input, f.actor),
    ).rejects.toMatchObject({ response: { code: 'CODE_RECOVERY_UNSAFE' } });
    expect(f.store.users.deleteOne).not.toHaveBeenCalled();
  });

  it('never imports a held code or reuses a reserved code with assignment history', async () => {
    const f = fixture();
    f.entry.status = 'RELEASED';
    await expect(
      f.service.assertImportOwnership('280001', String(f.owner)),
    ).rejects.toMatchObject({ response: { code: 'CODE_RECOVERY_UNSAFE' } });
    f.row.status = 'RESERVED';
    f.entry.status = 'RESERVED';
    await expect(
      f.service.recover(
        '280001',
        { ...f.input, neverAssignedConfirmed: true },
        f.actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_RECOVERY_UNSAFE' } });
    expect(f.store.entries.updateOne).not.toHaveBeenCalled();
  });
  it('recovers an administrative hold only when it has no owner, request or assignment history', async () => {
    const f = fixture();
    f.row.status = 'RESERVED';
    f.store.entries.findOne.mockReturnValue(
      query({
        ...f.entry,
        status: 'RESERVED',
        currentStudentId: undefined,
        assignmentHistory: [],
      } as unknown as typeof f.entry),
    );
    await expect(
      f.service.recover(
        '280001',
        { ...f.input, neverAssignedConfirmed: true },
        f.actor,
      ),
    ).resolves.toEqual({ studentCode: '280001', status: 'AVAILABLE' });
    expect(f.store.entries.updateOne.mock.calls[0][1]).toEqual({
      $set: { status: 'AVAILABLE' },
    });
    expect(f.store.audits.create.mock.calls[0][0][0]).toMatchObject({
      action: 'RECOVERED',
      from: 'RESERVED',
      to: 'AVAILABLE',
      reason: f.input.reason,
    });
  });
  it('places a reviewed unused gap on hold and records the operator and reason', async () => {
    const f = fixture();
    f.row.status = 'MISSING';
    await expect(
      f.service.holdPreviousOwner('280001', f.input, f.actor),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    expect(f.store.entries.updateOne.mock.calls[0][1].$set.status).toBe(
      'RESERVED',
    );
    expect(f.store.audits.create.mock.calls[0][0][0]).toMatchObject({
      action: 'RESERVED_HELD',
      from: 'MISSING',
      to: 'RESERVED',
      reason: f.input.reason,
      actorId: new Types.ObjectId(f.actor),
    });
  });
});
