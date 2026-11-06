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
  PERMISSIONS,
  computeCourseResult,
  computeCoursework,
  parseMarkInput,
  validateMark,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
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
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { ControlGradesService } from './control-grades.service';
import { GradingSchemeService } from './grading-scheme.service';
import { toControlEntry } from '../utils/control-entry.util';
import type { GradeChangeDto, ReviewSheetDto } from '../dto/control.dto';

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
  ) {}

  async workbook(user: AuthenticatedUser, sheetId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet } = await this.sheetService.requireSheetInScope(
      user,
      sheetId,
    );
    const [roster, scheme, docs] = await Promise.all([
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
        .limit(6001)
        .lean(),
    ]);
    if (docs.length > 6000)
      throw new ConflictException('ROSTER_LIMIT_EXCEEDED');
    const byStudent = new Map<string, typeof docs>();
    for (const doc of docs) {
      const id = String(doc.studentId);
      byStudent.set(id, [...(byStudent.get(id) ?? []), doc]);
    }
    return {
      revision: sheet.revision ?? 0,
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
            },
          ]),
        );
        // Official completeness always requires all three components, even before entry starts.
        const result = computeCourseResult(
          scheme.components.map((c) => ({ ...c, enabled: true })),
          components,
        );
        return { ...row, components, result };
      }),
    };
  }

  async review(user: AuthenticatedUser, sheetId: string, dto: ReviewSheetDto) {
    this.access.assertPermission(
      user,
      dto.action === 'SUBMIT'
        ? PERMISSIONS.CONTROL_SHEETS_SUBMIT
        : PERMISSIONS.CONTROL_SHEETS_REVIEW,
    );
    const { course } = await this.sheetService.requireSheetInScope(
      user,
      sheetId,
    );
    const session = await this.sheets.db.startSession();
    try {
      await session.withTransaction(async () => {
        const sheet = await this.sheets
          .findById(sheetId)
          .session(session)
          .lean();
        if (!sheet || (sheet.revision ?? 0) !== dto.expectedRevision)
          throw new ConflictException('STALE_REVISION');
        const state = sheet.workflowState ?? 'DRAFT';
        const allowed =
          dto.action === 'SUBMIT'
            ? ['DRAFT', 'RETURNED']
            : dto.action === 'REOPEN'
              ? ['APPROVED']
              : ['IN_REVIEW'];
        if (
          !allowed.includes(state) ||
          (sheet.locked && dto.action === 'SUBMIT')
        )
          throw new ConflictException('INVALID_WORKFLOW_TRANSITION');
        const roster = await this.sheetService.getRosterStudentIds(
          course.code,
          sheet.academicYear,
          sheet.semester,
          undefined,
          session,
        );
        if (dto.action === 'SUBMIT' || dto.action === 'APPROVE')
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
          .limit(2001)
          .lean();
        const component = scheme.components.find(
          (c) => c.key === sheet.component,
        )!;
        const digest = createHash('sha256')
          .update(
            JSON.stringify({
              roster: [...roster].sort(),
              scheme,
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
        if (dto.action === 'SUBMIT' || dto.action === 'APPROVE') {
          if (
            !roster.size ||
            docs.length !== roster.size ||
            docs.some(
              (d) =>
                !roster.has(String(d.studentId)) ||
                d.maxGrade !== component.max ||
                ((d.status === 'present' || d.status === 'withheld') &&
                  validateMark(d.grade, component)),
            )
          )
            throw new ConflictException('RESULT_INCOMPLETE');
          if (
            sheet.component === 'coursework' &&
            docs.some(
              (d) =>
                computeCoursework(
                  d.attendanceMark as number,
                  d.quizzesMark as number,
                ) !== d.grade ||
                (d.attendanceMark ?? 0) > scheme.courseworkAttendanceMax ||
                (d.quizzesMark ?? 0) > scheme.courseworkQuizzesMax,
            )
          )
            throw new ConflictException('COURSEWORK_BREAKDOWN_REQUIRED');
        }
        if (dto.action === 'APPROVE') {
          if (sheet.submission?.submittedBy === user._id)
            throw new ForbiddenException(
              'Submitter cannot approve their own sheet',
            );
          if (sheet.submission?.digest !== digest)
            throw new ConflictException('ROSTER_OR_SCHEME_CHANGED');
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
          if (docs.some((d) => d.isPublished))
            throw new ConflictException(
              'Hide this sheet on the Grades page before reopening',
            );
          await this.grades.updateMany(
            { _id: { $in: docs.map((d) => d._id) } },
            { $unset: { controlApprovedRev: '' } },
            { session },
          );
        }
        const next =
          dto.action === 'SUBMIT'
            ? 'IN_REVIEW'
            : dto.action === 'APPROVE'
              ? 'APPROVED'
              : dto.action === 'RETURN'
                ? 'RETURNED'
                : 'DRAFT';
        await this.sheets.updateOne(
          { _id: sheet._id },
          {
            $set: {
              workflowState: next,
              reviewReason: dto.reason,
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
              newValue: { workflowState: next, digest },
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
    // Only active-component inputs may be imported. The other columns are context.
    page.addRow([
      'studentId',
      'studentCode',
      'name',
      'score',
      'status',
      'attendanceMark',
      'quizzesMark',
      'expectedRev',
      'reason',
      'coursework',
      'midterm',
      'final',
      'total',
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
      page.addRow([
        row.studentId,
        row.studentCode,
        row.nameAr || row.name,
        active?.score ?? '',
        active?.status ?? '',
        active?.attendanceMark ?? '',
        active?.quizzesMark ?? '',
        active?.rev ?? 0,
        '',
        row.components.coursework?.score ?? '',
        row.components.midterm?.score ?? '',
        row.components.final?.score ?? '',
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
    page.columns.forEach((col, i) => {
      col.width = i === 2 ? 36 : 20;
    });
    page.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
    const metadata = book.addWorksheet('Scope');
    metadata.addRows([
      ['sheetId', sheetId],
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
    ]);
    return book.xlsx.writeBuffer();
  }

  async exportErrors(
    user: AuthenticatedUser,
    sheetId: string,
    previewId: string,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    await this.sheetService.getSheet(user, sheetId);
    const batch = await this.imports
      .findOne({
        _id: new Types.ObjectId(previewId),
        sheetId: new Types.ObjectId(sheetId),
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

  async previewFile(user: AuthenticatedUser, sheetId: string, buffer: Buffer) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(
        buffer as unknown as Parameters<typeof book.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException('Invalid XLSX workbook');
    }
    const page = book.getWorksheet('Marks');
    const scope = book.getWorksheet('Scope');
    if (!page || !scope || scope.getCell('B1').text !== sheetId)
      throw new BadRequestException('Download the template for this sheet');
    if (page.rowCount > 501 || page.columnCount > 20)
      throw new BadRequestException('Maximum 500 rows per import');
    const expected = [
      'studentId',
      'studentCode',
      'name',
      'score',
      'status',
      'attendanceMark',
      'quizzesMark',
      'expectedRev',
      'reason',
    ];
    if (expected.some((key, i) => page.getRow(1).getCell(i + 1).text !== key))
      throw new BadRequestException('Invalid template headers');
    const rows: Record<string, unknown>[] = [];
    page.eachRow((row, n) => {
      if (n === 1) return;
      const values: Record<string, unknown> = {};
      expected.forEach((key, i) => {
        const cell = row.getCell(i + 1);
        if (cell.type === ExcelJS.ValueType.Formula)
          throw new BadRequestException(`Formula in row ${n}`);
        values[key] = cell.text;
      });
      rows.push(values);
    });
    return this.preview(user, sheetId, rows, Number(scope.getCell('B5').text));
  }

  async preview(
    user: AuthenticatedUser,
    sheetId: string,
    rows: Record<string, unknown>[],
    expectedScheme?: number,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER);
    const detail = await this.sheetService.getSheet(user, sheetId);
    if (!detail.capabilities.canEdit)
      throw new ConflictException('SHEET_NOT_EDITABLE');
    const { rows: roster, scheme } = await this.workbook(user, sheetId);
    if (expectedScheme !== undefined && scheme.version !== expectedScheme)
      throw new ConflictException('SCHEME_CHANGED');
    const byId = new Map(roster.map((r) => [r.studentId, r]));
    const errors: string[] = [],
      changes: GradeChangeDto[] = [],
      seen = new Set<string>();
    if (!rows.length || rows.length > 500)
      throw new BadRequestException('Import between 1 and 500 rows');
    for (const [index, row] of rows.entries()) {
      const id = typeof row.studentId === 'string' ? row.studentId : '';
      const student = byId.get(id);
      const fail = (message: string) =>
        errors.push(`Row ${index + 2}: ${message}`);
      if (
        !student ||
        student.notRegistered ||
        student.studentCode !== String(row.studentCode)
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
      const score = parseMarkInput(row.score);
      const status =
        typeof row.status === 'string' && row.status
          ? row.status
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
      if (
        ((CONTROL_RESTRICTED_STATES as readonly string[]).includes(status) ||
          (CONTROL_RESTRICTED_STATES as readonly string[]).includes(
            student.components[detail.sheet.component]?.status ?? '',
          )) &&
        (!this.access.getCapabilities(user).canManageStates ||
          typeof row.reason !== 'string' ||
          row.reason.trim().length < 3)
      ) {
        fail('Special status requires permission and a reason');
        continue;
      }
      if (student.components[detail.sheet.component]?.isPublished) {
        fail('Hide published marks before importing');
        continue;
      }
      const scoreless = (
        CONTROL_SCORELESS_STATES as readonly string[]
      ).includes(status);
      if (
        (scoreless && score.value !== null) ||
        (!scoreless &&
          (score.value === null || validateMark(score.value, detail.rules)))
      ) {
        fail('Mark does not match status, maximum or step');
        continue;
      }
      const rev = Number(row.expectedRev);
      const current = student.components[detail.sheet.component];
      if (!Number.isInteger(rev) || rev !== (current?.rev ?? 0)) {
        fail('Stale mark revision');
        continue;
      }
      const attendance = parseMarkInput(row.attendanceMark),
        quizzes = parseMarkInput(row.quizzesMark);
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
      changes.push({
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
      });
    }
    const batch = await this.imports.create({
      sheetId: new Types.ObjectId(sheetId),
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
      errors,
      changes,
    };
  }

  async commit(user: AuthenticatedUser, sheetId: string, previewId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_IMPORT);
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER);
    const detail = await this.sheetService.getSheet(user, sheetId);
    const batch = await this.imports
      .findOne({
        _id: new Types.ObjectId(previewId),
        sheetId: new Types.ObjectId(sheetId),
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
      sheetId,
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
