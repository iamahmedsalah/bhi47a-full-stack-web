import type { Connection, Model } from 'mongoose';
import { StudentCodeStore } from './student-code-store.service';
import type {
  StudentCodeYear,
  StudentCodeEntry,
  StudentCodeAuditLog,
} from './schemas/student-code.schema';
import type { User } from '../users/schemas/user.schema';
import type { StudentProfile } from '../students/schemas/student-profile.schema';
import type { AdmissionPeriod } from '../admissions/schemas/admission-period.schema';

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
describe('Student-code audit year selection', () => {
  const policy = (
    academicYear: string,
    yearPrefix: string,
  ): StudentCodeYear => ({
    academicYear,
    yearPrefix,
    nextSequence: 1,
    revision: 0,
    initializedAt: new Date('2026-01-01'),
    initializationReason: 'Synthetic reviewed mapping',
  });
  function fixture(current: StudentCodeYear | null, other: StudentCodeYear) {
    const findOne = jest.fn((filter: Record<string, unknown>) =>
      query(filter.academicYear ? current : other),
    );
    const store = new StudentCodeStore(
      {} as Connection,
      { find: () => query([]) } as unknown as Model<StudentCodeEntry>,
      { findOne } as unknown as Model<StudentCodeYear>,
      {} as Model<StudentCodeAuditLog>,
      { find: () => query([]) } as unknown as Model<User>,
      { find: () => query([]) } as unknown as Model<StudentProfile>,
      {
        exists: () => ({ session: () => Promise.resolve(true) }),
      } as unknown as Model<AdmissionPeriod>,
    );
    return { store, findOne };
  }
  it('uses 2026-2027 even if an older 2027-2028 policy also claims 27', async () => {
    const expected = policy('2026-2027', '27');
    const { store, findOne } = fixture(expected, policy('2027-2028', '27'));
    const snapshot = await store.snapshot('2026-2027', '27');
    expect(snapshot.policy).toBe(expected);
    expect(snapshot.mappingConflict).toBe(false);
    expect(findOne).toHaveBeenCalledWith({ academicYear: '2026-2027' });
  });
  it('still blocks initialization when another year owns the requested start', async () => {
    const { store } = fixture(null, policy('2027-2028', '27'));
    const snapshot = await store.snapshot('2026-2027', '27');
    expect(snapshot.mappingConflict).toBe(true);
    expect(snapshot.canInitialize).toBe(false);
  });
});
