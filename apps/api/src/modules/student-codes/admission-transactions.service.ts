import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

@Injectable()
export class AdmissionTransactions {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  async run<T>(
    work: (session: ClientSession) => Promise<T>,
    prepare?: () => Promise<void>,
  ): Promise<T> {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName || hello.logicalSessionTimeoutMinutes === undefined) {
      throw new ServiceUnavailableException({
        code: 'ADMISSION_TRANSACTIONS_REQUIRED',
        message:
          'Admission writes require a MongoDB replica set with transaction support.',
      });
    }
    await prepare?.();
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: 10000,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      )
        throw new ConflictException({
          code: 'CODE_WRITE_CONFLICT',
          message:
            'A concurrent identity or year mapping changed. Refresh and retry.',
        });
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
