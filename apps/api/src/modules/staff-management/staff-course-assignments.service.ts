import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  CONTROL_COURSE_ENTRY_PERMISSIONS,
  MAX_COURSE_DOCTORS,
} from '@student-portal/shared';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import { Course, type CourseDocument } from '../courses/schemas/course.schema';
import type { QueryStaffCoursesDto } from './dto/query-staff-courses.dto';
import {
  courseGradeEntryFilter,
  courseStaffFilter,
  withoutGradeEntryStaff,
  isSupportingAcademicStaff,
  isTeachingStaff,
} from '../courses/utils/course-staff.util';

import {
  CourseStaffAssignment,
  type CourseStaffAssignmentDocument,
} from '../attendance/schemas/course-staff-assignment.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { syncCourseEntryPermissions } from '../courses/utils/control-course-grants';

interface Member {
  _id: Types.ObjectId;
  name: string;
  nameAr?: string;
  role?: string;
  staffType?: string;
  titlePrefix?: string;
}
interface Assignment {
  _id: Types.ObjectId;
  name: string;
  nameAr?: string;
  staffType?: string;
  titlePrefix?: string;
}

@Injectable()
export class StaffCourseAssignmentsService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @Optional()
    @InjectModel(CourseStaffAssignment.name)
    private readonly attendanceAssignments?: Model<CourseStaffAssignmentDocument>,
  ) {}

  async list(query: QueryStaffCoursesDto, staffId?: string) {
    const filter = staffId ? courseStaffFilter(staffId) : {};
    const [items, total] = await Promise.all([
      this.courses
        .find(filter)
        .select('_id code name nameAr nameEn level')
        .sort({ code: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.courses.countDocuments(filter),
    ]);
    return { items, totalPages: Math.ceil(total / query.limit) };
  }

  async listGradeEntryCourseIds(staffId: string): Promise<string[]> {
    if (
      !Types.ObjectId.isValid(staffId) ||
      typeof this.courses.find !== 'function'
    ) {
      return [];
    }
    const items = await this.courses
      .find({
        $and: [
          await this.gradeEligibility(staffId),
          courseGradeEntryFilter(new Types.ObjectId(staffId)),
        ],
      })
      .select('_id')
      .lean();
    return items.map((c) => String(c._id));
  }

  private async activeAttendanceCodes(
    staffId: string,
    session?: ClientSession,
  ) {
    if (!this.attendanceAssignments) return [];
    const assignments = await this.attendanceAssignments
      .find({ staffId: new Types.ObjectId(staffId), isActive: true })
      .select('courseCode')
      .session(session ?? null)
      .lean();
    return [
      ...new Set(assignments.map(({ courseCode }) => courseCode.toUpperCase())),
    ];
  }

  private async gradeEligibility(staffId: string, session?: ClientSession) {
    const codes = await this.activeAttendanceCodes(staffId, session);
    return { $or: [courseStaffFilter(staffId), { code: { $in: codes } }] };
  }

  async setGradeEntryCourses(
    staff: Member,
    gradeEntryCourseIds: string[],
    session: ClientSession,
  ) {
    if (
      gradeEntryCourseIds.length &&
      (staff.role !== 'staff' || !isSupportingAcademicStaff(staff.staffType))
    ) {
      throw new BadRequestException(
        'Explicit grade entry is available for supporting academic staff',
      );
    }
    const selectedIds = [...new Set(gradeEntryCourseIds)];
    if (selectedIds.length) {
      const eligible = await this.courses
        .countDocuments({
          _id: { $in: selectedIds },
          ...(await this.gradeEligibility(String(staff._id), session)),
        })
        .session(session);
      if (eligible !== selectedIds.length) {
        throw new BadRequestException(
          'Grade entry may only be enabled on assigned courses',
        );
      }
    }
    await this.courses.updateMany(
      {
        _id: { $nin: selectedIds },
        ...courseGradeEntryFilter(staff._id),
      },
      [{ $set: { gradeEntryStaffIds: withoutGradeEntryStaff([staff._id]) } }],
      { session },
    );
    if (selectedIds.length) {
      await this.courses.updateMany(
        { _id: { $in: selectedIds } },
        [
          {
            $set: {
              gradeEntryStaffIds: {
                $concatArrays: [
                  withoutGradeEntryStaff([staff._id]),
                  [staff._id],
                ],
              },
            },
          },
        ],
        { session },
      );
    }
  }

  reconcileEntryPermissions(
    staff: Member,
    users: Model<UserDocument>,
    session: ClientSession,
  ) {
    return syncCourseEntryPermissions(
      [String(staff._id)],
      users,
      this.courses,
      this.attendanceAssignments,
      session,
    );
  }

  async restoreStoredCourseGrants(users: Model<UserDocument>) {
    const storedIds = await this.courses.distinct('gradeEntryStaffIds');
    const ids = [...new Set(storedIds.map(String))].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!ids.length) return 0;
    const staff = await users
      .find({
        _id: { $in: ids },
        role: 'staff',
        staffType: { $in: ['teaching_assistant', 'assistant_lecturer'] },
        permissions: { $not: { $all: [...CONTROL_COURSE_ENTRY_PERMISSIONS] } },
      })
      .select('_id')
      .lean();
    for (const member of staff) {
      await users.db.transaction((session) =>
        syncCourseEntryPermissions(
          [String(member._id)],
          users,
          this.courses,
          this.attendanceAssignments,
          session,
          true,
        ),
      );
    }
    return staff.length;
  }

  async sync(staff: Member, courseIds: string[], session: ClientSession) {
    if (
      courseIds.length &&
      (staff.role !== 'staff' || !isTeachingStaff(staff.staffType))
    ) {
      throw new BadRequestException(
        'Courses may only be assigned to teaching staff',
      );
    }
    const id = String(staff._id);
    const selected = new Set(courseIds);
    const attendanceCodes = new Set(
      await this.activeAttendanceCodes(id, session),
    );
    const courses = await this.courses
      .find({
        $or: [
          { _id: { $in: courseIds.map((value) => new Types.ObjectId(value)) } },
          courseStaffFilter(id),
        ],
      })
      .select('+contentSupervisorId +gradeEntryStaffIds')
      .session(session)
      .lean();
    if (
      courseIds.some(
        (value) => !courses.some((course) => String(course._id) === value),
      )
    ) {
      throw new BadRequestException(
        'One or more selected courses do not exist',
      );
    }
    for (const course of courses) {
      // Normalize existing scalar/array assignments without dropping other faculty.
      const collect = (
        ids: Types.ObjectId[],
        members: Assignment[],
        singles: Types.ObjectId[] = [],
        fallback?: Assignment,
      ) => {
        const map = new Map<string, Assignment>();
        for (const member of members ?? []) map.set(String(member._id), member);
        for (const value of [...(ids ?? []), ...singles]) {
          const key = String(value);
          if (!map.has(key))
            map.set(
              key,
              fallback && String(fallback._id) === key
                ? fallback
                : { _id: new Types.ObjectId(key), name: '' },
            );
        }
        map.delete(id);
        return map;
      };
      const doctors = collect(
        course.doctorIds,
        course.doctors,
        course.doctorId ? [course.doctorId] : [],
        course.doctorId
          ? {
              _id: course.doctorId,
              name: course.doctorName || '',
              nameAr: course.doctorNameAr,
            }
          : undefined,
      );
      const assistants = collect(
        course.teachingAssistantIds,
        course.teachingAssistants,
        [course.teachingAssistantId, course.teachingAssistant].filter(
          (value): value is Types.ObjectId => Boolean(value),
        ),
      );
      if (selected.has(String(course._id))) {
        const member = {
          _id: staff._id,
          name: staff.name,
          nameAr: staff.nameAr,
          staffType: staff.staffType,
          titlePrefix:
            staff.staffType === 'doctor' ? staff.titlePrefix : undefined,
        };
        (staff.staffType === 'doctor' ? doctors : assistants).set(id, member);
      }
      if (doctors.size > MAX_COURSE_DOCTORS)
        throw new BadRequestException(
          `A course can have at most ${MAX_COURSE_DOCTORS} doctors`,
        );
      const doctorList = [...doctors.values()];
      const assistantList = [...assistants.values()];
      const clearGradeEntry =
        !isSupportingAcademicStaff(staff.staffType) ||
        (!selected.has(String(course._id)) &&
          !attendanceCodes.has(String(course.code).toUpperCase()));
      await this.courses.updateOne(
        { _id: course._id },
        {
          $set: {
            doctorIds: doctorList.map((member) => member._id),
            doctors: doctorList,
            doctorId: doctorList[0]?._id ?? null,
            doctorName:
              doctorList
                .map((member) => member.name)
                .filter(Boolean)
                .join(' / ') || null,
            doctorNameAr:
              doctorList
                .map((member) => member.nameAr || member.name)
                .filter(Boolean)
                .join(' / ') || null,
            teachingAssistantIds: assistantList.map((member) => member._id),
            teachingAssistants: assistantList,
            ...(clearGradeEntry &&
            course.gradeEntryStaffIds?.some((member) => String(member) === id)
              ? {
                  gradeEntryStaffIds: course.gradeEntryStaffIds.filter(
                    (member) => String(member) !== id,
                  ),
                }
              : {}),
          },
          $unset: {
            teachingAssistantId: 1,
            teachingAssistant: 1,
            ...(String(course.contentSupervisorId) === id && !doctors.has(id)
              ? { contentSupervisorId: 1 }
              : {}),
          },
        },
        { session },
      );
    }
  }
}
