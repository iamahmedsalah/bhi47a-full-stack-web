import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CONTROL_ENABLED_COMPONENT_KEYS,
  PERMISSIONS,
} from '@student-portal/shared';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../../common/utils/pagination.util';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import {
  ControlSheet,
  ControlSheetDocument,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import type {
  ControlAuditQueryDto,
  ControlEntriesQueryDto,
  ControlTermQueryDto,
  OpenSheetDto,
} from '../dto/control.dto';
import { ControlAccessService } from './control-access.service';
import { GradingSchemeService } from './grading-scheme.service';
import { toControlEntry, type ControlEntry } from '../utils/control-entry.util';

export interface ControlRosterRow extends Partial<ControlEntry> {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr: string | null;
  /** Has a mark but no approved registration for this course/term. */
  notRegistered: boolean;
  score: number | null;
  status: string | null;
  rev: number;
  isPublished: boolean | null;
  updatedAt: string | null;
}

const MAX_ROSTER = 2000;

@Injectable()
export class ControlSheetsService {
  constructor(
    @InjectModel(ControlSheet.name)
    private readonly sheetModel: Model<ControlSheetDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly auditModel: Model<GradeAuditLogDocument>,
    private readonly access: ControlAccessService,
    private readonly schemes: GradingSchemeService,
  ) {}

  /** Courses the user may open for a term, with sheet/progress summaries. */
  async listCourses(user: AuthenticatedUser, query: ControlTermQueryDto) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const scoped = await this.access.listScopedCourseIds(
      user,
      query.academicYear,
      query.semester,
    );
    const courses = await this.courseModel
      .find(scoped ? { _id: { $in: scoped } } : { isActive: true })
      .select('code name nameAr nameEn')
      .sort({ code: 1 })
      .limit(500)
      .lean();
    if (courses.length === 0) return { items: [] };

    const courseIds = courses.map((c) => c._id);
    const codes = courses.map((c) => String(c.code).toUpperCase());
    const examTypes = [...CONTROL_ENABLED_COMPONENT_KEYS];

    const [sheets, counts, rosterCounts] = await Promise.all([
      this.sheetModel
        .find({
          courseId: { $in: courseIds },
          academicYear: query.academicYear,
          semester: query.semester,
          component: { $in: examTypes },
        })
        .lean(),
      this.gradeModel.aggregate<{
        _id: { courseId: Types.ObjectId; examType: string };
        entered: number;
        published: number;
      }>([
        {
          $match: {
            courseId: { $in: courseIds },
            academicYear: query.academicYear,
            semester: query.semester,
            examType: { $in: examTypes },
          },
        },
        {
          $group: {
            _id: { courseId: '$courseId', examType: '$examType' },
            entered: { $sum: 1 },
            published: { $sum: { $cond: ['$isPublished', 1, 0] } },
          },
        },
      ]),
      this.registrationModel.aggregate<{ _id: string; n: number }>([
        {
          $match: {
            academicYear: query.academicYear,
            semester: query.semester,
            status: 'approved',
            courses: { $in: codes },
          },
        },
        { $unwind: '$courses' },
        { $match: { courses: { $in: codes } } },
        { $group: { _id: { $toUpper: '$courses' }, n: { $sum: 1 } } },
      ]),
    ]);

    const sheetByKey = new Map(
      sheets.map((s) => [`${String(s.courseId)}:${s.component}`, s]),
    );
    const countByKey = new Map(
      counts.map((c) => [`${String(c._id.courseId)}:${c._id.examType}`, c]),
    );
    const rosterByCode = new Map(rosterCounts.map((r) => [r._id, r.n]));

