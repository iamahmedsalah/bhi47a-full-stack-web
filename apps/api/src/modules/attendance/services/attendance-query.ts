import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import type { QueryAttendanceSessionsDto } from '../dto/attendance-session.dto';
import type { AttendanceSessionDocument } from '../schemas/attendance-session.schema';

export interface AttendanceViewer {
  _id: string;
  role: string;
}

export function attendanceSessionScope(
  user: AttendanceViewer,
): FilterQuery<AttendanceSessionDocument> {
  return user.role === 'admin'
    ? {}
    : { createdBy: new Types.ObjectId(user._id) };
}

export function attendanceSessionFilter(
  user: AttendanceViewer,
  query: QueryAttendanceSessionsDto,
  now = new Date(),
): FilterQuery<AttendanceSessionDocument> {
  const conditions: FilterQuery<AttendanceSessionDocument>[] = [
    attendanceSessionScope(user),
  ];
  if (query.level && query.level !== 'all')
    conditions.push({ level: query.level.trim() });
  if (query.courseCode && query.courseCode !== 'all')
    conditions.push({ courseCode: query.courseCode.trim().toUpperCase() });
  if (query.status === 'OPEN')
    conditions.push({ status: 'OPEN', expiresAt: { $gt: now } });
  if (query.status === 'CLOSED') conditions.push({ status: 'CLOSED' });
  if (query.status === 'EXPIRED')
    conditions.push({
      $or: [
        { status: 'EXPIRED' },
        { status: 'OPEN', expiresAt: { $lte: now } },
      ],
    });
  if (query.status === 'ENDED')
    conditions.push({
      $or: [
        { status: { $in: ['CLOSED', 'EXPIRED'] } },
        { status: 'OPEN', expiresAt: { $lte: now } },
      ],
    });
  if (query.search?.trim()) {
    const regex = new RegExp(
      query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    conditions.push({
      $or: [
        { courseCode: regex },
        { courseName: regex },
        { createdByName: regex },
      ],
    });
  }
  return { $and: conditions };
}
