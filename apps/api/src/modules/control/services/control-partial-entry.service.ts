import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import {
  CONTROL_SCORELESS_STATES,
  PERMISSIONS,
  computeCoursework,
  validateMark,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Grade, type GradeDocument } from '../../grades/schemas/grade.schema';
import { ControlReleaseStore } from '../../grades/control-release.store';
import {
  StudentProfile,
  type StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { User, type UserDocument } from '../../users/schemas/user.schema';
import {
  ControlSheet,
  type ControlSheetDocument,
  type ControlSheetPartialCycle,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  type GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import type {
  ApprovePartialEntryDto,
  OpenPartialEntryDto,
  ReturnPartialEntryDto,
  SubmitPartialEntryDto,
} from '../dto/control-partial.dto';
import { ControlAccessService } from './control-access.service';
import { ControlAttemptsService } from './control-attempts.service';
import { ControlSheetsService } from './control-sheets.service';
import { GradingSchemeService } from './grading-scheme.service';

const SCORELESS = CONTROL_SCORELESS_STATES as readonly string[];

export interface PartialCandidate {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr: string | null;
  currentStatus: string | null;
  reasonKind: 'unentered' | 'excused' | 'incomplete';
  tuitionBlocked: boolean;
  tuitionStatus: string | null;
}

@Injectable()
export class ControlPartialEntryService {
  constructor(
    @InjectModel(ControlSheet.name)
    private readonly sheetModel: Model<ControlSheetDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private readonly profileModel: Model<StudentProfileDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly auditModel: Model<GradeAuditLogDocument>,
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly schemes: GradingSchemeService,
    private readonly attempts: ControlAttemptsService,
  ) {}

  private computePartialDigest(
    cycleId: string,
    schemeVersion: number,
    docs: Array<{
      studentId: Types.ObjectId | string;
      grade: number;
      status: string;
      rev?: number;
      attendanceMark?: number;
      quizzesMark?: number;
    }>,
  ): string {
    const normalized = [...docs]
      .sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)))
      .map((d) => [
        String(d.studentId),
        d.grade,
        d.status,
        d.rev ?? 0,
        d.attendanceMark ?? null,
        d.quizzesMark ?? null,
      ]);
    return createHash('sha256')
      .update(JSON.stringify({ cycleId, schemeVersion, marks: normalized }))
      .digest('hex');
  }

  private assertCanSubmitPartial(user: AuthenticatedUser) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_ACCESS);
    const caps = this.access.getCapabilities(user);
    if (!caps.canSubmit && !caps.canReview) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertCanReturnPartial(user: AuthenticatedUser, component: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_ACCESS);
    const caps = this.access.getCapabilities(user);
    const canApproveComponent =
      component === 'final' ? caps.canApproveFinal : caps.canApprove;
    if (!caps.canReview && !canApproveComponent) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertCanApprovePartial(user: AuthenticatedUser, component: string) {
    this.access.assertPermission(
      user,
      component === 'final'
        ? PERMISSIONS.CONTROL_FINAL_APPROVE
        : PERMISSIONS.CONTROL_SHEETS_APPROVE,
    );
  }

  async listCandidates(
    user: AuthenticatedUser,
    sheetId: string,
    includeExcused = false,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet, course } = await this.sheets.requireSheetInScope(
      user,
      sheetId,
    );
    if (sheet.locked) {
      throw new ConflictException({
        code: 'SHEET_LOCKED',
        message: 'الكشف مقفول حاليًا ولا يمكن فتح الرصد الجزئي عليه',
      });
    }
    if ((sheet.workflowState ?? 'DRAFT') !== 'APPROVED') {
      throw new ConflictException({
        code: 'PARTIAL_REQUIRES_APPROVED',
        message: 'يمكن فتح الرصد الجزئي فقط بعد اعتماد الكشف الأصلي (APPROVED)',
      });
    }

    const rosterIds = await this.sheets.getRosterStudentIds(
      course.code,
      sheet.academicYear,
      sheet.semester,
    );
    if (rosterIds.size === 0) {
      return {
        sheetId: String(sheet._id),
        revision: sheet.revision ?? 0,
        component: sheet.component,
        candidates: [] as PartialCandidate[],
      };
    }

    const rosterObjectIds = [...rosterIds].map((id) => new Types.ObjectId(id));
    const [grades, users, profiles] = await Promise.all([
      this.gradeModel
        .find({
          courseId: sheet.courseId,
          academicYear: sheet.academicYear,
          semester: sheet.semester,
          examType: sheet.component,
          studentId: { $in: rosterObjectIds },
          cleared: { $ne: true },
        })
        .select('studentId status cleared')
        .lean(),
      this.userModel
        .find({ _id: { $in: rosterObjectIds }, role: 'student' })
        .select('studentCode name nameAr')
        .lean(),
      this.profileModel
        .find({ userId: { $in: rosterObjectIds } })
        .select('userId isBlocked tuitionFeesStatus')
        .lean(),
    ]);

    const gradeByStudent = new Map(grades.map((g) => [String(g.studentId), g]));
    const profileByStudent = new Map(
      profiles.map((p) => [String(p.userId), p]),
    );

    const allowExcusedStates = includeExcused && sheet.component !== 'midterm';
    const candidates: PartialCandidate[] = [];

    for (const u of users) {
      const id = String(u._id);
      const grade = gradeByStudent.get(id);
      let reasonKind: PartialCandidate['reasonKind'] | null = null;
      if (!grade || grade.cleared) {
        reasonKind = 'unentered';
      } else if (
        allowExcusedStates &&
        (grade.status === 'excused' || grade.status === 'incomplete')
      ) {
        reasonKind = grade.status;
      }
      if (!reasonKind) continue;

      const profile = profileByStudent.get(id);
      candidates.push({
        studentId: id,
        studentCode: u.studentCode ?? '',
        name: u.name ?? '',
        nameAr: (u as { nameAr?: string }).nameAr ?? null,
        currentStatus: grade && !grade.cleared ? (grade.status ?? null) : null,
        reasonKind,
        tuitionBlocked: profile?.isBlocked === true,
        tuitionStatus: profile?.tuitionFeesStatus ?? null,
      });
    }

    candidates.sort((a, b) => a.studentCode.localeCompare(b.studentCode));

    return {
      sheetId: String(sheet._id),
      revision: sheet.revision ?? 0,
      component: sheet.component,
      candidates,
    };
  }

  async openPartial(
    user: AuthenticatedUser,
    sheetId: string,
    dto: OpenPartialEntryDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_REOPEN);
    const { sheet: targetSheet, course } =
      await this.sheets.requireSheetInScope(user, sheetId);
    const resolvedId = String(targetSheet._id);

    const uniqueStudentIds = [...new Set(dto.studentIds.map(String))];
    if (uniqueStudentIds.length === 0) {
      throw new BadRequestException(
        'يجب اختيار طالب واحد على الأقل لفتح الرصد الجزئي',
      );
    }

    const session = await this.sheetModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheetModel
          .findById(resolvedId)
          .session(session)
          .lean();
        if (!sheet) throw new NotFoundException('Sheet not found');
        if (sheet.locked) {
          throw new ConflictException({
            code: 'SHEET_LOCKED',
            message: 'الكشف مقفول ولا يمكن فتح الرصد الجزئي عليه',
          });
        }
        if ((sheet.workflowState ?? 'DRAFT') !== 'APPROVED') {
          throw new ConflictException({
            code: 'PARTIAL_REQUIRES_APPROVED',
            message: 'لا يمكن فتح الرصد الجزئي إلا على كشف معتمد (APPROVED)',
          });
        }
        if ((sheet.revision ?? 0) !== dto.expectedRevision) {
          throw new ConflictException('STALE_REVISION');
        }

        const studentObjectIds = uniqueStudentIds.map(
          (id) => new Types.ObjectId(id),
        );
        const rosterIds = await this.sheets.getRosterStudentIds(
          course.code,
          sheet.academicYear,
          sheet.semester,
          studentObjectIds,
          session,
        );
        const students = await this.userModel
          .find({ _id: { $in: studentObjectIds }, role: 'student' })
          .select('studentCode name')
          .session(session)
          .lean();
        const studentById = new Map(students.map((s) => [String(s._id), s]));

        const heldProfiles = await this.profileModel
          .find({ userId: { $in: studentObjectIds }, isBlocked: true })
          .select('userId')
          .session(session)
          .lean();
        const heldSet = new Set(heldProfiles.map((p) => String(p.userId)));

        const existingGrades = await this.gradeModel
          .find({
            courseId: sheet.courseId,
            academicYear: sheet.academicYear,
            semester: sheet.semester,
            examType: sheet.component,
            studentId: { $in: studentObjectIds },
            cleared: { $ne: true },
          })
          .select('studentId status cleared')
          .session(session)
          .lean();
        const gradeByStudent = new Map(
          existingGrades.map((g) => [String(g.studentId), g]),
        );

        const allowExcused =
          Boolean(dto.includeExcused) && sheet.component !== 'midterm';

        for (const sid of uniqueStudentIds) {
          const student = studentById.get(sid);
          if (!student) {
            throw new BadRequestException(`Student not found: ${sid}`);
          }
          if (!rosterIds.has(sid)) {
            throw new BadRequestException(
              `الطالب ${student.studentCode ?? student.name} غير مسجل في هذا المقرر`,
            );
          }
          if (heldSet.has(sid)) {
            throw new ForbiddenException(
              `الطالب ${student.studentCode ?? student.name} محجوب ماليًا ولا يمكن فتح الرصد له قبل سداد المصروفات`,
            );
          }
          const existing = gradeByStudent.get(sid);
          const isAllowedExcused =
            allowExcused &&
            Boolean(
              existing &&
              (existing.status === 'excused' ||
                existing.status === 'incomplete'),
            );
          if (existing && !existing.cleared && !isAllowedExcused) {
            throw new ConflictException(
              `الطالب ${student.studentCode ?? student.name} لديه درجة/حالة مرصودة ومعتمدة بالفعل ولا يمكن تعديلها عبر الرصد الجزئي`,
            );
          }
        }

        const sanitizedStudentReasons: Record<string, string> = {};
        if (dto.studentReasons) {
          for (const sid of uniqueStudentIds) {
            const raw = dto.studentReasons[sid];
            if (typeof raw === 'string' && raw.trim()) {
              sanitizedStudentReasons[sid] = raw.trim().slice(0, 300);
            }
          }
        }

        const now = new Date();
        const openReason = dto.reason?.trim() || undefined;
        const partialCycle: ControlSheetPartialCycle = {
          cycleId: randomUUID(),
          phase: 'EDITING',
          revision: 0,
          allowedStudentIds: uniqueStudentIds,
          ...(Object.keys(sanitizedStudentReasons).length > 0
            ? { studentReasons: sanitizedStudentReasons }
            : {}),
          ...(openReason ? { openReason } : {}),
          openedBy: user._id,
          openedAt: now,
        };

        const updated = await this.sheetModel.updateOne(
          {
            _id: sheet._id,
            locked: false,
            workflowState: 'APPROVED',
            revision: dto.expectedRevision,
          },
          {
            $set: {
              workflowState: 'PARTIAL_OPEN',
              partialCycle,
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (updated.matchedCount !== 1) {
          throw new ConflictException('STALE_REVISION');
        }

        await this.auditModel.create(
          [
            {
              sheetId: sheet._id,
              courseId: sheet.courseId,
              academicYear: sheet.academicYear,
              semester: sheet.semester,
              component: sheet.component,
              action: 'PARTIAL_OPEN',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: { workflowState: 'APPROVED' },
              newValue: {
                workflowState: 'PARTIAL_OPEN',
                cycleId: partialCycle.cycleId,
                allowedStudentIds: uniqueStudentIds,
                studentCount: uniqueStudentIds.length,
              },
              reason: openReason,
              at: now,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return this.sheets.getSheet(user, resolvedId);
  }

  async submitPartial(
    user: AuthenticatedUser,
    sheetId: string,
    dto: SubmitPartialEntryDto,
  ) {
    this.assertCanSubmitPartial(user);
    const { sheet: targetSheet, course } =
      await this.sheets.requireSheetInScope(user, sheetId);
    const resolvedId = String(targetSheet._id);

    const session = await this.sheetModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheetModel
          .findById(resolvedId)
          .session(session)
          .lean();
        if (!sheet) throw new NotFoundException('Sheet not found');
        if (sheet.locked) {
          throw new ConflictException({
            code: 'SHEET_LOCKED',
            message: 'SHEET_LOCKED',
          });
        }
        const cycle = sheet.partialCycle;
        if (
          sheet.workflowState !== 'PARTIAL_OPEN' ||
          !cycle ||
          !['EDITING', 'RETURNED'].includes(cycle.phase)
        ) {
          throw new ConflictException('INVALID_WORKFLOW_TRANSITION');
        }
        if (cycle.revision !== dto.expectedPartialRevision) {
          throw new ConflictException('STALE_REVISION');
        }

        await this.schemes.freeze(
          String(sheet.courseId),
          sheet.academicYear,
          sheet.semester,
          session,
        );
        const scheme = await this.schemes.getScheme(
          String(sheet.courseId),
          sheet.academicYear,
          sheet.semester,
          session,
        );
        const rules = scheme.components.find((c) => c.key === sheet.component)!;
        const allowedIds = cycle.allowedStudentIds;
        const allowedObjectIds = allowedIds.map((id) => new Types.ObjectId(id));
        const rosterSet = await this.sheets.getRosterStudentIds(
          course.code,
          sheet.academicYear,
          sheet.semester,
          allowedObjectIds,
          session,
        );

        const docs = await this.gradeModel
          .find({
            courseId: sheet.courseId,
            academicYear: sheet.academicYear,
            semester: sheet.semester,
            examType: sheet.component,
            studentId: { $in: allowedObjectIds },
            cleared: { $ne: true },
          })
          .session(session)
          .sort({ studentId: 1 })
          .lean();

        const docByStudent = new Map(docs.map((d) => [String(d.studentId), d]));
        const missingCount = allowedIds.filter(
          (id) => !docByStudent.has(id),
        ).length;
        const invalidDocs = docs.filter(
          (d) =>
            !rosterSet.has(String(d.studentId)) ||
            d.maxGrade !== rules.max ||
            ((d.status === 'present' || d.status === 'withheld') &&
              Boolean(validateMark(d.grade, rules))),
        );

        if (missingCount > 0 || invalidDocs.length > 0) {
          throw new ConflictException({
            code: 'PARTIAL_RESULT_INCOMPLETE',
            message:
              'يجب رصد درجات جميع الطلاب المحددين في الدورة الجزئية قبل الإرسال للاعتماد',
            details: {
              allowedCount: allowedIds.length,
              enteredCount: docs.length,
              missingCount,
              invalidCount: invalidDocs.length,
            },
          });
        }

        if (
          sheet.component === 'coursework' &&
          docs.some(
            (d) =>
              !d.carriedFrom &&
              !SCORELESS.includes(d.status) &&
              (computeCoursework(
                d.attendanceMark as number,
                d.quizzesMark as number,
              ) !== d.grade ||
                (d.attendanceMark ?? 0) > scheme.courseworkAttendanceMax ||
                (d.quizzesMark ?? 0) > scheme.courseworkQuizzesMax),
          )
        ) {
          throw new ConflictException('COURSEWORK_BREAKDOWN_REQUIRED');
        }

        const now = new Date();
        const digest = this.computePartialDigest(
          cycle.cycleId,
          scheme.version,
          docs,
        );

        const updated = await this.sheetModel.updateOne(
          {
            _id: sheet._id,
            locked: false,
            workflowState: 'PARTIAL_OPEN',
            'partialCycle.cycleId': cycle.cycleId,
            'partialCycle.revision': dto.expectedPartialRevision,
          },
          {
            $set: {
              'partialCycle.phase': 'PENDING_APPROVAL',
              'partialCycle.submittedBy': user._id,
              'partialCycle.submittedAt': now,
              'partialCycle.submissionDigest': digest,
            },
            $unset: { 'partialCycle.returnReason': '' },
            $inc: {
              'partialCycle.revision': 1,
              revision: 1,
            },
          },
          { session },
        );
        if (updated.matchedCount !== 1) {
          throw new ConflictException('STALE_REVISION');
        }

        await this.auditModel.create(
          [
            {
              sheetId: sheet._id,
              courseId: sheet.courseId,
              academicYear: sheet.academicYear,
              semester: sheet.semester,
              component: sheet.component,
              action: 'PARTIAL_SUBMIT',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: { workflowState: 'PARTIAL_OPEN', phase: cycle.phase },
              newValue: {
                workflowState: 'PARTIAL_OPEN',
                phase: 'PENDING_APPROVAL',
                cycleId: cycle.cycleId,
                digest,
                allowedStudentIds: allowedIds,
              },
              reason: dto.reason?.trim() || undefined,
              at: now,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return this.sheets.getSheet(user, resolvedId);
  }

  async returnPartial(
    user: AuthenticatedUser,
    sheetId: string,
    dto: ReturnPartialEntryDto,
  ) {
    const { sheet: targetSheet } = await this.sheets.requireSheetInScope(
      user,
      sheetId,
    );
    this.assertCanReturnPartial(user, targetSheet.component);
    const resolvedId = String(targetSheet._id);

    const session = await this.sheetModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheetModel
          .findById(resolvedId)
          .session(session)
          .lean();
        if (!sheet) throw new NotFoundException('Sheet not found');
        if (sheet.locked) throw new ConflictException('SHEET_LOCKED');
        const cycle = sheet.partialCycle;
        if (
          sheet.workflowState !== 'PARTIAL_OPEN' ||
          cycle?.phase !== 'PENDING_APPROVAL'
        ) {
          throw new ConflictException('INVALID_WORKFLOW_TRANSITION');
        }
        if (cycle.revision !== dto.expectedPartialRevision) {
          throw new ConflictException('STALE_REVISION');
        }

        const now = new Date();
        const reason = dto.reason.trim();
        const updated = await this.sheetModel.updateOne(
          {
            _id: sheet._id,
            locked: false,
            workflowState: 'PARTIAL_OPEN',
            'partialCycle.cycleId': cycle.cycleId,
            'partialCycle.revision': dto.expectedPartialRevision,
          },
          {
            $set: {
              'partialCycle.phase': 'RETURNED',
              'partialCycle.returnReason': reason,
              'partialCycle.returnedBy': user._id,
              'partialCycle.returnedAt': now,
            },
            $unset: { 'partialCycle.submissionDigest': '' },
            $inc: {
              'partialCycle.revision': 1,
              revision: 1,
            },
          },
          { session },
        );
        if (updated.matchedCount !== 1) {
          throw new ConflictException('STALE_REVISION');
        }

        await this.auditModel.create(
          [
            {
              sheetId: sheet._id,
              courseId: sheet.courseId,
              academicYear: sheet.academicYear,
              semester: sheet.semester,
              component: sheet.component,
              action: 'PARTIAL_RETURN',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: {
                workflowState: 'PARTIAL_OPEN',
                phase: 'PENDING_APPROVAL',
              },
              newValue: {
                workflowState: 'PARTIAL_OPEN',
                phase: 'RETURNED',
                cycleId: cycle.cycleId,
                allowedStudentIds: cycle.allowedStudentIds,
              },
              reason,
              at: now,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return this.sheets.getSheet(user, resolvedId);
  }

  async approvePartial(
    user: AuthenticatedUser,
    sheetId: string,
    dto: ApprovePartialEntryDto,
  ) {
    const { sheet: targetSheet } = await this.sheets.requireSheetInScope(
      user,
      sheetId,
    );
    this.assertCanApprovePartial(user, targetSheet.component);
    const resolvedId = String(targetSheet._id);

    const releaseStore = new ControlReleaseStore(this.sheetModel.db);
    await releaseStore.prepare();

    const session = await this.sheetModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheetModel
          .findById(resolvedId)
          .session(session)
          .lean();
        if (!sheet) throw new NotFoundException('Sheet not found');
        if (sheet.locked) throw new ConflictException('SHEET_LOCKED');

        const cycle = sheet.partialCycle;
        if (
          sheet.workflowState !== 'PARTIAL_OPEN' ||
          cycle?.phase !== 'PENDING_APPROVAL'
        ) {
          throw new ConflictException('INVALID_WORKFLOW_TRANSITION');
        }
        if (cycle.revision !== dto.expectedPartialRevision) {
          throw new ConflictException('STALE_REVISION');
        }

        if (
          user.role !== 'admin' &&
          cycle.submittedBy &&
          String(cycle.submittedBy) === String(user._id)
        ) {
          throw new ForbiddenException(
            'مقدّم درجات الرصد الجزئي لا يمكنه اعتمادها بنفسه (فصل المهام)',
          );
        }

        const scheme = await this.schemes.getScheme(
          String(sheet.courseId),
          sheet.academicYear,
          sheet.semester,
          session,
        );
        const allowedIds = cycle.allowedStudentIds;
        const allowedObjectIds = allowedIds.map((id) => new Types.ObjectId(id));

        const allowedDocs = await this.gradeModel
          .find({
            courseId: sheet.courseId,
            academicYear: sheet.academicYear,
            semester: sheet.semester,
            examType: sheet.component,
            studentId: { $in: allowedObjectIds },
            cleared: { $ne: true },
          })
          .session(session)
          .sort({ studentId: 1 })
          .lean();

        if (allowedDocs.length !== allowedIds.length) {
          throw new ConflictException('PARTIAL_RESULT_INCOMPLETE');
        }

        const digest = this.computePartialDigest(
          cycle.cycleId,
          scheme.version,
          allowedDocs,
        );
        if (cycle.submissionDigest !== digest) {
          throw new ConflictException('ROSTER_OR_SCHEME_CHANGED');
        }

        if (sheet.component === 'final') {
          await this.attempts.approve(
            sheet,
            sheet._id,
            user._id,
            dto.attemptReviewDigest,
            dto.keepPreviousStudentIds ?? [],
            session,
          );
        }

        const activePointer = await this.sheetModel.db
          .collection('control_release_pointers')
          .findOne({ _id: sheet._id, active: true }, { session });

        await this.gradeModel.updateMany(
          { _id: { $in: allowedDocs.map((d) => d._id) } },
          [
            {
              $set: {
                controlManaged: true,
                controlApprovedRev: { $ifNull: ['$rev', 0] },
                ...(activePointer ? { isPublished: true } : {}),
              },
            },
          ],
          { session },
        );

        const approvedSet = new Set(allowedIds);
        const remainingUnentered = (sheet.unenteredStudentIds ?? []).filter(
          (id) => !approvedSet.has(id),
        );
        const remainingDeferred = (
          sheet.tuitionDeferredStudentIds ?? []
        ).filter((id) => !approvedSet.has(id));

        const now = new Date();
        const updatedSheetResult = await this.sheetModel.updateOne(
          {
            _id: sheet._id,
            locked: false,
            workflowState: 'PARTIAL_OPEN',
            'partialCycle.cycleId': cycle.cycleId,
            'partialCycle.revision': dto.expectedPartialRevision,
          },
          {
            $set: {
              workflowState: 'APPROVED',
              partialCycle: null,
              approvedBy: new Types.ObjectId(user._id),
              approvedAt: now,
              unenteredStudentIds: remainingUnentered,
              tuitionDeferredStudentIds: remainingDeferred,
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (updatedSheetResult.matchedCount !== 1) {
          throw new ConflictException('STALE_REVISION');
        }

        if (activePointer) {
          const closedSheet = await this.sheetModel
            .findById(sheet._id)
            .session(session)
            .lean();
          if (closedSheet) {
            await releaseStore.activate(
              closedSheet,
              user._id,
              session,
              undefined,
              allowedIds,
            );
          }
        }

        await this.auditModel.create(
          [
            {
              sheetId: sheet._id,
              courseId: sheet.courseId,
              academicYear: sheet.academicYear,
              semester: sheet.semester,
              component: sheet.component,
              action: 'PARTIAL_APPROVE',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: {
                workflowState: 'PARTIAL_OPEN',
                cycleId: cycle.cycleId,
              },
              newValue: {
                workflowState: 'APPROVED',
                cycleId: cycle.cycleId,
                allowedStudentIds: allowedIds,
                publishedImmediately: Boolean(activePointer),
                approvedMarks: allowedDocs.map((d) => ({
                  studentId: String(d.studentId),
                  score: d.grade,
                  status: d.status,
                  rev: d.rev ?? 0,
                })),
              },
              reason: dto.reason?.trim() || undefined,
              at: now,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return this.sheets.getSheet(user, resolvedId);
  }
}
