import { ConflictException, ServiceUnavailableException } from '@nestjs/common';

interface WriteCounts {
  matchedCount: number;
  insertedCount: number;
}

function counts(value: unknown): WriteCounts | undefined {
  if (typeof value !== 'object' || value === null) return;
  const result = value as Partial<WriteCounts> & {
    getWriteConcernError?: () => unknown;
  };
  if (result.getWriteConcernError?.()) return;
  if (
    typeof result.matchedCount === 'number' &&
    typeof result.insertedCount === 'number'
  ) {
    return {
      matchedCount: result.matchedCount,
      insertedCount: result.insertedCount,
    };
  }
}

/** Keeps acknowledged partial writes visible without exposing database error values. */
export async function writeEnrollmentBatches<T>(
  operations: T[],
  write: (batch: T[]) => PromiseLike<WriteCounts>,
  writeKind: 'profiles' | 'registrations',
) {
  let appliedCount = 0;
  for (let offset = 0; offset < operations.length; offset += 100) {
    const batch = operations.slice(offset, offset + 100);
    let result: WriteCounts | undefined;
    let failed = false;
    try {
      result = counts(await write(batch));
    } catch (error) {
      failed = true;
      const detail = error as {
        result?: unknown;
        rawResult?: unknown;
        name?: string;
      } | null;
      result = counts(detail?.result) ?? counts(detail?.rawResult);
      // Mongoose returns no raw result if every insert failed validation.
      if (!result && detail?.name === 'MongooseBulkWriteError') {
        result = { matchedCount: 0, insertedCount: 0 };
      }
    }
    const applied = result ? result.matchedCount + result.insertedCount : 0;
    appliedCount += applied;
    if (failed || !result || applied !== batch.length) {
      const summary = {
        writeKind,
        plannedCount: operations.length,
        appliedCount,
        rejectedCount: result ? batch.length - applied : 0,
        uncertainCount: result ? 0 : batch.length,
        unattemptedCount: operations.length - offset - batch.length,
      };
      if (!result) {
        throw new ServiceUnavailableException({
          code: 'ENROLLMENT_WRITE_UNCERTAIN',
          message:
            'The write outcome is uncertain. Reload registrations before retrying the batch.',
          partialWrite: summary,
        });
      }
      throw new ConflictException({
        code: 'ENROLLMENT_CONCURRENT_UPDATE',
        message:
          'Some rows were not saved. Reload registrations and retry the batch to revalidate remaining students.',
        partialWrite: summary,
      });
    }
  }
}
