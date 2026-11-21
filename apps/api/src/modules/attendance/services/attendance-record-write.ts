import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ClientSession, Model } from 'mongoose';
import type {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../schemas/attendance-record.schema';
import type { AttendanceSessionDocument } from '../schemas/attendance-session.schema';

export function isStandaloneTransactionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 20 &&
    error.message.includes(
      'Transaction numbers are only allowed on a replica set member or mongos',
    )
  );
}

export async function createAttendanceRecord(
  sessions: Model<AttendanceSessionDocument>,
  records: Model<AttendanceRecordDocument>,
  record: Omit<AttendanceRecord, 'auditTrail'> &
    Partial<Pick<AttendanceRecord, 'auditTrail'>>,
) {
  const parent = { _id: record.sessionId };
  const requiresOpenSession = record.method === 'qr';
  const parentFilter = () =>
    requiresOpenSession
      ? { ...parent, status: 'OPEN', expiresAt: { $gt: new Date() } }
      : parent;
  const rejectUnavailableSession = async (session?: ClientSession) => {
    if (
      requiresOpenSession &&
      (await sessions.exists(parent).session(session ?? null))
    ) {
      throw new BadRequestException('جلسة الحضور مغلقة أو انتهت مدة صلاحيتها');
    }
    throw new NotFoundException('Attendance session not found');
  };

  try {
    return await sessions.db.transaction(async (session) => {
      // Write to the parent so closing or deleting it conflicts with record creation.
      const { matchedCount } = await sessions.updateOne(
        parentFilter(),
        { $inc: { __v: 1 } },
        { session, timestamps: false },
      );
      if (matchedCount === 0) {
        await rejectUnavailableSession(session);
      }
      const [created] = await records.create([record], { session });
      return created;
    });
  } catch (error) {
    // Standalone MongoDB does not support deleting the parent and its records.
    if (!isStandaloneTransactionError(error)) throw error;
    if (!(await sessions.exists(parentFilter()))) {
      await rejectUnavailableSession();
    }
    return records.create(record);
  }
}
