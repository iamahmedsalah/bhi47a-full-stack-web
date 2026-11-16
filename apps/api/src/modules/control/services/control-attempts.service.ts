import { attemptConflict } from '../utils/attempt-errors.util';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import {
  PERMISSIONS,
  validateMark,
  CONTROL_SCORELESS_STATES,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Grade, type GradeDocument } from '../../grades/schemas/grade.schema';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { GradingSchemeService } from './grading-scheme.service';
import { ControlAttemptStore } from '../control-attempt.store';
import type { ControlSheet } from '../schemas/control-sheet.schema';

@Injectable()
export class ControlAttemptsService {
  constructor(
    @InjectModel(Grade.name) private readonly grades: Model<GradeDocument>,
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly schemes: GradingSchemeService,
  ) {}
  private get store() {
    return new ControlAttemptStore(this.grades.db);
  }
  approve(
    scope: ControlSheet,
    sheetId: Types.ObjectId,
    actorId: string,
    digest: string | undefined,
    keep: string[],
    session: ClientSession,
  ) {
    return this.store.approve(scope, sheetId, actorId, digest, keep, session);
  }
  async preview(user: AuthenticatedUser, sheetId: string, page: number) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const capabilities = this.access.getCapabilities(user);
    if (!capabilities.canReview && !capabilities.canApproveFinal)
      throw new ForbiddenException(
        'Review permission required / \u0635\u0644\u0627\u062d\u064a\u0629 \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u062f\u0631\u062c\u0627\u062a \u0645\u0637\u0644\u0648\u0628\u0629',
      );
    const { sheet } = await this.sheets.requireSheetInScope(user, sheetId);
    const preview = await this.store.preview(sheet);
    const carried = [
      ...new Map(
        preview.currentMarks
          .filter((mark) => mark.carriedFrom)
          .map((mark) => [
            String(mark.studentId),
            {
              studentId: String(mark.studentId),
              studentCode: mark.studentCode,
              ...mark.carriedFrom!,
            },
          ]),
      ).values(),
    ];
    const carriedKeys = new Set(
      carried.map((entry) => `${entry.studentId}|${entry.fingerprint}`),
    );
    return {
      semester: sheet.semester,
      carriedTotal: carried.length,
      carried: carried.slice((page - 1) * 50, page * 50),
      digest: preview.digest,
      total: preview.comparisons.length,
      comparisons: preview.comparisons.slice((page - 1) * 50, page * 50),
      icSources:
        sheet.semester === 'summer'
          ? preview.icSources.slice((page - 1) * 50, page * 50).map((row) => ({
              ...row,
              alreadyCarried: carriedKeys.has(
                `${row.studentId}|${row.source.fingerprint}`,
              ),
            }))
          : [],
      icTotal: sheet.semester === 'summer' ? preview.icSources.length : 0,
      page,
      limit: 50,
    };
  }
  async undoCarry(
    user: AuthenticatedUser,
    sheetId: string,
    studentId: string,
    fingerprint: string,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER);
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_REVIEW);
    const { sheet } = await this.sheets.requireSheetInScope(user, sheetId);
    const session = await this.grades.db.startSession();
    try {
      await session.withTransaction(async () => {
        const scope = {
          courseId: sheet.courseId,
          academicYear: sheet.academicYear,
          semester: sheet.semester,
        };
        const marks = await this.grades
          .find({ ...scope, studentId: new Types.ObjectId(studentId) })
          .session(session)
          .lean();
        if (
          marks.some(
            (mark) => mark.isPublished || mark.controlApprovedRev !== undefined,
          )
        )
          throw attemptConflict('SHEET_LOCKED');
        const copies = marks.filter(
          (mark) =>
            mark.carriedFrom?.fingerprint === fingerprint &&
            mark.examType !== 'final',
        );
        if (!copies.length) return;
        const sheets = this.grades.db.collection(
          this.grades.db.models.ControlSheet?.collection.name ??
            'control_sheets',
        );
        const targets = await sheets
          .find(
            {
              ...scope,
              component: { $in: copies.map((mark) => mark.examType) },
            },
            { session },
          )
          .toArray();
        if (
          targets.some(
            (target) =>
              target.locked ||
              !['DRAFT', 'RETURNED'].includes(String(target.workflowState)),
          )
        )
          throw attemptConflict('SHEET_LOCKED');
        await this.grades
          .deleteMany({ _id: { $in: copies.map((mark) => mark._id) } })
          .session(session);
        await sheets.updateMany(
          { _id: { $in: targets.map((target) => target._id) } },
          { $inc: { revision: 1 } },
          { session },
        );
        await this.grades.db
          .collection(
            this.grades.db.models.GradeAuditLog?.collection.name ??
              'grade_audit_logs',
          )
          .insertMany(
            copies.map((mark) => ({
              ...scope,
              gradeId: mark._id,
              studentId: mark.studentId,
              sheetId: targets.find(
                (target) => target.component === mark.examType,
              )?._id,
              component: mark.examType,
              action: 'CLEAR',
              source: 'SYSTEM',
              actorId: new Types.ObjectId(user._id),
              at: new Date(),
              reason:
                'Undo IC carry-forward / \u0625\u0644\u063a\u0627\u0621 \u062a\u0631\u062d\u064a\u0644 IC',
              oldValue: {
                score: mark.grade,
                status: mark.status,
                carriedFrom: mark.carriedFrom,
              },
              newValue: null,
            })),
            { session },
          );
      });
    } finally {
      await session.endSession();
    }
    return { success: true };
  }

  async carry(
    user: AuthenticatedUser,
    sheetId: string,
    sourceFinalId: string,
    fingerprint: string,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER);
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_REVIEW);
    const { sheet } = await this.sheets.requireSheetInScope(user, sheetId);
    if (sheet.semester !== 'summer') throw attemptConflict('IC_SUMMER_ONLY');
    const source = (await this.store.preview(sheet)).icSources.find((row) =>
      row.source.marks.some(
        (mark) => mark.component === 'final' && mark.id === sourceFinalId,
      ),
    );
    if (!source || source.source.fingerprint !== fingerprint)
      throw attemptConflict('IC_SOURCE_CHANGED');
    const scheme = await this.schemes.getScheme(
      String(sheet.courseId),
      sheet.academicYear,
      sheet.semester,
    );
    if (
      source.source.marks.some((mark) => {
        const rule = scheme.components.find((c) => c.key === mark.component);
        return (
          !rule ||
          rule.max !== mark.maxGrade ||
          (!(CONTROL_SCORELESS_STATES as readonly string[]).includes(
            mark.status,
          ) &&
            Boolean(validateMark(mark.grade, rule))) ||
          (mark.component === 'coursework' &&
            ((mark.attendanceMark ?? 0) > scheme.courseworkAttendanceMax ||
              (mark.quizzesMark ?? 0) > scheme.courseworkQuizzesMax))
        );
      })
    )
      throw new ConflictException({
        code: 'IC_SCHEME_MISMATCH',
        message:
          'Match the original grading maximums before carrying IC marks; no rescaling is allowed / اضبط توزيع الصيفي ليتطابق مع الأصل دون تحويل الدرجات',
      });
    const targets: Awaited<ReturnType<ControlSheetsService['openSheet']>>[] =
      [];
    for (const component of ['coursework', 'midterm'] as const)
      targets.push(
        await this.sheets.openSheet(user, {
          courseId: String(sheet.courseId),
          academicYear: sheet.academicYear,
          semester: sheet.semester,
          component,
        }),
      );
    const session = await this.grades.db.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = (await this.store.preview(sheet, session)).icSources.find(
          (row) =>
            row.studentId === source.studentId &&
            row.source.fingerprint === fingerprint,
        );
        if (!fresh) throw attemptConflict('IC_SOURCE_CHANGED');
        const freshScheme = await this.schemes.getScheme(
          String(sheet.courseId),
          sheet.academicYear,
          sheet.semester,
          session,
        );
        if (freshScheme.version !== scheme.version)
          throw attemptConflict('IC_SCHEME_MISMATCH');
        const targetFilter = {
          courseId: sheet.courseId,
          studentId: new Types.ObjectId(source.studentId),
          academicYear: sheet.academicYear,
          semester: sheet.semester,
        };
        const existing = await this.grades
          .find(targetFilter)
          .session(session)
          .lean();
        if (
          existing.filter(
            (mark) => mark.carriedFrom?.fingerprint === fingerprint,
          ).length === 2
        )
          return;
        if (
          existing.some(
            (mark) =>
              mark.examType !== 'final' ||
              mark.isPublished ||
              mark.controlApprovedRev !== undefined,
          )
        )
          throw attemptConflict('IC_TARGET_ALREADY_ENTERED');
        for (const target of targets) {
          const targetSheet = await this.grades.db
            .collection(
              this.grades.db.models.ControlSheet?.collection.name ??
                'control_sheets',
            )
            .findOne({ _id: new Types.ObjectId(target.sheet.id) }, { session });
          if (
            targetSheet?.locked ||
            !['DRAFT', 'RETURNED'].includes(
              String(targetSheet?.workflowState ?? 'DRAFT'),
            )
          )
            throw attemptConflict('SHEET_LOCKED');
          const mark = fresh.source.marks.find(
            (entry) => entry.component === target.sheet.component,
          )!;
          const carriedFrom = {
            academicYear: fresh.source.academicYear,
            semester: fresh.source.semester,
            sourceFinalId,
            fingerprint,
            actorId: user._id,
          };
          const [created] = await this.grades.create(
            [
              {
                ...targetFilter,
                studentCode: fresh.studentCode,
                courseCode: sheet.courseCode,
                courseName: target.course.name,
                courseNameAr: target.course.nameAr,
                courseNameEn: target.course.nameEn,
                examType: mark.component,
                grade: mark.grade,
                maxGrade: mark.maxGrade,
                status: mark.status,
                attendanceMark: mark.attendanceMark,
                quizzesMark: mark.quizzesMark,
                controlManaged: true,
                rev: 1,
                isPublished: false,
                updatedBy: new Types.ObjectId(user._id),
                carriedFrom,
              },
            ],
            { session },
          );
          await this.schemes.freeze(
            String(sheet.courseId),
            sheet.academicYear,
            sheet.semester,
            session,
          );
          await this.grades.db
            .collection(
              this.grades.db.models.ControlSheet?.collection.name ??
                'control_sheets',
            )
            .updateOne(
              { _id: targetSheet!._id },
              { $inc: { revision: 1 } },
              { session },
            );
          await this.grades.db
            .collection(
              this.grades.db.models.GradeAuditLog?.collection.name ??
                'grade_audit_logs',
            )
            .insertOne(
              {
                sheetId: targetSheet!._id,
                gradeId: created._id,
                studentId: targetFilter.studentId,
                courseId: sheet.courseId,
                academicYear: sheet.academicYear,
                semester: sheet.semester,
                component: mark.component,
                action: 'CREATE',
                source: 'SYSTEM',
                actorId: new Types.ObjectId(user._id),
                at: new Date(),
                reason:
                  '\u0627\u0633\u062a\u0643\u0645\u0627\u0644 \u0646\u0647\u0627\u0626\u064a IC / IC final-only continuation',
                oldValue: null,
                newValue: {
                  score: mark.grade,
                  status: mark.status,
                  carriedFrom,
                },
              },
              { session },
            );
        }
      });
    } finally {
      await session.endSession();
    }
    return { success: true };
  }
}
