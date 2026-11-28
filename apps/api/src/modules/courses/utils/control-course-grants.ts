import {
  CONTROL_COURSE_ENTRY_PERMISSIONS,
  isSupportingAcademicStaff,
  PERMISSIONS,
} from '@student-portal/shared';
import { Types, type ClientSession, type Model } from 'mongoose';
import type { CourseStaffAssignmentDocument } from '../../attendance/schemas/course-staff-assignment.schema';
import type { UserDocument } from '../../users/schemas/user.schema';
import type { CourseDocument } from '../schemas/course.schema';
import { courseGradeEntryFilter, courseStaffFilter } from './course-staff.util';

export async function syncCourseEntryPermissions(
  staffIds: string[],
  users: Model<UserDocument>,
  courses: Model<CourseDocument>,
  assignments: Model<CourseStaffAssignmentDocument> | undefined,
  session: ClientSession,
  restoreOnly = false,
) {
  const ids = [...new Set(staffIds)].filter((id) => Types.ObjectId.isValid(id));
  if (!ids.length) return;
  const staff = await users
    .find({ _id: { $in: ids }, role: 'staff' })
    .select('_id staffType permissions')
    .session(session)
    .lean();
  for (const member of staff) {
    if (!isSupportingAcademicStaff(member.staffType)) continue;
    const activeAssignments = assignments
      ? await assignments
          .find({ staffId: member._id, isActive: true })
          .select('courseCode')
          .session(session)
          .lean()
      : [];
    const membership = courseStaffFilter(String(member._id));
    const grant = await courses
      .exists({
        $and: [courseGradeEntryFilter(member._id)],
        $or: [
          ...(membership.$or ?? []),
          {
            code: {
              $in: activeAssignments.map(({ courseCode }) =>
                courseCode.toUpperCase(),
              ),
            },
          },
        ],
      })
      .session(session)
      .lean();
    if (restoreOnly && !grant) continue;
    const bundle = [...CONTROL_COURSE_ENTRY_PERMISSIONS];
    await users.updateOne(
      { _id: member._id },
      {
        // Every grant mutation writes this account so concurrent transactions
        // cannot commit different snapshots of the same member's course grants.
        $inc: { controlGradeGrantRevision: 1 },
        ...(grant
          ? { $addToSet: { permissions: { $each: bundle } } }
          : !member.permissions?.includes(PERMISSIONS.CONTROL_SCOPE_ALL)
            ? { $pull: { permissions: { $in: bundle } } }
            : {}),
      },
      { session },
    );
  }
}
