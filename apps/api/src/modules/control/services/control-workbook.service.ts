import { ControlAttemptsService } from './control-attempts.service';
import { IC_CARRIED_LOCKED_MESSAGE } from '../utils/attempt-errors.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_SCORELESS_STATES,
  CONTROL_RESTRICTED_STATES,
  GRADE_STATUS_VALUES,
  CONTROL_MIDTERM_STATES,
  PERMISSIONS,
  computeCourseResult,
  computeCoursework,
  parseMarkInput,
  validateMark,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import {
  StudentProfile,
  type StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { Grade, type GradeDocument } from '../../grades/schemas/grade.schema';
import {
  ControlSheet,
  type ControlSheetDocument,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  type GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import {
  ControlImport,
  type ControlImportDocument,
} from '../schemas/control-import.schema';
import { ControlImportFileBatch } from '../schemas/control-import-file-batch.schema';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { ControlGradesService } from './control-grades.service';
import { GradingSchemeService } from './grading-scheme.service';
import { toControlEntry } from '../utils/control-entry.util';
import type { GradeChangeDto, ReviewSheetDto } from '../dto/control.dto';

const STATUS_ARABIC_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  excused: 'بعذر',
  banned: 'محروم',
  withheld: 'محجوبة',
  incomplete: 'غير مكتمل',
};

const STATUS_INPUT_MAP: Record<string, string> = {
  present: 'present',
  حاضر: 'present',
  absent: 'absent',
  غائب: 'absent',
  غايب: 'absent',
  excused: 'excused',
  بعذر: 'excused',
  معذور: 'excused',
  banned: 'banned',
  محروم: 'banned',
  withheld: 'withheld',
  محجوبة: 'withheld',
  محجوب: 'withheld',
  incomplete: 'incomplete',
  'غير مكتمل': 'incomplete',
};

function normalizeStatusInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return (
    STATUS_INPUT_MAP[trimmed.toLowerCase()] ??
    STATUS_INPUT_MAP[trimmed] ??
    trimmed
  );
}

/** Office workflow over the existing grades collection; Grades owns publication. */
@Injectable()
export class ControlWorkbookService {
  constructor(
    @InjectModel(Grade.name) private readonly grades: Model<GradeDocument>,
    @InjectModel(ControlSheet.name)
    private readonly sheets: Model<ControlSheetDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly audit: Model<GradeAuditLogDocument>,
    @InjectModel(ControlImport.name)
    private readonly imports: Model<ControlImportDocument>,
    private readonly access: ControlAccessService,
    private readonly sheetService: ControlSheetsService,
    private readonly mutations: ControlGradesService,
    private readonly schemes: GradingSchemeService,
    private readonly attempts: ControlAttemptsService,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(ControlImportFileBatch.name)
    private readonly fileBatches: Model<ControlImportFileBatch>,
  ) {}

