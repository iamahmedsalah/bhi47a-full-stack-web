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

/** What the current user may do in Control. Sent to the UI and re-checked here. */
export interface ControlCapabilities {
  canSubmit: boolean;
  canReview: boolean;
  canImport: boolean;
  canExport: boolean;
  canAccess: boolean;
  canView: boolean;
  canCreateSheets: boolean;
  canEnter: boolean;
  canEditPublished: boolean;
  canManageStates: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canManageSchemes: boolean;
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
      canImport: gated(PERMISSIONS.CONTROL_IMPORT),
      canExport: gated(PERMISSIONS.CONTROL_EXPORT),
      canAccess,
      canView: gated(PERMISSIONS.CONTROL_SHEETS_VIEW),
      canCreateSheets: gated(PERMISSIONS.CONTROL_SHEETS_CREATE),
      canEnter: gated(PERMISSIONS.CONTROL_GRADES_ENTER),
      canEditPublished: gated(PERMISSIONS.CONTROL_GRADES_EDIT_PUBLISHED),
      canManageStates: gated(PERMISSIONS.CONTROL_STATES_MANAGE),
      canLock: gated(PERMISSIONS.CONTROL_SHEETS_LOCK),
      canUnlock: gated(PERMISSIONS.CONTROL_SHEETS_UNLOCK),
      canManageSchemes: gated(PERMISSIONS.CONTROL_SCHEMES_MANAGE),
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
   * the user must be assigned to the course for the term, either through an
   * active staff assignment or as the course's doctor/teaching assistant.
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
          $or: [{ doctorIds: staffId }, { teachingAssistantIds: staffId }],
        })
        .lean(),
    ]);
    return Boolean(assignment || owned);
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
      this.courseModel
        .find({
          $or: [{ doctorIds: staffId }, { teachingAssistantIds: staffId }],
        })
        .select('_id')
        .lean(),
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
    return [...ids.values()];
  }
}
