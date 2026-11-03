import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CONTROL_RESTRICTED_STATES,
  CONTROL_SCORELESS_STATES,
  PERMISSIONS,
  calculateGradeScale,
  validateMark,
  type ControlSchemeComponent,
  type GradeStatus,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import { GradesService } from '../../grades/grades.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  ControlSheet,
  ControlSheetDocument,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  GradeAuditLogDocument,
  type GradeAuditAction,
  type GradeAuditSnapshot,
} from '../schemas/grade-audit-log.schema';
import type { ApplyChangesDto, GradeChangeDto } from '../dto/control.dto';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { GradingSchemeService } from './grading-scheme.service';
import { toControlEntry, type ControlEntry } from '../utils/control-entry.util';

export type ChangeResultCode = 'ok' | 'invalid' | 'conflict' | 'forbidden';

export interface ChangeResult {
  opId: string;
  studentId: string;
  result: ChangeResultCode;
  /** Machine-readable reason for non-ok results. */
  code?: string;
  message?: string;
  /** True when the same opId was already applied and nothing changed. */
  duplicate?: boolean;
  /** The cell's state after this call (null when cleared). */
  entry?: ControlEntry | null;
  /** On conflict: the value currently stored, for "theirs / yours" resolution. */
  current?: ControlEntry | null;
}

const RESTRICTED = CONTROL_RESTRICTED_STATES as readonly string[];
const SCORELESS = CONTROL_SCORELESS_STATES as readonly string[];
const round2 = (n: number) => Math.round(n * 100) / 100;

type GradeLean = Grade & { _id: Types.ObjectId; updatedAt?: Date };

@Injectable()
export class ControlGradesService {
  private readonly logger = new Logger(ControlGradesService.name);