  async workbook(user: AuthenticatedUser, sheetId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet } = await this.sheetService.requireSheetInScope(
      user,
      sheetId,
    );
    const [roster, scheme, docs, componentSheets] = await Promise.all([
      this.sheetService.listEntries(user, sheetId, {}),
      this.schemes.getScheme(
        String(sheet.courseId),
        sheet.academicYear,
        sheet.semester,
      ),
      this.grades
        .find({
          courseId: sheet.courseId,
          academicYear: sheet.academicYear,
          semester: sheet.semester,
          examType: { $in: CONTROL_COMPONENT_KEYS },
        })
        .select(
          'studentId examType grade status rev controlApprovedRev cleared isPublished updatedAt attendanceMark quizzesMark carriedFrom grace',
        )
        .batchSize(500)
        .lean(),
      this.sheets
        .find({
          courseId: sheet.courseId,
          academicYear: sheet.academicYear,
          semester: sheet.semester,
        })
        .select('component workflowState')
        .lean(),
    ]);
    const byStudent = new Map<string, typeof docs>();
    const profiles = await this.profiles
      .find({
        userId: {
          $in: roster.entries.map((row) => new Types.ObjectId(row.studentId)),
        },
      })
      .select('userId isBlocked tuitionFeesStatus')
      .lean();
    const tuitionByStudent = new Map(
      profiles.map((profile) => [
        String(profile.userId),
        {
          isBlocked: profile.isBlocked === true,
          status: profile.tuitionFeesStatus ?? null,
        },
      ]),
    );
    for (const doc of docs) {
      const id = String(doc.studentId);
      byStudent.set(id, [...(byStudent.get(id) ?? []), doc]);
    }
    return {
      revision: sheet.revision ?? 0,
      componentStates: Object.fromEntries(
        componentSheets.map((entry) => [
          entry.component,
          entry.workflowState ?? 'DRAFT',
        ]),
      ),
      scheme,
      rows: roster.entries.map((row) => {
        const components = Object.fromEntries(
          (byStudent.get(row.studentId) ?? []).map((doc) => [
            doc.examType,
            {
              ...toControlEntry(doc)!,
              attendanceMark:
                doc.cleared ||
                (CONTROL_SCORELESS_STATES as readonly string[]).includes(
                  doc.status,
                )
                  ? null
                  : (doc.attendanceMark ?? null),
              quizzesMark:
                doc.cleared ||
                (CONTROL_SCORELESS_STATES as readonly string[]).includes(
                  doc.status,
                )
                  ? null
                  : (doc.quizzesMark ?? null),
              grace:
                doc.cleared || !doc.grace
                  ? null
                  : {
                      originalGrade: doc.grace.originalGrade,
                      appliedAmount: doc.grace.appliedAmount,
                      actualAdded: doc.grace.actualAdded,
                      appliedRev: doc.grace.appliedRev,
                    },
            },
          ]),
        );
        // Official completeness always requires all three components, even before entry starts.
        const result = computeCourseResult(
          scheme.components.map((c) => ({ ...c, enabled: true })),
          components,
        );
        return {
          ...row,
          components,
          result,
          tuition: tuitionByStudent.get(row.studentId) ?? {
            isBlocked: false,
            status: null,
          },
        };
      }),
    };
  }

  async template(
    user: AuthenticatedUser,
    sheetId: string,
    component: (typeof CONTROL_COMPONENT_KEYS)[number],
    mode: 'workbook' | 'missing' | 'exceptions' = 'workbook',
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_EXPORT);
    const detail = await this.sheetService.getSheet(user, sheetId);
    const { rows, scheme } = await this.workbook(user, sheetId);
    const rules = scheme.components.find((item) => item.key === component)!;
    const labels = {
      coursework: 'أعمال السنة',
      midterm: 'الميدتيرم',
      final: 'النهائي',
    };
    const book = new ExcelJS.Workbook();
    const page = book.addWorksheet(`رصد ${labels[component]}`);
    page.addRow([
      'كود الطالب (studentCode)',
      'اسم الطالب (name)',
      'الدرجة (score)',
      'حالة الطالب (status)',
      'درجة الحضور (attendanceMark)',
      'درجة الاختبارات (quizzesMark)',
      'رقم المراجعة (expectedRev)',
      'السبب / الملاحظة (reason)',
    ]);
    for (const row of rows) {
      const entry = row.components[component];
      if (mode === 'missing' && entry?.status) continue;
      if (
        mode === 'exceptions' &&
        !row.notRegistered &&
        (!entry?.status || entry.status === 'present')
      )
        continue;
      page.addRow([
        row.studentCode,
        row.nameAr || row.name,
        entry?.status === 'absent' || entry?.status === 'banned'
          ? 0
          : (entry?.score ?? ''),
        entry?.status ? STATUS_ARABIC_LABELS[entry.status] : '',
        entry?.attendanceMark ?? '',
        entry?.quizzesMark ?? '',
        entry?.rev ?? 0,
        '',
      ]);
    }
    // Scope metadata stays in hidden columns on the same sheet, never a second tab.
    [
      '__control_template_v1',
      detail.course.id,
      scheme.version,
      detail.sheet.academicYear,
      detail.sheet.semester,
      component,
    ].forEach((value, index) => {
      page.getRow(1).getCell(index + 9).value = value;
      page.getColumn(index + 9).hidden = true;
    });
    page.getColumn(7).hidden = true;
    if (component !== 'coursework') {
      page.getColumn(5).hidden = true;
      page.getColumn(6).hidden = true;
    }
    page.columns.forEach((column, index) => {
      column.width = index === 1 ? 40 : 23;
    });
    page.views = [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 1 }];
    page.autoFilter = 'A1:H1';
    page.getRow(1).height = 30;
    page.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    page.eachRow((row, index) => {
      if (index === 1) return;
      row.height = 25;
      row.getCell(1).numFmt = '@';
      row.getCell(3).dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, rules.max],
        showErrorMessage: true,
        errorTitle: 'درجة غير صحيحة / Invalid mark',
        error: `0–${rules.max}; step ${rules.step}`,
      };
      row.getCell(4).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [
          `"${(component === 'midterm' ? CONTROL_MIDTERM_STATES.map((state) => STATUS_ARABIC_LABELS[state]) : Object.values(STATUS_ARABIC_LABELS)).join(',')}"`,
        ],
      };
      for (const column of [3, 4, 5, 6, 8])
        row.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F4F1' },
        };
    });
    this.annotateTuition(page, rows, 15);
    return book.xlsx.writeBuffer();
  }

  /** Informational only: never replace an exam status or change import metadata. */
  private annotateTuition(
    page: ExcelJS.Worksheet,
    rows: Array<{
      studentCode: string;
      tuition?: { isBlocked: boolean; status: string | null };
    }>,
    column: number,
  ) {
    const byCode = new Map(rows.map((row) => [row.studentCode, row.tuition]));
    const letter = page.getColumn(column).letter;
    page.getCell(1, column).value = 'حالة المصروفات والحجب / Tuition & hold';
    page.getCell(1, column).style = { ...page.getCell('B1').style };
    page.getColumn(column).width = 34;
    page.getColumn(column).hidden = false;
    if (page.autoFilter) page.autoFilter = `A1:${letter}1`;
    const tuitionChoices = [
      'مسدد / Paid',
      'غير مسدد / Unpaid',
      'معفى / Exempt',
      'محجوب / Blocked',
      'محجوب — غير مسدد / Blocked — unpaid',
      'غير متاح / Unavailable',
    ];
    page.eachRow((row, index) => {
      if (index === 1) return;
      row.getCell(column).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${tuitionChoices.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'قيمة غير صحيحة / Invalid value',
        error: 'اختر من القائمة / Choose a value from the list',
        showInputMessage: true,
        promptTitle: 'للمراجعة فقط / For review only',
        prompt:
          'التعديل هنا لا يغير المصروفات بالنظام / Does not update portal tuition',
      };
      const tuition = byCode.get(row.getCell(1).text);
      row.getCell(column).value = tuition?.isBlocked
        ? tuition.status === 'unpaid'
          ? 'محجوب — غير مسدد / Blocked — unpaid'
          : 'محجوب / Blocked'
        : tuition?.status === 'paid'
          ? 'مسدد / Paid'
          : tuition?.status === 'exempt'
            ? 'معفى / Exempt'
            : tuition?.status === 'unpaid'
              ? 'غير مسدد / Unpaid'
              : 'غير متاح / Unavailable';
      if (tuition?.isBlocked) {
        for (let cell = 1; cell <= column; cell++) {
          row.getCell(cell).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFDE9E7' },
          };
        }
      }
    });
    if (page.rowCount > 1)
      page.addConditionalFormatting({
        ref: `A2:${letter}${page.rowCount}`,
        rules: [
          {
            type: 'expression',
            priority: 1,
            formulae: [`LEFT($${letter}2,5)="محجوب"`],
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: 'FFFDE9E7' },
              },
            },
          },
        ],
      });
  }

  async review(user: AuthenticatedUser, sheetId: string, dto: ReviewSheetDto) {
    const { sheet: targetSheet, course } =
      await this.sheetService.requireSheetInScope(user, sheetId);
    this.access.assertPermission(
      user,
      dto.action === 'SUBMIT'
        ? PERMISSIONS.CONTROL_SHEETS_SUBMIT
        : dto.action === 'REOPEN'
          ? PERMISSIONS.CONTROL_SHEETS_REOPEN
          : dto.action === 'APPROVE'
            ? targetSheet.component === 'final'
              ? PERMISSIONS.CONTROL_FINAL_APPROVE
              : PERMISSIONS.CONTROL_SHEETS_APPROVE
            : PERMISSIONS.CONTROL_SHEETS_REVIEW,
    );
    if (
      dto.action === 'SUBMIT' &&
      typeof this.access.assertCourseGradeWrite === 'function'
    ) {
      await this.access.assertCourseGradeWrite(user, targetSheet.courseId);
    }
    const resolvedSheetId = String(targetSheet?._id ?? sheetId);
    const session = await this.sheets.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheets
          .findById(resolvedSheetId)
          .session(session)
          .lean();
        if (!sheet || (sheet.revision ?? 0) !== dto.expectedRevision)
          throw new ConflictException('STALE_REVISION');
        if (dto.action === 'APPROVE') {
          const caps = this.access.getCapabilities(user);
          if (sheet.component === 'final' && caps.canApproveFinal === false) {
            throw new ForbiddenException(
              'اعتماد النتيجة النهائية يتطلب صلاحية اعتماد الكنترول النهائي / عميد المعهد (control.final.approve)',
            );
          }
          if (sheet.component !== 'final' && caps.canApprove === false) {
            throw new ForbiddenException(
              'اعتماد كشف الكنترول يتطلب صلاحية اعتماد الكنترول (control.sheets.approve)',
            );
          }
        }
        const state = sheet.workflowState ?? 'DRAFT';
        const allowed =
          dto.action === 'SUBMIT'
            ? ['DRAFT', 'RETURNED']
            : dto.action === 'REOPEN'
              ? ['APPROVED']
              : dto.action === 'APPROVE'
                ? ['PENDING_APPROVAL']
                : dto.action === 'RETURN'
                  ? ['IN_REVIEW', 'PENDING_APPROVAL']
                  : ['IN_REVIEW'];
        if (!allowed.includes(state) || sheet.locked)
          throw new ConflictException('INVALID_WORKFLOW_TRANSITION');
        const roster = await this.sheetService.getRosterStudentIds(
          course.code,
          sheet.academicYear,
          sheet.semester,
          undefined,
          session,
        );
        if (['SUBMIT', 'SUBMIT_APPROVAL', 'APPROVE'].includes(dto.action))
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
        const docs = await this.grades
          .find({
            courseId: sheet.courseId,
            academicYear: sheet.academicYear,
            semester: sheet.semester,
            examType: sheet.component,
            cleared: { $ne: true },
          })
          .session(session)
          .sort({ studentId: 1 })
          .batchSize(500)
          .lean();
        const component = scheme.components.find(
          (c) => c.key === sheet.component,
        )!;
        const enteredIds = new Set(docs.map((d) => String(d.studentId)));
        const missingIds = [...roster].filter((id) => !enteredIds.has(id));
        // A financial hold is not an exam status or a zero mark. Only missing
        // exam entries may be deferred; existing marks still need validation.
        const heldProfiles =
          sheet.component !== 'coursework' && missingIds.length
            ? await this.profiles
                .find({
                  userId: {
                    $in: missingIds.map((id) => new Types.ObjectId(id)),
                  },
                  isBlocked: true,
                })
                .session(session)
                .select('userId')
                .lean()
            : [];
        const tuitionDeferredStudentIds = heldProfiles
          .map((profile) => String(profile.userId))
          .sort();
        const deferredIds = new Set(tuitionDeferredStudentIds);
        const digest = createHash('sha256')
          .update(
            JSON.stringify({
              roster: [...roster].sort(),
              scheme,
              tuitionDeferredStudentIds,
              marks: docs.map((d) => [
                String(d.studentId),
                d.grade,
                d.status,
                d.rev,
                d.attendanceMark,
                d.quizzesMark,
              ]),
            }),
          )
          .digest('hex');
        if (['SUBMIT', 'SUBMIT_APPROVAL', 'APPROVE'].includes(dto.action)) {
          const rosterDocs = docs.filter((d) =>
            roster.has(String(d.studentId)),
          );
          const invalidRosterDocs = rosterDocs.filter(
            (d) =>
              d.maxGrade !== component.max ||
              ((d.status === 'present' || d.status === 'withheld') &&
                Boolean(validateMark(d.grade, component))),
          );
          const missingCount = missingIds.filter(
            (id) => !deferredIds.has(id),
          ).length;
          if (
            !roster.size ||
            docs.length !== rosterDocs.length ||
            (missingCount > 0 && dto.allowMissing !== true) ||
            invalidRosterDocs.length > 0
          )
            throw new ConflictException({
              message: 'RESULT_INCOMPLETE',
              code: 'RESULT_INCOMPLETE',
              details: {
                rosterSize: roster.size,
                enteredCount: rosterDocs.length,
                missingCount,
                deferredCount: deferredIds.size,
                invalidCount: invalidRosterDocs.length,
              },
            });
          if (
            sheet.component === 'coursework' &&
            docs.some(
              (d) =>
                !d.carriedFrom &&
                !(CONTROL_SCORELESS_STATES as readonly string[]).includes(
                  d.status,
                ) &&
                (computeCoursework(
                  d.attendanceMark as number,
                  d.quizzesMark as number,
                ) !== d.grade ||
                  (d.attendanceMark ?? 0) > scheme.courseworkAttendanceMax ||
                  (d.quizzesMark ?? 0) > scheme.courseworkQuizzesMax),
            )
          )
            throw new ConflictException('COURSEWORK_BREAKDOWN_REQUIRED');
        }
        if (dto.action === 'APPROVE') {
          if (
            user.role !== 'admin' &&
            (sheet.submission?.submittedBy === user._id ||
              sheet.reviewSubmission?.submittedBy === user._id)
          )
            throw new ForbiddenException(
              'Submitter cannot approve their own sheet',
            );
          if (sheet.reviewSubmission?.digest !== digest)
            throw new ConflictException('ROSTER_OR_SCHEME_CHANGED');
          if (sheet.component === 'final')
            await this.attempts.approve(
              sheet,
              sheet._id,
              user._id,
              dto.attemptReviewDigest,
              dto.keepPreviousStudentIds ?? [],
              session,
            );
          await this.grades.updateMany(
            { _id: { $in: docs.map((d) => d._id) } },
            [
              {
                $set: {
                  controlManaged: true,
                  controlApprovedRev: { $ifNull: ['$rev', 0] },
                },
              },
            ],
            { session },
          );
        }
        if (dto.action === 'REOPEN') {
          const release = await this.sheets.db
            .collection('control_release_pointers')
            .findOne({ _id: sheet._id, active: true }, { session });
          if (docs.some((d) => d.isPublished) && !release)
            throw new ConflictException(
              'Hide this sheet on the Grades page before reopening',
            );
          await this.grades.updateMany(
            { _id: { $in: docs.map((d) => d._id) } },
            {
              $unset: { controlApprovedRev: '' },
              $set: { isPublished: false },
            },
            { session },
          );
        }
        const next =
          dto.action === 'SUBMIT'
            ? 'IN_REVIEW'
            : dto.action === 'SUBMIT_APPROVAL'
              ? 'PENDING_APPROVAL'
              : dto.action === 'APPROVE'
                ? 'APPROVED'
                : dto.action === 'RETURN'
                  ? state === 'PENDING_APPROVAL'
                    ? 'IN_REVIEW'
                    : 'RETURNED'
                  : 'DRAFT';
        await this.sheets.updateOne(
          { _id: sheet._id },
          {
            $set: {
              workflowState: next,
              reviewReason: dto.reason,
              tuitionDeferredStudentIds,
              unenteredStudentIds: [...missingIds].sort(),
              ...(['SUBMIT', 'RETURN', 'REOPEN'].includes(dto.action)
                ? { reviewSubmission: null }
                : {}),
              ...(dto.action === 'SUBMIT_APPROVAL'
                ? {
                    reviewSubmission: {
                      digest,
                      revision: dto.expectedRevision,
                      schemeVersion: scheme.version,
                      submittedBy: user._id,
                      submittedAt: new Date(),
                    },
                  }
                : {}),
              ...(dto.action === 'SUBMIT'
                ? {
                    submission: {
                      digest,
                      revision: dto.expectedRevision,
                      schemeVersion: scheme.version,
                      submittedBy: user._id,
                      submittedAt: new Date(),
                    },
                  }
                : {}),
              ...(dto.action === 'APPROVE'
                ? {
                    approvedBy: new Types.ObjectId(user._id),
                    approvedAt: new Date(),
                  }
                : {}),
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        await this.audit.create(
          [
            {
              sheetId: sheet._id,
              courseId: sheet.courseId,
              academicYear: sheet.academicYear,
              semester: sheet.semester,
              component: sheet.component,
              action: dto.action,
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: { workflowState: state },
              newValue: {
                workflowState: next,
                digest,
                tuitionDeferredStudentIds,
                unenteredStudentIds: [...missingIds].sort(),
              },
              reason: dto.reason,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return this.sheetService.getSheet(user, sheetId);
  }

  async export(
    user: AuthenticatedUser,
    sheetId: string,
    mode: 'workbook' | 'missing' | 'exceptions' = 'workbook',
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_EXPORT);
    const details = await this.sheetService.getSheet(user, sheetId);
    const { rows, scheme } = await this.workbook(user, sheetId);
    const book = new ExcelJS.Workbook();
    const page = book.addWorksheet('Marks');
    const displayScore = (entry?: {
      score: number | null;
      status: string | null;
    }) =>
      entry?.status === 'absent' || entry?.status === 'banned'
        ? 0
        : (entry?.score ?? '');
    // Only active-component inputs may be imported. Other components are context.
    // Note: studentId (raw MongoDB ObjectId) is intentionally omitted; students are matched by studentCode.
    page.addRow([
      'كود الطالب (studentCode)',
      'اسم الطالب (name)',
      'الدرجة (score)',
      'حالة الطالب (status)',
      'درجة الحضور (attendanceMark)',
      'درجة الاختبارات (quizzesMark)',
      'رقم المراجعة (expectedRev)',
      'السبب / الملاحظة (reason)',
      'أعمال السنة (coursework)',
      'الميدتيرم (midterm)',
      'النهائي (final)',
      'المجموع الكلي (total)',
    ]);
    for (const row of rows) {
      const active = row.components[details.sheet.component];
      if (mode === 'missing' && active?.status) continue;
      if (
        mode === 'exceptions' &&
        !row.notRegistered &&
        (!active?.status || active.status === 'present')
      )
        continue;
      const localizedStatus = active?.status
        ? (STATUS_ARABIC_LABELS[active.status] ?? active.status)
        : '';
      page.addRow([
        row.studentCode,
        row.nameAr || row.name,
        displayScore(active),
        localizedStatus,
        active?.attendanceMark ?? '',
        active?.quizzesMark ?? '',
        active?.rev ?? 0,
        '',
        displayScore(row.components.coursework),
        displayScore(row.components.midterm),
        displayScore(row.components.final),
        row.result.total ?? '',
      ]);
    }
    page.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    page.getRow(1).height = 32;
    page.properties.defaultRowHeight = 24;
    page.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    page.columns.forEach((col, i) => {
      col.width = i === 1 ? 36 : 22;
    });
    page.views = [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 1 }];

    // Preserve revision metadata and legacy round-trip compatibility without
    // asking an operator to edit technical or duplicate reference columns.
    page.getColumn(7).hidden = true;
    for (const index of [9, 10, 11, 12]) page.getColumn(index).hidden = true;
    if (details.sheet.component !== 'coursework') {
      page.getColumn(5).hidden = true;
      page.getColumn(6).hidden = true;
    }
    page.autoFilter = { from: 'A1', to: 'H1' };
    const context = book.addWorksheet('CourseContext');
    context.views = [
      { rightToLeft: true, state: 'frozen', ySplit: 1, xSplit: 2 },
    ];
    context.addRow([
      'studentCode',
      'name',
      'coursework',
      'midterm',
      'final',
      'total',
      'midtermStatus',
      'finalStatus',
    ]);
    for (const row of rows) {
      context.addRow([
        row.studentCode,
        row.nameAr || row.name,
        displayScore(row.components.coursework),
        displayScore(row.components.midterm),
        displayScore(row.components.final),
        row.result.total ?? '',
        row.components.midterm?.status
          ? (STATUS_ARABIC_LABELS[row.components.midterm.status] ??
            row.components.midterm.status)
          : '',
        row.components.final?.status
          ? (STATUS_ARABIC_LABELS[row.components.final.status] ??
            row.components.final.status)
          : '',
      ]);
    }
    context.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    context.columns.forEach((column, index) => {
      column.width = index === 1 ? 36 : 22;
    });
    page.eachRow((row, index) => {
      if (index === 1) return;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: index % 2 ? 'FFF1F5F9' : 'FFFFFFFF' },
        };
      });
      row.getCell(1).numFmt = '@';
      row.getCell(3).numFmt = '0.##';
      row.getCell(3).dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, details.rules?.max ?? 20],
        showErrorMessage: true,
        errorTitle: 'Invalid grade / درجة غير صحيحة',
        error:
          'Enter a grade within the component maximum / أدخل درجة ضمن الحد الأقصى',
      };
      row.getCell(4).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [
          `"${(details.sheet.component === 'midterm' ? CONTROL_MIDTERM_STATES.map((state) => STATUS_ARABIC_LABELS[state]) : Object.values(STATUS_ARABIC_LABELS)).join(',')}"`,
        ],
      };
      for (const column of [3, 4, 8]) {
        row.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F4F1' },
        };
      }
    });

    this.annotateTuition(page, rows, 15);
    this.annotateTuition(context, rows, 9);
    const instructions = book.addWorksheet('إرشادات الرصد');
    instructions.views = [{ rightToLeft: true }];
    const courseLabel = [
      details.course?.code,
      details.course?.nameAr || details.course?.name,
    ]
      .filter(Boolean)
      .join(' — ');
    const semesterLabel =
      details.sheet.semester === 'first'
        ? 'الفصل الأول (First Semester)'
        : details.sheet.semester === 'second'
          ? 'الفصل الثاني (Second Semester)'
          : 'الفصل الصيفي (Summer Semester)';
    const componentNameAr =
      details.rules?.nameAr ||
      (details.sheet.component === 'midterm'
        ? 'الميدتيرم'
        : details.sheet.component === 'coursework'
          ? 'أعمال السنة'
          : 'النهائي');
    instructions.addRow([
      'البند / الحقل (Field)',
      'التعليمات والضوابط بالعربية',
      'Instructions & Rules (English)',
    ]);
    instructions.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    instructions.addRows([
      [
        'بيانات الكشف (Sheet Info)',
        `المقرر: ${courseLabel || '-'} | العام: ${details.sheet.academicYear} | ${semesterLabel} | المكوّن: ${componentNameAr}`,
        `Course: ${courseLabel || '-'} | Term: ${details.sheet.academicYear} (${details.sheet.semester}) | Component: ${details.sheet.component}`,
      ],
      [
        'الدرجة العظمى والخطوة (Max & Step)',
        `الدرجة العظمى لهذا المكوّن: ${details.rules?.max ?? 20} درجة — خطوة الرصد المسموح بها: ${details.rules?.step ?? 1}`,
        `Max mark: ${details.rules?.max ?? 20} — Allowed step increment: ${details.rules?.step ?? 1}`,
      ],
      [
        '1. كود الطالب (studentCode)',
        'لا تقم بتعديل كود الطالب. يتم التعرف على الطالب ومطابقة درجاته تلقائياً عبر كود الطالب الجامعي بدون الحاجة لأي معرّف تقني.',
        'Do not modify studentCode. Students are matched automatically by their institutional studentCode.',
      ],
      [
        '2. الدرجة (score)',
        `أدخل الدرجة الرقمية للمكوّن النشط (${componentNameAr}) بين 0 و ${details.rules?.max ?? 20} في عمود score أو عمود المكوّن النشط. باقي المكونات للعرض فقط. عند تعديل العمودين يجب أن تتساوى القيمتان. الصف الفارغ دون حالة يُتخطى.`,
        `Enter the mark for the active component (${details.sheet.component}) between 0 and ${details.rules?.max ?? 20} in score or the active component column. Other components are reference only. If editing both columns, make their values equal. Rows with no mark or status are skipped.`,
      ],
      [
        '3. أعمال السنة (Coursework Split)',
        `في كشف أعمال السنة فقط: يجب إدخال درجة الحضور (بحد أقصى ${scheme.courseworkAttendanceMax}) + درجة الاختبارات (بحد أقصى ${scheme.courseworkQuizzesMax}) بحيث يساوي مجموعهما الدرجة الكلية لأعمال السنة.`,
        `For coursework sheets only: attendanceMark (max ${scheme.courseworkAttendanceMax}) + quizzesMark (max ${scheme.courseworkQuizzesMax}) must equal score.`,
      ],
      [
        '4. حالة الطالب (status)',
        'يمكنك كتابة الحالة باللغة العربية أو الإنجليزية: حاضر (present)، غائب (absent)، بعذر (excused)، محروم (banned)، محجوبة (withheld)، غير مكتمل (incomplete).',
        'You may enter status in Arabic or English: حاضر / present, غائب / absent, بعذر / excused, محروم / banned, محجوبة / withheld, غير مكتمل / incomplete.',
      ],
      [
        '5. الحالات الخاصة والسبب (reason)',
        'للغياب أو الحرمان: اترك الدرجة فارغة أو اكتب صفرًا. لبعذر أو غير مكتمل: اتركها فارغة. السبب اختياري للحالات الخاصة والأعذار؛ تظل صلاحية إدارة الحالات مطلوبة. الصفوف غير المعدلة تُتخطى تلقائيًا. الحرمان في النهائي = FX، وغير المكتمل = IC، والرسوب = F؛ تظل درجات الميدتيرم وأعمال السنة محفوظة.',
        'For absent/banned, leave score empty or enter 0. Excused/incomplete require an empty score. Reasons are optional for special statuses; state-management permission is still required. Unchanged rows are skipped. A banned final is FX, incomplete is IC and failure is F; midterm/coursework contributions are preserved.',
      ],
      [
        '6. رقم المراجعة (expectedRev)',
        'رقم المراجعة مخفي تلقائيًا؛ لا تحذف العمود أو تغيّر قيمه، فهو يحمي الدرجة من استبدال تعديل أحدث.',
        'expectedRev is hidden automatically. Keep the column unchanged; it protects against overwriting concurrent edits.',
      ],
      [
        '7. الأعمدة المرجعية (Context Columns)',
        'تعرض ورقة CourseContext جميع مكونات المقرر والمجموع وحالة كل امتحان للمراجعة فقط. أدخل التعديلات في ورقة Marks، وتظل الأعمدة التقنية والمرجعية مخفية للحفاظ على سهولة الرصد.',
        'CourseContext contains read-only context: all components, total and exam statuses. Edit Marks only. Technical and duplicate reference columns stay hidden.',
      ],
    ]);
    instructions.getColumn(1).width = 30;
    instructions.getColumn(2).width = 68;
    instructions.getColumn(3).width = 60;

    const metadata = book.addWorksheet('Scope');
    metadata.addRows([
      ['sheetId', details.sheet.id || sheetId],
      ['academicYear', details.sheet.academicYear],
      ['semester', details.sheet.semester],
      ['component', details.sheet.component],
      ['schemeVersion', scheme.version],
      ['workflow', details.sheet.workflowState],
      ['reportMode', mode],
      ['generatedAt', new Date().toISOString()],
      [
        'note',
        'Edit score/status for the active component only. Blank means unchanged. Coursework = attendanceMark + quizzesMark, max 20. Totals are read-only.',
      ],
      ['slug', details.sheet.slug || ''],
    ]);
    return book.xlsx.writeBuffer();
  }

  async exportErrors(
    user: AuthenticatedUser,
    sheetId: string,
    previewId: string,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    const detail = await this.sheetService.getSheet(user, sheetId);
    const resolvedSheetId = detail.sheet.id || sheetId;
    const batch = await this.imports
      .findOne({
        _id: new Types.ObjectId(previewId),
        sheetId: new Types.ObjectId(resolvedSheetId),
        actorId: new Types.ObjectId(user._id),
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!batch)
      throw new BadRequestException('Preview expired or inaccessible');
    const book = new ExcelJS.Workbook();
    const page = book.addWorksheet('Import errors');
    page.addRow(['Row validation error']);
    for (const message of batch.errors) page.addRow([message]);
    const receipt = batch.result as
      | {
          results?: Array<{
            studentId: string;
            result: string;
            message?: string;
            code?: string;
          }>;
        }
      | undefined;
    for (const row of receipt?.results ?? [])
      if (row.result !== 'ok')
        page.addRow([
          `Commit ${row.studentId}: ${row.message ?? row.code ?? row.result}`,
        ]);
    page.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    page.getColumn(1).width = 100;
    return book.xlsx.writeBuffer();
  }

  async previewFile(
    user: AuthenticatedUser,
    sheetId: string,
    buffer: Buffer,
    batch = 0,
  ) {
    const detail = await this.requireEditableImportSheet(user, sheetId);
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(
        buffer as unknown as Parameters<typeof book.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException('Invalid XLSX workbook');
    }
    const compact =
      book.worksheets.length === 1 &&
      book.worksheets[0].getCell('I1').text === '__control_template_v1'
        ? book.worksheets[0]
        : undefined;
    const page = compact ?? book.getWorksheet('Marks');
    const scope = book.getWorksheet('Scope');
    const scopeSheetId = scope?.getCell('B1').text?.trim() ?? '';
    const scopeSlug = scope?.getCell('B10').text?.trim() ?? '';
    const compactMatch =
      compact &&
      compact.getCell('J1').text === detail.course.id &&
      compact.getCell('L1').text === detail.sheet.academicYear &&
      compact.getCell('M1').text === detail.sheet.semester &&
      compact.getCell('N1').text === detail.sheet.component;
    const isScopeMatch =
      compactMatch ||
      (Boolean(page && scope) &&
        (scopeSheetId === sheetId ||
          scopeSheetId === detail.sheet.id ||
          (Boolean(detail.sheet.slug) &&
            (scopeSheetId === detail.sheet.slug ||
              scopeSlug === detail.sheet.slug))));
    if (!page || !isScopeMatch)
      throw new BadRequestException('Download the template for this sheet');
    if (page.rowCount > 10001 || page.columnCount > 20)
      throw new BadRequestException('Maximum 10000 rows per file');
    if (!Number.isInteger(batch) || batch < 0 || batch > 19)
      throw new BadRequestException('Invalid import batch');

    const firstCell = page.getRow(1).getCell(1).text.trim();
    const isLegacyWithStudentId = firstCell === 'studentId';
    const expectedKeys = isLegacyWithStudentId
      ? [
          'studentId',
          'studentCode',
          'name',
          'score',
          'status',
          'attendanceMark',
          'quizzesMark',
          'expectedRev',
          'reason',
        ]
      : [
          'studentCode',
          'name',
          'score',
          'status',
          'attendanceMark',
          'quizzesMark',
          'expectedRev',
          'reason',
        ];
    const expectedBilingual = [
      'كود الطالب (studentCode)',
      'اسم الطالب (name)',
      'الدرجة (score)',
      'حالة الطالب (status)',
      'درجة الحضور (attendanceMark)',
      'درجة الاختبارات (quizzesMark)',
      'رقم المراجعة (expectedRev)',
      'السبب / الملاحظة (reason)',
    ];
    const headersMatch = isLegacyWithStudentId
      ? expectedKeys.every(
          (key, i) =>
            page
              .getRow(1)
              .getCell(i + 1)
              .text.trim() === key,
        )
      : expectedKeys.every((key, i) => {
          const headerText = page
            .getRow(1)
            .getCell(i + 1)
            .text.trim();
          return headerText === key || headerText === expectedBilingual[i];
        });
    if (!headersMatch)
      throw new BadRequestException('Invalid template headers');

    const rows: Record<string, unknown>[] = [];
    const identities = new Set<string>();
    page.eachRow((row, n) => {
      if (n === 1) return;
      const values: Record<string, unknown> = {};
      expectedKeys.forEach((key, i) => {
        const cell = row.getCell(i + 1);
        if (cell.type === ExcelJS.ValueType.Formula)
          throw new BadRequestException(`Formula in row ${n}`);
        values[key] = cell.text;
      });
      // The export also shows component-specific columns. Accept the active
      // component as an input alias, but never silently choose conflicting marks.
      const activeColumn = ['coursework', 'midterm', 'final'].indexOf(
        detail.sheet.component,
      );
      const contextCell = row.getCell(expectedKeys.length + activeColumn + 1);
      const contextHeader = page.getRow(1).getCell(contextCell.col).text;
      if (
        activeColumn >= 0 &&
        (contextHeader === detail.sheet.component ||
          contextHeader.endsWith(`(${detail.sheet.component})`))
      ) {
        if (contextCell.type === ExcelJS.ValueType.Formula)
          throw new BadRequestException(`Formula in row ${n}`);
        const contextual = contextCell.text.trim();
        const score =
          typeof values.score === 'string' ? values.score.trim() : '';
        const scorelessStatus = (
          CONTROL_SCORELESS_STATES as readonly string[]
        ).includes(normalizeStatusInput(values.status));
        if (contextual && !score && !scorelessStatus) values.score = contextual;
        else if (contextual && score) {
          const left = parseMarkInput(score);
          const right = parseMarkInput(contextual);
          if (!left.ok || !right.ok || left.value !== right.value)
            values.contextScore = contextual;
        }
      }
      const identity =
        typeof values.studentCode === 'string' ? values.studentCode.trim() : '';
      if (identity && identities.has(identity))
        throw new BadRequestException(`Duplicate student in file at row ${n}`);
      if (identity) identities.add(identity);
      values.sourceRow = n;
      rows.push(values);
    });
    if (!rows.length)
      throw new BadRequestException({
        code: 'CONTROL_IMPORT_EMPTY',
        message:
          'This workbook contains no student rows. Download the full workbook instead of missing grades, then edit Marks.',
      });
    const totalBatches = Math.max(1, Math.ceil(rows.length / 500));
    if (batch >= totalBatches)
      throw new BadRequestException('Invalid import batch');
    const schemeVersion = Number(
      compact ? compact.getCell('K1').text : scope!.getCell('B5').text,
    );
    const preview = await this.previewRows(
      user,
      sheetId,
      detail,
      rows.slice(batch * 500, (batch + 1) * 500),
      schemeVersion,
    );
    const remaining = [];
    if (batch === 0) {
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      const sheetObjectId = new Types.ObjectId(detail.sheet.id || sheetId);
      const actorId = new Types.ObjectId(user._id);
      for (let start = 500; start < rows.length; start += 500) {
        remaining.push({
          sheetId: sheetObjectId,
          actorId,
          schemeVersion,
          rows: rows.slice(start, start + 500),
          expiresAt,
        });
      }
    }
    const staged = remaining.length
      ? await this.fileBatches.insertMany(remaining)
      : [];
    return {
      ...preview,
      batchIndex: batch,
      totalBatches,
      totalRows: rows.length,
      remainingBatchIds: staged.map((item) => item._id.toHexString()),
    };
  }

  async previewFileBatch(
    user: AuthenticatedUser,
    sheetId: string,
    batchId: string,
  ) {
    const detail = await this.requireEditableImportSheet(user, sheetId);
    const batch = await this.fileBatches
      .findOne({
        _id: new Types.ObjectId(batchId),
        sheetId: new Types.ObjectId(detail.sheet.id || sheetId),
        actorId: new Types.ObjectId(user._id),
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!batch)
      throw new BadRequestException({
        code: 'CONTROL_IMPORT_FILE_EXPIRED',
        message: 'File preview expired or inaccessible',
      });
    return this.previewRows(
      user,
      sheetId,
      detail,
      batch.rows,
      batch.schemeVersion,
    );
  }

  async preview(
    user: AuthenticatedUser,
    sheetId: string,
    rows: Record<string, unknown>[],
    expectedScheme?: number,
  ) {
    const detail = await this.requireEditableImportSheet(user, sheetId);
    return this.previewRows(user, sheetId, detail, rows, expectedScheme);
  }

  private async requireEditableImportSheet(
    user: AuthenticatedUser,
    sheetId: string,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    const detail = await this.sheetService.getSheet(user, sheetId);
    await this.access.assertCourseGradeWrite(user, detail.course.id);
    if (detail.sheet.workflowState === 'PARTIAL_OPEN') {
      throw new ConflictException(
        'لا يمكن استيراد ملف إكسيل أثناء دورة الرصد الجزئي؛ يرجى تعديل درجات الطلاب المحددين مباشرة في الجدول',
      );
    }
    this.access.assertPermission(
      user,
      detail.sheet.workflowState === 'IN_REVIEW'
        ? PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT
        : PERMISSIONS.CONTROL_GRADES_ENTER,
    );
    if (!detail.capabilities.canEdit)
      throw new ConflictException('SHEET_NOT_EDITABLE');
    return detail;
  }

  private async previewRows(
    user: AuthenticatedUser,
    sheetId: string,
    detail: Awaited<ReturnType<ControlSheetsService['getSheet']>>,
    rows: Record<string, unknown>[],
    expectedScheme?: number,
  ) {
    const { rows: roster, scheme } = await this.workbook(user, sheetId);
    if (expectedScheme !== undefined && scheme.version !== expectedScheme)
      throw new ConflictException('SCHEME_CHANGED');
    const byId = new Map(roster.map((r) => [r.studentId, r]));
    const byCode = new Map(
      roster
        .filter((r) => Boolean(r.studentCode))
        .map((r) => [String(r.studentCode).trim(), r]),
    );
    const errors: string[] = [],
      changes: GradeChangeDto[] = [],
      seen = new Set<string>();
    const changeByRow = new Map<number, GradeChangeDto>();
    const errorByRow = new Map<number, string>();
    if (!rows.length || rows.length > 500)
      throw new BadRequestException('Import between 1 and 500 rows');
    for (const [index, row] of rows.entries()) {
      const rawId =
        typeof row.studentId === 'string' ? row.studentId.trim() : '';
      const rawCode =
        typeof row.studentCode === 'string' ||
        (typeof row.studentCode === 'number' &&
          Number.isFinite(row.studentCode))
          ? String(row.studentCode).trim()
          : '';
      const student = rawId ? byId.get(rawId) : byCode.get(rawCode);
      const id = student?.studentId ?? rawId;
      const fail = (message: string) => {
        const issue = `Row ${typeof row.sourceRow === 'number' ? row.sourceRow : index + 2}: ${message}`;
        errors.push(issue);
        errorByRow.set(index, issue);
      };
      if (
        !student ||
        student.notRegistered ||
        !rawCode ||
        student.studentCode !== rawCode
      ) {
        fail('Student identity/registration mismatch');
        continue;
      }
      if (seen.has(id)) {
        fail('Duplicate student');
        continue;
      }
      seen.add(id);
      if (typeof row.reason === 'string' && row.reason.length > 500) {
        fail('Reason must not exceed 500 characters');
        continue;
      }
      const current = student.components[detail.sheet.component];
      let score = parseMarkInput(row.score);
      if (row.contextScore !== undefined) {
        const contextual = parseMarkInput(row.contextScore);
        const previous = current?.score ?? null;
        if (score.ok && contextual.ok && score.value === previous)
          score = contextual;
        else if (!score.ok || !contextual.ok || contextual.value !== previous) {
          fail('Conflicting score and active component columns');
          continue;
        }
      }
      const normalizedStatus = normalizeStatusInput(row.status);
      // When re-importing an exported sheet where existing rows have status 'present' (or 'حاضر')
      // and the same score, only skip if completely empty or unchanged.
      const status = normalizedStatus
        ? normalizedStatus
        : score.ok && score.value !== null
          ? 'present'
          : '';
      if (score.ok && score.value === null && !status) continue;
      if (
        !score.ok ||
        !(GRADE_STATUS_VALUES as readonly string[]).includes(status)
      ) {
        fail('Invalid score/status');
        continue;
      }
      const scoreless = (
        CONTROL_SCORELESS_STATES as readonly string[]
      ).includes(status);
      // A zero entered beside an absence/ban means no exam mark, not a
      // positive contribution. Preserve the explicit exam status for students.
      if (
        score.ok &&
        score.value === 0 &&
        ['absent', 'banned'].includes(status)
      ) {
        score.value = null;
      }
      const attendance = parseMarkInput(row.attendanceMark),
        quizzes = parseMarkInput(row.quizzesMark);
      const unchangedBreakdown =
        detail.sheet.component !== 'coursework' ||
        scoreless ||
        (attendance.ok &&
          quizzes.ok &&
          attendance.value === (current?.attendanceMark ?? null) &&
          quizzes.value === (current?.quizzesMark ?? null));
      if (
        current &&
        current.status === status &&
        current.score === score.value &&
        unchangedBreakdown
      )
        continue;
      if (student.tuition?.isBlocked) {
        fail('Grade entry is locked while the student has a tuition hold');
        continue;
      }
      if (current?.carriedFrom) {
        fail(IC_CARRIED_LOCKED_MESSAGE);
        continue;
      }
      if (
        detail.sheet.component === 'midterm' &&
        !(CONTROL_MIDTERM_STATES as readonly string[]).includes(status)
      ) {
        fail(
          'Midterm accepts present, absent or banned only / الميدترم يقبل حاضر أو غائب أو محروم فقط',
        );
        continue;
      }
      if (scoreless && score.value !== null) {
        fail('Score must be blank for this status');
        continue;
      }
      if (!scoreless && score.value === null) {
        fail('A present status requires a numeric score');
        continue;
      }
      if (!scoreless && score.value !== null) {
        const issue = validateMark(score.value, detail.rules);
        if (issue) {
          fail(
            `Mark rule: ${issue}; max=${detail.rules.max}; step=${detail.rules.step}`,
          );
          continue;
        }
      }
      const rev = Number(row.expectedRev);
      if (!Number.isInteger(rev) || rev !== (current?.rev ?? 0)) {
        fail('Stale mark revision');
        continue;
      }
      if (
        ((CONTROL_RESTRICTED_STATES as readonly string[]).includes(status) ||
          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
            current?.status ?? '',
          )) &&
        !this.access.getCapabilities(user).canManageStates
      ) {
        fail('Special status requires state-management permission');
        continue;
      }
      if (current?.isPublished) {
        fail('Hide published marks before importing');
        continue;
      }
      if (
        detail.sheet.component === 'coursework' &&
        !scoreless &&
        (!attendance.ok ||
          !quizzes.ok ||
          computeCoursework(
            attendance.value as number,
            quizzes.value as number,
          ) !== score.value ||
          (attendance.value ?? 0) > scheme.courseworkAttendanceMax ||
          (quizzes.value ?? 0) > scheme.courseworkQuizzesMax)
      ) {
        fail('Coursework must equal attendance + quizzes, max 20');
        continue;
      }
      const change: GradeChangeDto = {
        studentId: id,
        score: score.value,
        status: status as GradeChangeDto['status'],
        expectedRev: rev,
        opId: randomUUID(),
        ...(detail.sheet.component === 'coursework' &&
        !scoreless &&
        attendance.ok &&
        quizzes.ok
          ? {
              attendanceMark: attendance.value as number,
              quizzesMark: quizzes.value as number,
            }
          : {}),
        reason: typeof row.reason === 'string' ? row.reason : undefined,
      };
      changes.push(change);
      changeByRow.set(index, change);
    }
    const resolvedSheetId = detail.sheet.id || sheetId;
    const batch = await this.imports.create({
      sheetId: new Types.ObjectId(resolvedSheetId),
      actorId: new Types.ObjectId(user._id),
      revision: detail.sheet.revision,
      schemeVersion: scheme.version,
      changes,
      errors,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    return {
      previewId: String(batch._id),
      valid: changes.length,
      rules: {
        component: detail.sheet.component,
        max: detail.rules.max,
        step: detail.rules.step,
      },
      skipped: rows.length - changes.length - errors.length,
      errors,
      changes,
      reviewRows: rows.map((row, index) => {
        const sourceRow =
          typeof row.sourceRow === 'number' ? row.sourceRow : index + 2;
        const code =
          typeof row.studentCode === 'string' ||
          typeof row.studentCode === 'number'
            ? String(row.studentCode).trim()
            : '';
        const student = byCode.get(code);
        const change = changeByRow.get(index);
        const issue = errorByRow.get(index);
        const inputScore = parseMarkInput(row.score);
        return {
          sourceRow,
          studentId: student?.studentId ?? '',
          studentCode: code,
          name: student?.name ?? '',
          nameAr: student?.nameAr ?? '',
          examStatus:
            normalizeStatusInput(row.status) ||
            (inputScore.ok && inputScore.value !== null ? 'present' : ''),
          before: student?.components[detail.sheet.component]?.score ?? null,
          after:
            change?.score ??
            (typeof row.score === 'string' || typeof row.score === 'number'
              ? row.score
              : null),
          status: issue ? 'invalid' : change ? 'valid' : 'unchanged',
          issues: issue ? [issue] : [],
        };
      }),
    };
  }

  async commit(user: AuthenticatedUser, sheetId: string, previewId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    const detail = await this.sheetService.getSheet(user, sheetId);
    await this.access.assertCourseGradeWrite(user, detail.course.id);
    if (detail.sheet.workflowState === 'PARTIAL_OPEN') {
      throw new ConflictException(
        'لا يمكن استيراد ملف إكسيل أثناء دورة الرصد الجزئي؛ يرجى تعديل درجات الطلاب المحددين مباشرة في الجدول',
      );
    }
    this.access.assertPermission(
      user,
      detail.sheet.workflowState === 'IN_REVIEW'
        ? PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT
        : PERMISSIONS.CONTROL_GRADES_ENTER,
    );
    const resolvedSheetId = detail.sheet.id || sheetId;
    const batch = await this.imports
      .findOne({
        _id: new Types.ObjectId(previewId),
        sheetId: new Types.ObjectId(resolvedSheetId),
        actorId: new Types.ObjectId(user._id),
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!batch)
      throw new BadRequestException('Preview expired or inaccessible');
    if (batch.result) return batch.result;
    const scheme = await this.schemes.getScheme(
      detail.course.id,
      detail.sheet.academicYear,
      detail.sheet.semester,
    );
    if (
      scheme.version !== batch.schemeVersion ||
      detail.sheet.revision !== batch.revision
    )
      throw new ConflictException('Preview is stale; preview again');
    if (!batch.changes.length) throw new BadRequestException('No valid rows');
    const result = await this.mutations.applyChanges(
      user,
      resolvedSheetId,
      { changes: batch.changes },
      'XLSX',
      {
        batchId: String(batch._id),
        revision: batch.revision,
        schemeVersion: batch.schemeVersion,
      },
    );
    return result;
  }
}
