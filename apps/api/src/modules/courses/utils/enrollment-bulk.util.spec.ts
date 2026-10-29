import { writeEnrollmentBatches } from './enrollment-bulk.util';

describe('enrollment partial writes', () => {
  it('bounds writes and reports acknowledged, rejected and unattempted rows after a concurrent edit', async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce({ matchedCount: 100, insertedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 98, insertedCount: 0 });
    await expect(
      writeEnrollmentBatches(
        Array.from({ length: 250 }),
        write,
        'registrations',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ENROLLMENT_CONCURRENT_UPDATE',
        partialWrite: {
          appliedCount: 198,
          rejectedCount: 2,
          uncertainCount: 0,
          unattemptedCount: 50,
        },
      },
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.every(([ops]) => ops.length === 100)).toBe(true);
  });

  it('handles duplicate-key partial results without exposing raw database values', async () => {
    const write = jest.fn().mockRejectedValue({
      code: 11000,
      message: 'private-student-id',
      result: { matchedCount: 0, insertedCount: 1 },
    });
    const error = await writeEnrollmentBatches(
      [1, 2],
      write,
      'registrations',
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      response: { partialWrite: { appliedCount: 1, rejectedCount: 1 } },
    });
    expect(JSON.stringify(error)).not.toContain('private-student-id');
  });

  it('does not report network failures as confirmed rejections', async () => {
    const write = jest.fn().mockRejectedValue(new Error('network failure'));
    await expect(
      writeEnrollmentBatches([1, 2], write, 'registrations'),
    ).rejects.toMatchObject({
      response: {
        code: 'ENROLLMENT_WRITE_UNCERTAIN',
        partialWrite: { appliedCount: 0, rejectedCount: 0, uncertainCount: 2 },
      },
    });
  });

  it('does not treat a write concern failure as an acknowledged write', async () => {
    const write = jest.fn().mockRejectedValue({
      result: {
        matchedCount: 2,
        insertedCount: 0,
        getWriteConcernError: () => ({ code: 64 }),
      },
    });
    await expect(
      writeEnrollmentBatches([1, 2], write, 'registrations'),
    ).rejects.toMatchObject({
      response: {
        code: 'ENROLLMENT_WRITE_UNCERTAIN',
        partialWrite: { appliedCount: 0, uncertainCount: 2 },
      },
    });
  });

  it.each([undefined, { matchedCount: 0, insertedCount: 1 }])(
    'reports unordered schema-validation failures with raw result %p',
    async (rawResult) => {
      const write = jest
        .fn()
        .mockRejectedValue({ name: 'MongooseBulkWriteError', rawResult });
      await expect(
        writeEnrollmentBatches([1, 2], write, 'registrations'),
      ).rejects.toMatchObject({
        response: {
          partialWrite: {
            appliedCount: rawResult ? 1 : 0,
            rejectedCount: rawResult ? 1 : 2,
            uncertainCount: 0,
          },
        },
      });
    },
  );
});