    return {
      items: courses.map((course) => ({
        courseId: String(course._id),
        code: course.code,
        name: course.name,
        nameAr: course.nameAr ?? null,
        nameEn: course.nameEn ?? null,
        rosterCount: rosterByCode.get(String(course.code).toUpperCase()) ?? 0,
        components: examTypes.map((key) => {
          const sheet = sheetByKey.get(`${String(course._id)}:${key}`);
          const count = countByKey.get(`${String(course._id)}:${key}`);
          return {
            key,
            sheetId: sheet ? String(sheet._id) : null,
            locked: sheet?.locked ?? false,
            entered: count?.entered ?? 0,
            published: count?.published ?? 0,
          };
        }),
      })),
    };
  }

  /** Gets or creates the sheet for a course + term + component. */
  async openSheet(user: AuthenticatedUser, dto: OpenSheetDto) {
    const course = await this.requireCourse(dto.courseId);
    await this.access.assertCourseScope(
      user,
      course,
      dto.academicYear,
      dto.semester,
    );
    await this.schemes.requireEnabledComponent(
      dto.courseId,
      dto.academicYear,
      dto.semester,
      dto.component,
    );

    const filter = {
      academicYear: dto.academicYear,
      semester: dto.semester,
      courseId: course._id,
      component: dto.component,
    };
    const existing = await this.sheetModel.findOne(filter).lean();
    if (existing) {
      this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
      return this.getSheet(user, String(existing._id));
    }

    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_CREATE);
    const sheet = await this.sheetModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          courseCode: String(course.code).toUpperCase(),
          locked: false,
          createdBy: new Types.ObjectId(user._id),
        },
      },
      { upsert: true, new: true },
    );
    return this.getSheet(user, String(sheet._id));
  }

  async getSheet(user: AuthenticatedUser, sheetId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet, course } = await this.requireSheetInScope(user, sheetId);
    const rules = await this.schemes.requireEnabledComponent(
      String(sheet.courseId),
      sheet.academicYear,
      sheet.semester,
      sheet.component,
    );
    const caps = this.access.getCapabilities(user);
    const locker = sheet.lockedBy
      ? await this.userModel
          .findById(sheet.lockedBy)
          .select('name nameAr')
          .lean()
      : null;

    return {
      sheet: {
        id: String(sheet._id),
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        component: sheet.component,
        locked: sheet.locked,
        lockedAt: sheet.lockedAt ?? null,
        lockReason: sheet.lockReason ?? null,
        lockedByName: locker ? (locker.nameAr ?? locker.name) : null,
      },
      course: {
        id: String(course._id),
        code: course.code,
        name: course.name,
        nameAr: course.nameAr ?? null,
        nameEn: course.nameEn ?? null,
      },
      rules: {
        key: rules.key,
        nameAr: rules.nameAr,
        nameEn: rules.nameEn,
        max: rules.max,
        step: rules.step,
      },
      capabilities: {
        canEdit: caps.canEnter && !sheet.locked,
        canEditPublished: caps.canEditPublished,
        canManageStates: caps.canManageStates,
        canLock: caps.canLock && !sheet.locked,
        canUnlock: caps.canUnlock && sheet.locked,
        canManageSchemes: caps.canManageSchemes,
        canViewAudit: caps.canViewAudit,
      },
    };
  }

  /** Roster students left-joined with their marks (no record = not entered). */
  async listEntries(
    user: AuthenticatedUser,
    sheetId: string,
    query: ControlEntriesQueryDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet, course } = await this.requireSheetInScope(user, sheetId);

    const rosterIds = await this.getRosterStudentIds(
      course.code,
      sheet.academicYear,
      sheet.semester,
    );
    const grades = await this.gradeModel
      .find({
        courseId: sheet.courseId,
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        examType: sheet.component,
      })
      .limit(MAX_ROSTER)
      .lean();
    const gradeByStudent = new Map(grades.map((g) => [String(g.studentId), g]));

    const allIds = new Set<string>([...rosterIds, ...gradeByStudent.keys()]);
    const users = await this.userModel
      .find({ _id: { $in: [...allIds].map((id) => new Types.ObjectId(id)) } })
      .select('name nameAr studentCode')
      .lean();

    const needle = query.search?.trim().toLowerCase();
    const rows: ControlRosterRow[] = [];
    for (const u of users) {
      const id = String(u._id);
      const entry = toControlEntry(gradeByStudent.get(id) ?? null);
      const row: ControlRosterRow = {
        studentId: id,
        studentCode: u.studentCode ?? '',
        name: u.name,
        nameAr: u.nameAr ?? null,
        notRegistered: !rosterIds.has(id),
        score: entry?.score ?? null,
        status: entry?.status ?? null,
        rev: entry?.rev ?? 0,
        isPublished: entry?.isPublished ?? null,
        updatedAt: entry?.updatedAt ?? null,
      };
      if (
        needle &&
        !`${row.studentCode} ${row.name} ${row.nameAr ?? ''}`
          .toLowerCase()
          .includes(needle)
      ) {
        continue;
      }
      rows.push(row);
    }
    rows.sort((a, b) => a.studentCode.localeCompare(b.studentCode));
    return { entries: rows, total: rows.length };
  }

  async lock(user: AuthenticatedUser, sheetId: string, reason?: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_LOCK);
    const { sheet } = await this.requireSheetInScope(user, sheetId);
    const updated = await this.sheetModel.findOneAndUpdate(
      { _id: sheet._id, locked: false },
      {
        $set: {
          locked: true,
          lockedBy: new Types.ObjectId(user._id),
          lockedAt: new Date(),
          lockReason: reason?.trim() || undefined,
        },
      },
      { new: true },
    );
    if (!updated) throw new ConflictException('Sheet is already locked');
    await this.writeSheetAudit(sheet, 'LOCK', user._id, reason);
    return this.getSheet(user, sheetId);
  }

  async unlock(user: AuthenticatedUser, sheetId: string, reason: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_UNLOCK);
    const { sheet } = await this.requireSheetInScope(user, sheetId);
    const updated = await this.sheetModel.findOneAndUpdate(
      { _id: sheet._id, locked: true },
      {
        $set: { locked: false },
        $unset: { lockedBy: '', lockedAt: '', lockReason: '' },
      },
      { new: true },
    );
    if (!updated) throw new ConflictException('Sheet is not locked');
    await this.writeSheetAudit(sheet, 'UNLOCK', user._id, reason);
    return this.getSheet(user, sheetId);
  }

  async listAudit(
    user: AuthenticatedUser,
    sheetId: string,
    query: ControlAuditQueryDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_AUDIT_VIEW);
    const { sheet } = await this.requireSheetInScope(user, sheetId);
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: Record<string, unknown> = {
      courseId: sheet.courseId,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
    };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);

    const [rows, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(String(r.actorId));
      if (r.studentId) userIds.add(String(r.studentId));
    }
    const users = userIds.size
      ? await this.userModel
          .find({
            _id: { $in: [...userIds].map((i) => new Types.ObjectId(i)) },
          })
          .select('name nameAr studentCode')
          .lean()
      : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));

    return createPaginatedResult(
      rows.map((r) => {
        const actor = byId.get(String(r.actorId));
        const student = r.studentId ? byId.get(String(r.studentId)) : undefined;
        return {
          id: String(r._id),
          action: r.action,
          source: r.source,
          component: r.component,
          oldValue: r.oldValue ?? null,
          newValue: r.newValue ?? null,
          reason: r.reason ?? null,
          at: r.at,
          actorName: actor ? (actor.nameAr ?? actor.name) : null,
          studentCode: student?.studentCode ?? null,
          studentName: student ? (student.nameAr ?? student.name) : null,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /** Students with an approved registration containing the course for the term. */
  async getRosterStudentIds(
    courseCode: string,
    academicYear: string,
    semester: string,
    studentIds?: Types.ObjectId[],
  ): Promise<Set<string>> {
    const code = String(courseCode).toUpperCase();
    const rows = await this.registrationModel
      .find({
        academicYear,
        semester,
        status: 'approved',
        courses: { $in: [code, courseCode] },
        ...(studentIds ? { studentId: { $in: studentIds } } : {}),
      })
      .select('studentId')
      .limit(MAX_ROSTER)
      .lean();
    return new Set(rows.map((r) => String(r.studentId)));
  }

  async requireSheetInScope(user: AuthenticatedUser, sheetId: string) {
    const sheet = await this.sheetModel.findById(sheetId).lean();
    if (!sheet) throw new NotFoundException('Sheet not found');
    const course = await this.requireCourse(String(sheet.courseId));
    await this.access.assertCourseScope(
      user,
      course,
      sheet.academicYear,
      sheet.semester,
    );
    return { sheet, course };
  }

  private async requireCourse(courseId: string) {
    const course = await this.courseModel.findById(courseId).lean();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private async writeSheetAudit(
    sheet: {
      _id: Types.ObjectId;
      courseId: Types.ObjectId;
      academicYear: string;
      semester: string;
      component: string;
    },
    action: 'LOCK' | 'UNLOCK',
    actorId: string,
    reason?: string,
  ) {
    await this.auditModel.create({
      sheetId: sheet._id,
      courseId: sheet.courseId,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
      component: sheet.component,
      action,
      source: 'GRID',
      actorId: new Types.ObjectId(actorId),
      reason: reason?.trim() || undefined,
    });
  }
}