  constructor(
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ControlSheet.name)
    private readonly sheetModel: Model<ControlSheetDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly auditModel: Model<GradeAuditLogDocument>,
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly schemes: GradingSchemeService,
    private readonly gradesService: GradesService,
  ) {}

  /**
   * The single write path for Control. Rows succeed or fail independently so a
   * bad cell never loses the others; every applied change gets an audit row.
   */
  async applyChanges(
    user: AuthenticatedUser,
    sheetId: string,
    dto: ApplyChangesDto,
    source: 'GRID' | 'XLSX' = 'GRID',
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER);
    const caps = this.access.getCapabilities(user);

    const sheet = await this.sheetModel.findById(sheetId).lean();
    if (!sheet) throw new NotFoundException('Sheet not found');
    const course = await this.courseModel.findById(sheet.courseId).lean();
    if (!course) throw new NotFoundException('Course not found');
    await this.access.assertCourseScope(
      user,
      course,
      sheet.academicYear,
      sheet.semester,
    );
    if (sheet.locked) {
      throw new ConflictException({
        code: 'SHEET_LOCKED',
        message: 'Sheet is locked and cannot be edited',
      });
    }
    const rules = await this.schemes.requireEnabledComponent(
      String(sheet.courseId),
      sheet.academicYear,
      sheet.semester,
      sheet.component,
    );

    const studentObjectIds = [
      ...new Set(dto.changes.map((c) => c.studentId)),
    ].map((id) => new Types.ObjectId(id));
    const baseFilter = {
      courseId: sheet.courseId,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
      examType: sheet.component,
    };

    const [students, existingDocs, rosterIds, priorOps] = await Promise.all([
      this.userModel
        .find({ _id: { $in: studentObjectIds }, role: 'student' })
        .select('studentCode')
        .lean(),
      this.gradeModel
        .find({ ...baseFilter, studentId: { $in: studentObjectIds } })
        .lean<GradeLean[]>(),
      this.sheets.getRosterStudentIds(
        course.code,
        sheet.academicYear,
        sheet.semester,
        studentObjectIds,
      ),
      this.auditModel
        .find({ opId: { $in: dto.changes.map((c) => c.opId) } })
        .select('opId')
        .lean(),
    ]);

    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const docByStudent = new Map(
      existingDocs.map((d) => [String(d.studentId), d]),
    );
    const appliedOps = new Set(priorOps.map((o) => o.opId));
    const seenStudents = new Set<string>();

    const results: ChangeResult[] = [];
    const auditRows: Array<Record<string, unknown>> = [];
    const progressStudentIds = new Set<string>();
    let createdAny = false;

    for (const change of dto.changes) {
      const base = { opId: change.opId, studentId: change.studentId };

      if (appliedOps.has(change.opId)) {
        results.push({
          ...base,
          result: 'ok',
          duplicate: true,
          entry: toControlEntry(docByStudent.get(change.studentId)),
        });
        continue;
      }
      if (seenStudents.has(change.studentId)) {
        results.push({
          ...base,
          result: 'invalid',
          code: 'duplicate_student_in_batch',
          message: 'Student appears more than once in the same batch',
        });
        continue;
      }
      seenStudents.add(change.studentId);

      const student = studentById.get(change.studentId);
      const existing = docByStudent.get(change.studentId);
      if (!student) {
        results.push({
          ...base,
          result: 'invalid',
          code: 'student_not_found',
          message: 'Student not found',
        });
        continue;
      }

      const plan = this.planChange(change, dto.reason, {
        rules,
        caps,
        existing,
        inRoster: rosterIds.has(change.studentId),
      });
      if (plan.kind === 'reject') {
        results.push({ ...base, ...plan.result });
        continue;
      }
      if (plan.kind === 'noop') {
        results.push({
          ...base,
          result: 'ok',
          entry: toControlEntry(existing),
        });
        continue;
      }

      const filter = { ...baseFilter, studentId: student._id };
      const outcome = await this.persist({
        plan,
        change,
        filter,
        studentCode: student.studentCode ?? '',
        course,
        rules,
        actorId: user._id,
        hasExisting: Boolean(existing),
      });

      if (outcome.kind === 'conflict') {
        const current = await this.gradeModel.findOne(filter).lean<GradeLean>();
        results.push({
          ...base,
          result: 'conflict',
          code: 'rev_mismatch',
          message: 'The value was changed by someone else',
          current: toControlEntry(current),
        });
        continue;
      }

      const action: GradeAuditAction = plan.clear
        ? 'CLEAR'
        : existing
          ? 'UPDATE'
          : 'CREATE';
      if (action === 'CREATE') createdAny = true;
      const after = outcome.doc;
      if (existing?.isPublished || after?.isPublished) {
        progressStudentIds.add(change.studentId);
      }

      auditRows.push({
        sheetId: sheet._id,
        gradeId: existing?._id ?? after?._id,
        studentId: student._id,
        courseId: sheet.courseId,
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        component: sheet.component,
        action,
        source,
        oldValue: this.snapshot(existing),
        newValue: this.snapshot(after),
        actorId: new Types.ObjectId(user._id),
        reason: plan.reason,
        opId: change.opId,
        at: new Date(),
      });
      results.push({ ...base, result: 'ok', entry: toControlEntry(after) });
    }

    if (auditRows.length > 0) {
      try {
        await this.auditModel.insertMany(auditRows, { ordered: false });
      } catch (error) {
        // Marks are already stored; surface loudly so the gap can be reconciled.
        this.logger.error(
          `Failed to write ${auditRows.length} audit row(s) for sheet ${sheetId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (createdAny) {
      await this.schemes
        .freeze(String(sheet.courseId), sheet.academicYear, sheet.semester)
        .catch((error: unknown) =>
          this.logger.error('Failed to freeze grading scheme', String(error)),
        );
    }
    if (progressStudentIds.size > 0) {
      await this.gradesService
        .syncPublishedAcademicProgress([...progressStudentIds])
        .catch((error: unknown) =>
          this.logger.error(
            'Failed to sync academic progress',
            error instanceof Error ? error.stack : String(error),
          ),
        );
    }

    const summary = { ok: 0, invalid: 0, conflict: 0, forbidden: 0 };
    for (const r of results) summary[r.result] += 1;
    return { results, summary };
  }

  private snapshot(
    doc: GradeLean | null | undefined,
  ): GradeAuditSnapshot | null {
    const entry = toControlEntry(doc);
    if (!entry) return null;
    return {
      score: entry.score,
      status: entry.status,
      isPublished: entry.isPublished,
      rev: entry.rev,
    };
  }

  private planChange(
    change: GradeChangeDto,
    batchReason: string | undefined,
    ctx: {
      rules: ControlSchemeComponent;
      caps: ReturnType<ControlAccessService['getCapabilities']>;
      existing: GradeLean | undefined;
      inRoster: boolean;
    },
  ):
    | { kind: 'reject'; result: Omit<ChangeResult, 'opId' | 'studentId'> }
    | { kind: 'noop' }
    | {
        kind: 'write';
        clear: boolean;
        status: GradeStatus | null;
        score: number | null;
        reason: string | undefined;
      } {
    const reject = (
      result: ChangeResultCode,
      code: string,
      message: string,
    ) => ({
      kind: 'reject' as const,
      result: { result, code, message },
    });
    const { rules, caps, existing } = ctx;
    const hasScore = change.score !== undefined && change.score !== null;
    const status: GradeStatus | null =
      change.status ?? (hasScore ? 'present' : null);
    const reason = (change.reason ?? batchReason)?.trim() || undefined;

    if (status === null) {
      if (!existing) return { kind: 'noop' };
    } else if (SCORELESS.includes(status)) {
      if (hasScore) {
        return reject(
          'invalid',
          'score_not_allowed',
          'This state carries no mark',
        );
      }
    } else {
      // present / withheld need a valid mark.
      if (!hasScore) {
        return reject('invalid', 'score_required', 'A mark is required');
      }
      const error = validateMark(change.score as number, rules);
      if (error) {
        return reject('invalid', error, `Invalid mark: ${error}`);
      }
    }

    if (
      (status && RESTRICTED.includes(status)) ||
      (existing?.status && RESTRICTED.includes(existing.status))
    ) {
      if (!caps.canManageStates) {
        return reject(
          'forbidden',
          'states_permission',
          'Setting this state requires control.states.manage',
        );
      }
      if (!reason || reason.length < 3) {
        return reject('invalid', 'reason_required', 'A reason is required');
      }
    }

    if (existing?.isPublished) {
      if (!caps.canEditPublished) {
        return reject(
          'forbidden',
          'published_permission',
          'Editing a published grade requires control.grades.edit_published',
        );
      }
      if (!reason || reason.length < 3) {
        return reject(
          'invalid',
          'reason_required',
          'A reason is required to edit a published grade',
        );
      }
    }

    if (!existing && status !== null && !ctx.inRoster) {
      return reject(
        'invalid',
        'not_in_roster',
        'Student has no approved registration for this course and term',
      );
    }

    const score =
      status && !SCORELESS.includes(status)
        ? round2(change.score as number)
        : null;
    if (
      existing &&
      status !== null &&
      existing.status === status &&
      (SCORELESS.includes(status) || existing.grade === score)
    ) {
      return { kind: 'noop' };
    }

    return { kind: 'write', clear: status === null, status, score, reason };
  }

  private async persist(args: {
    plan: {
      clear: boolean;
      status: GradeStatus | null;
      score: number | null;
      reason: string | undefined;
    };
    change: GradeChangeDto;
    filter: Record<string, unknown>;
    studentCode: string;
    course: {
      _id: Types.ObjectId;
      code: string;
      name: string;
      nameAr?: string;
      nameEn?: string;
    };
    rules: ControlSchemeComponent;
    actorId: string;
    hasExisting: boolean;
  }): Promise<{ kind: 'ok'; doc: GradeLean | null } | { kind: 'conflict' }> {
    const { plan, change, filter, rules } = args;
    const revFilter =
      change.expectedRev === 0
        ? { rev: { $in: [0, null] } }
        : { rev: change.expectedRev };

    if (plan.clear) {
      const removed = await this.gradeModel
        .findOneAndDelete({ ...filter, ...revFilter })
        .lean<GradeLean>();
      return removed ? { kind: 'ok', doc: null } : { kind: 'conflict' };
    }

    const status = plan.status as GradeStatus;
    const grade = plan.score ?? 0;
    const percentage =
      rules.max > 0 && plan.score !== null
        ? round2((grade / rules.max) * 100)
        : 0;
    const scale = calculateGradeScale(percentage, status);
    const data = {
      studentId: filter.studentId,
      studentCode: args.studentCode,
      courseId: args.course._id,
      courseCode: args.course.code,
      courseName: args.course.name,
      courseNameAr: args.course.nameAr,
      courseNameEn: args.course.nameEn || args.course.name,
      examType: rules.key,
      grade,
      maxGrade: rules.max,
      percentage,
      letterGrade: scale.letter,
      gradePoints: scale.points,
      status,
      academicYear: filter.academicYear,
      semester: filter.semester,
      updatedBy: new Types.ObjectId(args.actorId),
    };

    try {
      const doc = await this.gradeModel
        .findOneAndUpdate(
          { ...filter, ...revFilter },
          {
            $set: data,
            $inc: { rev: 1 },
            // Control never publishes: new records stay hidden until the
            // existing Grades module publishes them.
            $setOnInsert: { isPublished: false },
          },
          { upsert: change.expectedRev === 0, new: true },
        )
        .lean<GradeLean>();
      return doc ? { kind: 'ok', doc } : { kind: 'conflict' };
    } catch (error) {
      // Upsert collided with the unique index: a record with a higher rev exists.
      if ((error as { code?: number })?.code === 11000) {
        return { kind: 'conflict' };
      }
      throw error;
    }
  }
}
