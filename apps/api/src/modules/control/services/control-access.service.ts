import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import {
  CourseStaffAssignment,
  CourseStaffAssignmentDocument,
} from '../../attendance/schemas/course-staff-assignment.schema';
import {
  courseStaffFilter,
  courseGradeEntryFilter,
  isAssignedToCourse,
  isFacultyMember,
  isSupportingAcademicStaff,
  isTeachingStaff,
} from '../../courses/utils/course-staff.util';

/** What the current user may do in Control. Sent to the UI and re-checked here. */
export interface ControlCapabilities {
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canApproveFinal: boolean;
  canReopen: boolean;
  canCreatePetitions: boolean;
  canApprovePetitions: boolean;
  canImport: boolean;
  canExport: boolean;
  canAccess: boolean;
  canView: boolean;
  canCreateSheets: boolean;
  canEnter: boolean;
  canEditReview: boolean;
  canGrace: boolean;
  canEditPublished: boolean;
  canManageStates: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canManageSchemes: boolean;
  canManageStaffEntry: boolean;
  canViewAudit: boolean;
  scopeAll: boolean;
}

@Injectable()
export class ControlAccessService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseStaffAssignment.name)
    private readonly assignmentModel: Model<CourseStaffAssignmentDocument>,
  ) {}

  private has(user: AuthenticatedUser, permission: string): boolean {
    return (
      user.role === 'admin' || Boolean(user.permissions?.includes(permission))
    );
  }

  /**
   * Permissions come from the user loaded by the JWT strategy on every request,
   * so a revoke takes effect on the next call.
   */
  getCapabilities(user: AuthenticatedUser): ControlCapabilities {
    const canAccess = this.has(user, PERMISSIONS.CONTROL_ACCESS);
    const gated = (permission: string) =>
      canAccess && this.has(user, permission);
    return {
      canSubmit: gated(PERMISSIONS.CONTROL_SHEETS_SUBMIT),
      canReview: gated(PERMISSIONS.CONTROL_SHEETS_REVIEW),
      canApprove: gated(PERMISSIONS.CONTROL_SHEETS_APPROVE),
      canApproveFinal: gated(PERMISSIONS.CONTROL_FINAL_APPROVE),
      canReopen: gated(PERMISSIONS.CONTROL_SHEETS_REOPEN),
      canCreatePetitions: gated(PERMISSIONS.CONTROL_PETITIONS_CREATE),
      canApprovePetitions: gated(PERMISSIONS.CONTROL_PETITIONS_APPROVE),
      canImport: gated(PERMISSIONS.CONTROL_IMPORT),
      canExport: gated(PERMISSIONS.CONTROL_EXPORT),
      canAccess,
      canView: gated(PERMISSIONS.CONTROL_SHEETS_VIEW),
      canCreateSheets: gated(PERMISSIONS.CONTROL_SHEETS_CREATE),
      canEnter: gated(PERMISSIONS.CONTROL_GRADES_ENTER),
      canEditReview: gated(PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT),
      canGrace: gated(PERMISSIONS.CONTROL_GRADES_GRACE),
      canEditPublished: gated(PERMISSIONS.CONTROL_GRADES_EDIT_PUBLISHED),
      canManageStates: gated(PERMISSIONS.CONTROL_STATES_MANAGE),
      canLock: gated(PERMISSIONS.CONTROL_SHEETS_LOCK),
      canUnlock: gated(PERMISSIONS.CONTROL_SHEETS_UNLOCK),
      canManageSchemes: gated(PERMISSIONS.CONTROL_SCHEMES_MANAGE),
      canManageStaffEntry:
        user.role === 'admin' || gated(PERMISSIONS.CONTROL_STAFF_ENTRY_MANAGE),
      canViewAudit: gated(PERMISSIONS.CONTROL_AUDIT_VIEW),
      scopeAll: gated(PERMISSIONS.CONTROL_SCOPE_ALL),
    };
  }

  /** Throws unless the user holds `control.access` and the given permission. */
  assertPermission(user: AuthenticatedUser, permission: string): void {
    if (
      !this.has(user, PERMISSIONS.CONTROL_ACCESS) ||
      !this.has(user, permission)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  /**
   * Course scope: `control.scope.all` (or admin) sees every course; otherwise
   * the user must be assigned to the course for the term.
   * For supporting academic staff (`teaching_assistant` / `assistant_lecturer`)
   * without `scopeAll`, courses are strictly hidden in Control unless explicitly
   * granted in `gradeEntryStaffIds` on that course.
   */
  async hasCourseScope(
    user: AuthenticatedUser,
    course: Pick<CourseDocument, '_id' | 'code'>,
    academicYear: string,
    semester: string,
  ): Promise<boolean> {
    if (this.getCapabilities(user).scopeAll) return true;
    const staffId = new Types.ObjectId(user._id);
    const [assignment, owned] = await Promise.all([
      this.assignmentModel
        .exists({
          staffId,
          courseCode: String(course.code).toUpperCase(),
          academicYear,
          semester,
          isActive: true,
        })
        .lean(),
      this.courseModel
        .exists({
          _id: course._id,
          ...courseStaffFilter(user._id),
        })
        .lean(),
    ]);
    if (!assignment && !owned) return false;
    if (this.requiresSupportingGrant(user)) {
      return Boolean(
        await this.courseModel
          .exists({
            _id: course._id,
            ...courseGradeEntryFilter(staffId),
          })
          .lean(),
      );
    }
    return true;
  }

  async assertCourseIdScope(
    user: AuthenticatedUser,
    courseId: string,
    academicYear: string,
    semester: string,
  ) {
    const course = await this.courseModel
      .findById(courseId)
      .select('_id code')
      .lean();
    if (!course) throw new ForbiddenException('Course not accessible');
    await this.assertCourseScope(user, course, academicYear, semester);
  }

  async assertCourseScope(
    user: AuthenticatedUser,
    course: Pick<CourseDocument, '_id' | 'code'>,
    academicYear: string,
    semester: string,
  ): Promise<void> {
    if (!(await this.hasCourseScope(user, course, academicYear, semester))) {
      throw new ForbiddenException('Course is outside your assigned scope');
    }
  }

  /**
   * Faculty doctors (`doctor`) are automatically authorized to write grades for
   * their assigned courses. Supporting academic staff (`teaching_assistant` and
   * `assistant_lecturer`) are blocked by default unless explicitly listed in
   * `course.gradeEntryStaffIds` for that specific course.
   */
  async canWriteCourseGrades(
    user: AuthenticatedUser,
    courseId: string | Types.ObjectId,
  ) {
    if (
      user.role === 'admin' ||
      (user.role === 'staff' && !isTeachingStaff(user.staffType)) ||
      process.env.CONTROL_COURSE_GRADE_GRANTS_ENFORCED === 'false'
    )
      return true;
    if (user.role !== 'staff') return false;
    const staffId = new Types.ObjectId(user._id);

    if (isFacultyMember(user.staffType)) {
      const assignedOnCourse = await this.courseModel
        .exists({
          _id: courseId,
          ...courseStaffFilter(user._id),
        })
        .lean();
      if (assignedOnCourse) return true;
      if (
        typeof this.courseModel.findById === 'function' &&
        typeof this.assignmentModel?.exists === 'function'
      ) {
        const course = await this.courseModel
          .findById(courseId)
          .select('code')
          .lean();
        if (course?.code) {
          return Boolean(
            await this.assignmentModel
              .exists({
                staffId,
                courseCode: String(course.code).toUpperCase(),
                isActive: true,
              })
              .lean(),
          );
        }
      }
      return false;
    }

    const grantedOnCourse = await this.courseModel
      .exists({
        _id: courseId,
        $and: [courseGradeEntryFilter(staffId)],
        ...courseStaffFilter(user._id),
      })
      .lean();
    if (grantedOnCourse) return true;

    if (
      typeof this.courseModel.findOne === 'function' &&
      typeof this.assignmentModel?.exists === 'function'
    ) {
      const grantedCourse = await this.courseModel
        .findOne({
          _id: courseId,
          ...courseGradeEntryFilter(staffId),
        })
        .select('code')
        .lean();
      if (grantedCourse?.code) {
        return Boolean(
          await this.assignmentModel
            .exists({
              staffId,
              courseCode: String(grantedCourse.code).toUpperCase(),
              isActive: true,
            })
            .lean(),
        );
      }
    }
    return false;
  }

  async assertCourseGradeWrite(
    user: AuthenticatedUser,
    courseId: string | Types.ObjectId,
  ) {
    if (!(await this.canWriteCourseGrades(user, courseId))) {
      throw new ForbiddenException(
        'Grade entry is not assigned for this course',
      );
    }
  }

  async petitionScope(
    user: AuthenticatedUser,
    term: { academicYear?: string; semester?: string },
  ): Promise<Record<string, unknown>> {
    if (this.getCapabilities(user).scopeAll) return {};
    const staffId = new Types.ObjectId(user._id);
    const assignmentFilter = {
      staffId,
      isActive: true,
      ...(term.academicYear ? { academicYear: term.academicYear } : {}),
      ...(term.semester ? { semester: term.semester } : {}),
    };
    const assignments = await this.assignmentModel
      .find(assignmentFilter)
      .select('courseCode academicYear semester')
      .lean();
    const codes = [
      ...new Set(assignments.map((item) => item.courseCode.toUpperCase())),
    ];
    const direct = courseStaffFilter(user._id);
    const requiresGrant = this.requiresSupportingGrant(user);
    const scoped = await this.courseModel
      .find({
        ...(requiresGrant ? { $and: [courseGradeEntryFilter(staffId)] } : {}),
        $or: [...(direct.$or ?? []), { code: { $in: codes } }],
      })
      .select(
        '_id code doctorId doctorIds doctors teachingAssistantId teachingAssistant teachingAssistantIds teachingAssistants',
      )
      .lean();
    const byCode = new Map(
      scoped.map((course) => [course.code.toUpperCase(), course._id]),
    );
    const directIds = scoped
      .filter((course) => isAssignedToCourse(course, user._id))
      .map((course) => course._id);
    const byTerm = new Map<
      string,
      {
        academicYear: string;
        semester: string;
        courseId: { $in: Types.ObjectId[] };
      }
    >();
    for (const { courseCode, academicYear, semester } of assignments) {
      const id = byCode.get(courseCode.toUpperCase());
      if (!id) continue;
      const key = JSON.stringify([academicYear, semester]);
      const entry = byTerm.get(key) ?? {
        academicYear,
        semester,
        courseId: { $in: [] },
      };
      entry.courseId.$in.push(id);
      byTerm.set(key, entry);
    }
    return { $or: [{ courseId: { $in: directIds } }, ...byTerm.values()] };
  }

  private requiresSupportingGrant(user: AuthenticatedUser) {
    return (
      user.role === 'staff' &&
      isSupportingAcademicStaff(user.staffType) &&
      process.env.CONTROL_COURSE_GRADE_GRANTS_ENFORCED !== 'false'
    );
  }

  /** `null` means unrestricted; otherwise the course ids the user may open. */
  async listScopedCourseIds(
    user: AuthenticatedUser,
    academicYear: string,
    semester: string,
  ): Promise<Types.ObjectId[] | null> {
    if (this.getCapabilities(user).scopeAll) return null;
    const staffId = new Types.ObjectId(user._id);
    const [assignments, owned] = await Promise.all([
      this.assignmentModel
        .find({ staffId, academicYear, semester, isActive: true })
        .select('courseCode')
        .lean(),
      this.courseModel.find(courseStaffFilter(user._id)).select('_id').lean(),
    ]);
    const codes = assignments.map((a) => String(a.courseCode).toUpperCase());
    const byCode = codes.length
      ? await this.courseModel
          .find({ code: { $in: codes } })
          .select('_id')
          .lean()
      : [];
    const ids = new Map<string, Types.ObjectId>();
    for (const c of [...owned, ...byCode]) ids.set(String(c._id), c._id);
    const scopedIds = [...ids.values()];
    if (this.requiresSupportingGrant(user)) {
      if (scopedIds.length === 0) return [];
      const granted = await this.courseModel
        .find({
          _id: { $in: scopedIds },
          ...courseGradeEntryFilter(staffId),
        })
        .select('_id')
        .lean();
      return granted.map((c) => c._id);
    }
    return scopedIds;
  }
}
