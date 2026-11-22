import type { Model, Types } from 'mongoose';
import {
  formatStaffDisplayName,
  inferDoctorPrefix,
  type StaffDisplayLike,
} from '@student-portal/shared';
import type { UserDocument } from '../../users/schemas/user.schema';
import { attendanceSearchPattern } from './attendance-query';

export async function findAttendanceInstructors(
  users: Model<UserDocument>,
  search?: string,
) {
  const pattern = attendanceSearchPattern(search);
  if (!pattern) return [];
  return users.distinct('_id', {
    role: { $in: ['staff', 'admin'] },
    $or: [{ name: pattern }, { nameAr: pattern }],
  });
}

export async function loadAttendanceInstructors(
  users: Model<UserDocument>,
  sessions: { createdBy?: Types.ObjectId }[],
) {
  const ids = [
    ...new Set(
      sessions.flatMap(({ createdBy }) =>
        createdBy ? [createdBy.toString()] : [],
      ),
    ),
  ];
  if (!ids.length) return new Map<string, StaffDisplayLike>();
  const instructors = await users
    .find({ _id: { $in: ids } })
    .select('name nameAr staffType titlePrefix')
    .lean();
  return new Map<string, StaffDisplayLike>(
    instructors.map((instructor) => [instructor._id.toString(), instructor]),
  );
}

export function attendanceInstructor(
  session: {
    createdBy?: Types.ObjectId;
    createdByName: string;
    academicPosition: string;
  },
  instructors: ReadonlyMap<string, StaffDisplayLike>,
) {
  const profile =
    session.createdBy && instructors.get(session.createdBy.toString());
  const staffType =
    profile?.staffType &&
    ['doctor', 'teaching_assistant', 'assistant_lecturer'].includes(
      profile.staffType,
    )
      ? profile.staffType
      : session.academicPosition === 'doctor'
        ? 'doctor'
        : 'teaching_assistant';
  const names = {
    name: profile?.name || session.createdByName,
    nameAr: profile?.nameAr,
  };
  const titlePrefix =
    staffType === 'doctor'
      ? profile?.titlePrefix ||
        inferDoctorPrefix(names.nameAr) ||
        inferDoctorPrefix(names.name)
      : undefined;
  const instructor = { ...names, staffType, titlePrefix };
  return {
    createdByNameAr: formatStaffDisplayName(instructor, 'ar'),
    createdByNameEn: formatStaffDisplayName(instructor, 'en'),
    instructorStaffType: staffType,
    instructorTitlePrefix: titlePrefix,
  };
}
