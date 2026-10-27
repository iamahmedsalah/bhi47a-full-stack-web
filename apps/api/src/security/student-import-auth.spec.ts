import {
  StudentImporter,
  explicitPasswordReset,
} from '../modules/uploads/importers/student.importer';
import { defaultPasswordHasher } from './password-hasher';

describe('student import credential preservation', () => {
  const existing = {
    _id: '507f1f77bcf86cd799439011',
    studentCode: '20231001',
    role: 'student',
    nationalId: '12345678901234',
    nationalIdHash: 'existing-national-id-hash',
    passwordHash: 'existing-account-password',
    isActive: false,
  };
  function fixture(rows: unknown[] = [existing]) {
    const select = jest
      .fn()
      .mockReturnValue({ lean: () => Promise.resolve(rows) });
    const model = {
      find: jest
        .fn()
        .mockReturnValueOnce({ select })
        .mockReturnValue({ lean: () => Promise.resolve([]) }),
      bulkWrite: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const importer = new StudentImporter(
      model as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { model, importer, select };
  }
  const row = {
    studentCode: existing.studentCode,
    fullName: 'Synthetic Student',
    nationalId: existing.nationalId,
    level: '3',
  };
  it.each([false, 'false', '0', '', undefined])(
    'does not interpret %j as a reset or reactivate an existing account',
    async (value) => {
      expect(explicitPasswordReset(value)).toBe(false);
      const { model, importer, select } = fixture();
      await importer.commit([
        { row: { ...row, mustChangePassword: value }, rowNum: 2 },
      ]);
      expect(select).toHaveBeenCalledWith(
        '+passwordHash +nationalIdHash +nationalId',
      );
      expect(model.updateOne).not.toHaveBeenCalled();
      const op = model.bulkWrite.mock.calls[0][0][0].updateOne;
      expect(op.upsert).toBe(false);
      expect(op.filter).toEqual({
        studentCode: existing.studentCode,
        role: 'student',
      });
      expect(op.update.$set).not.toHaveProperty('passwordHash');
      expect(op.update.$set).not.toHaveProperty('isActive');
      expect(op.update.$set).not.toHaveProperty('mustChangePassword');
    },
  );
  it('writes new bcrypt credentials with independent salts', async () => {
    const { model, importer } = fixture([]);
    await importer.commit([
      { row, rowNum: 2 },
      { row: { ...row, studentCode: '20231002' }, rowNum: 3 },
    ]);
    const ops = model.bulkWrite.mock.calls[0][0];
    const hashes = ops.map(
      (op: {
        updateOne: { update: { $setOnInsert: { passwordHash: string } } };
      }) => op.updateOne.update.$setOnInsert.passwordHash,
    );
    expect(hashes[0]).toMatch(/^\$2b\$12\$/);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(await defaultPasswordHasher.verify(row.nationalId, hashes[0])).toBe(
      true,
    );
  });
  it('explicit reset uses compare-and-swap and invalidates sessions; a lost race does not write the row', async () => {
    const { model, importer } = fixture();
    model.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const result = await importer.commit([
      { row: { ...row, mustChangePassword: true }, rowNum: 2 },
    ]);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: existing._id, passwordHash: existing.passwordHash },
      expect.objectContaining({ $inc: { tokenVersion: 1 } }),
    );
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
  });
  it('refuses a student code owned by staff', async () => {
    const { model, importer } = fixture([{ ...existing, role: 'staff' }]);
    expect((await importer.commit([{ row, rowNum: 2 }])).errors).toHaveLength(
      1,
    );
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });
});
