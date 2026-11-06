import { Types, type ClientSession } from 'mongoose';
import { StudentCodeAllocator } from './student-code-allocator.service';
import { StudentCodeMappingsService } from './student-code-mappings.service';
import type { StudentCodeStore } from './student-code-store.service';
import type { AdmissionTransactions } from './admission-transactions.service';

function query<T>(value: T) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    session() {
      return this;
    },
    lean: () => Promise.resolve(value),
  };
}
describe('End-year mapping correction sequence safety', () => {
  async function preview(
    nextSequence: number,
    legacyCount: number,
    newPrefixCode?: string,
    allocationPrefix?: string,
  ) {
    const store = {
      years: {
        find: () =>
          query([
            {
              _id: new Types.ObjectId(),
              academicYear: '2027-2028',
              yearPrefix: '27',
              allocationPrefix,
              nextSequence,
              revision: 0,
            },
          ]),
      },
      users: {
        find: () =>
          query(
            newPrefixCode
              ? [{ _id: new Types.ObjectId(), studentCode: newPrefixCode }]
              : [],
          ),
      },
      profiles: { find: () => query([]) },
      entries: {
        find: () =>
          query(
            Array.from({ length: legacyCount }, (_, index) => ({
              _id: new Types.ObjectId(),
              academicYear: '2027-2028',
              studentCode: `27${String(index + 1).padStart(4, '0')}`,
              sequence: index + 1,
              status: 'ASSIGNED',
            })),
          ),
      },
    } as unknown as StudentCodeStore;
    return new StudentCodeMappingsService(
      store,
      {} as AdmissionTransactions,
    ).preview();
  }
  it('corrects 2027-2028 to 28 with a fresh sequence for its corrected prefix', async () => {
    expect((await preview(2102, 0)).items[0]).toMatchObject({
      currentPrefix: '27',
      expectedPrefix: '28',
      nextSequence: 1,
      nextCode: '280001',
    });
  });
  it('ignores another prefix but protects codes already issued under the corrected prefix', async () => {
    expect((await preview(1, 100)).items[0].nextCode).toBe('280001');
    expect((await preview(1, 100, '280250')).items[0].nextCode).toBe('280251');
  });
  it('repairs counters carried over by an earlier prefix correction without changing issued codes', async () => {
    expect((await preview(2102, 100, undefined, '28')).items[0].nextCode).toBe(
      '280001',
    );
    expect((await preview(2102, 100, '280250', '28')).items[0].nextCode).toBe(
      '280251',
    );
    expect((await preview(251, 100, '280250', '28')).items).toHaveLength(0);
  });
  it('starts at 0001 when only another prefix has issued numbers', async () => {
    let cursor = 1;
    const studentId = String(new Types.ObjectId());
    const session = {} as ClientSession;
    const policy = {
      academicYear: '2027-2028',
      yearPrefix: '27',
      allocationPrefix: '28',
      nextSequence: 1,
    };
    const store = {
      years: {
        findOneAndUpdate: (filter: Record<string, unknown>) =>
          query(
            filter.nextSequence
              ? { ...policy, nextSequence: cursor++ }
              : policy,
          ),
        updateOne: (
          _filter: unknown,
          update: { $max: { nextSequence: number } },
        ) => {
          cursor = Math.max(cursor, update.$max.nextSequence);
          return Promise.resolve({ modifiedCount: 1 });
        },
      },
      entries: {
        findOne: (filter: Record<string, unknown>) =>
          query(
            filter.academicYear && filter.yearPrefix === '27' && !filter.status
              ? { sequence: 2101 }
              : null,
          ),
        exists: () => ({ session: () => Promise.resolve(null) }),
        create: jest.fn().mockResolvedValue([]),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      users: {
        findOne: () => query(null),
        exists: () => ({ session: () => Promise.resolve({ _id: studentId }) }),
      },
      profiles: {
        findOne: () => query(null),
        exists: () => ({ session: () => Promise.resolve({ _id: studentId }) }),
      },
      audits: { create: jest.fn().mockResolvedValue([]) },
      hasReferences: jest.fn().mockResolvedValue(false),
    };
    const transactions = {
      run: async (work: (value: ClientSession) => Promise<unknown>) =>
        work(session),
    };
    const createStudent = jest.fn((code: string) => {
      expect(code).toBe('280001');
      return Promise.resolve({ studentId });
    });
    const allocator = new StudentCodeAllocator(
      store as unknown as StudentCodeStore,
      transactions as unknown as AdmissionTransactions,
    );
    expect(
      await allocator.allocate(
        '2027-2028',
        String(new Types.ObjectId()),
        String(new Types.ObjectId()),
        createStudent,
      ),
    ).toMatchObject({ studentCode: '280001', studentId });
    expect(createStudent).toHaveBeenCalledTimes(1);
  });
});
