import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ClientSession, Model } from 'mongoose';
import type {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../schemas/attendance-record.schema';
import type { AttendanceSession } from '../schemas/attendance-session.schema';

type NewAttendanceRecord = Omit<AttendanceRecord, 'auditTrail'> &
  Partial<Pick<AttendanceRecord, 'auditTrail'>>;

const pendingWrites = new Map<string, Promise<AttendanceRecordDocument>>();

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
  sessions: Model<AttendanceSession>,
  records: Model<AttendanceRecord>,
  record: NewAttendanceRecord,
) {
  // Each transaction updates the same parent. Queue writes for that parent
  // within this process to avoid a burst of competing transaction retries.
  const key = `${sessions.db.id}:${record.sessionId.toString()}`;
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(() => persistAttendanceRecord(sessions, records, record));
  pendingWrites.set(key, write);

  try {
    return await write;
  } finally {
    if (pendingWrites.get(key) === write) pendingWrites.delete(key);
  }
}

async function persistAttendanceRecord(
  sessions: Model<AttendanceSession>,
  records: Model<AttendanceRecord>,
  record: NewAttendanceRecord,
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
  const assertBrowserAvailable = async (session?: ClientSession) => {
    // Identical hardware configurations can share a fingerprint. Use the
    // stored browser ID and keep the fingerprint on the record for review.
    if (!requiresOpenSession || !record.deviceId) return;

    const used = await records
      .exists({
        sessionId: record.sessionId,
        studentId: { $ne: record.studentId },
        deviceId: record.deviceId,
      })
      .session(session ?? null);
    if (used) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_DEVICE_ALREADY_USED',
        message: 'تم استخدام هذا المتصفح لتسجيل حضور طالب آخر في الجلسة.',
        messageEn:
          'This browser was already used to check in another student for this session.',
      });
    }
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
      await assertBrowserAvailable(session);
      const [created] = await records.create([record], { session });
      return created;
    });
  } catch (error) {
    // Standalone MongoDB does not support deleting the parent and its records.
    if (!isStandaloneTransactionError(error)) throw error;
    if (!(await sessions.exists(parentFilter()))) {
      await rejectUnavailableSession();
    }
    await assertBrowserAvailable();
    return records.create(record);
  }
}
