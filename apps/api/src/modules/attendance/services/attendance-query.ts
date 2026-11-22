import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import type { QueryAttendanceSessionsDto } from '../dto/attendance-session.dto';
import type { AttendanceSessionDocument } from '../schemas/attendance-session.schema';

export function attendanceSearchPattern(search?: string) {
  const value = search?.trim();
  return value
    ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : undefined;
}

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
  matchingInstructors: Types.ObjectId[] = [],
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
  const regex = attendanceSearchPattern(query.search);
  if (regex) {
    conditions.push({
      $or: [
        { courseCode: regex },
        { courseName: regex },
        { createdByName: regex },
        ...(matchingInstructors.length
          ? [{ createdBy: { $in: matchingInstructors } }]
          : []),
      ],
    });
  }
  return { $and: conditions };
}
