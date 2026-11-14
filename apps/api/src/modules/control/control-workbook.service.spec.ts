import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import ExcelJS from 'exceljs';
import {
  DEFAULT_CONTROL_COMPONENTS,
  computeCoursework,
  PERMISSIONS,
} from '@student-portal/shared';
import { ControlAccessService } from './services/control-access.service';
import { ControlWorkbookService } from './services/control-workbook.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

const chain = (value: unknown) => {
  const query = {
    lean: () => Promise.resolve(value),
    session: (_session: unknown) => query,
    sort: (_sort: unknown) => query,
    limit: (_limit: number) => query,
    batchSize: (_size: number) => query,
    select: (_fields: string) => query,
  };
  return query;
};
function build(component: 'midterm' | 'coursework' | 'final' = 'midterm') {
  const studentId = String(new Types.ObjectId()),
    sheetId = String(new Types.ObjectId()),
    actorId = String(new Types.ObjectId());
  const scheme = {
    courseId: String(new Types.ObjectId()),
    academicYear: '2026-2027',
    semester: 'first',
    version: 1,
    frozenAt: null,
    components: DEFAULT_CONTROL_COMPONENTS.map((c) => ({ ...c })),
    courseworkAttendanceMax: 5,
    courseworkQuizzesMax: 15,
  };
  const sheet = {
    _id: new Types.ObjectId(sheetId),
    courseId: new Types.ObjectId(scheme.courseId),
    academicYear: scheme.academicYear,
    semester: scheme.semester,
    component,
    workflowState: 'DRAFT',
    revision: 0,
    submission: undefined as undefined | Record<string, unknown>,
    locked: false,
  };
  const doc = {
    _id: new Types.ObjectId(),
    studentId: new Types.ObjectId(studentId),
    grade: 15,
    maxGrade: 20,
    status: 'present',
    rev: 1,
    isPublished: false,
  };
  const session = {
    withTransaction: (fn: () => Promise<unknown>) => fn(),
    endSession: jest.fn(),
  };
  const sheets = {
    db: {
      startSession: () => Promise.resolve(session),
      collection: () => ({ findOne: () => Promise.resolve(null) }),
    },
    findById: () => chain(sheet),
    updateOne: jest.fn(
      (_filter: unknown, update: { $set: Partial<typeof sheet> }) => {
        Object.assign(sheet, update.$set);
        sheet.revision++;
        return Promise.resolve({ matchedCount: 1 });
      },
    ),
  };
  const audit = { create: jest.fn().mockResolvedValue([]) };
  const imports = {
    create: jest.fn((data) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...data }),
    ),
    findOne: jest.fn(() => chain(null)),
  };
  const access = {
    assertPermission: jest.fn(),
    getCapabilities: () => ({ canManageStates: false }),
  };
  const sheetService = {
    getSheet: jest.fn(() =>
      Promise.resolve({
        sheet: { id: sheetId, ...sheet },
        course: { id: scheme.courseId },
        rules: { max: 20, step: 0.5 },
        capabilities: { canEdit: true },
      }),
    ),
    requireSheetInScope: () =>
      Promise.resolve({ sheet, course: { code: 'CS101' } }),
    getRosterStudentIds: () => Promise.resolve(new Set([studentId])),
  };
  const mutations = {
    applyChanges: jest
      .fn()
      .mockResolvedValue({ results: [], summary: { ok: 1 } }),
  };
  const grades = {
    find: () => chain([doc]),
    updateMany: jest.fn().mockResolvedValue({}),
  };
  const service = new ControlWorkbookService(
    grades as never,
    sheets as never,
    audit as never,
    imports as never,
    access as never,
    sheetService as never,
    mutations as never,
    { getScheme: () => Promise.resolve(scheme), freeze: jest.fn() } as never,
  );
  const rows = [
    {
      studentId,
      studentCode: '260001',
      name: 'Synthetic',
      nameAr: null,
      notRegistered: false,
      score: null,
      status: null,
      rev: 0,
      isPublished: false,
      updatedAt: null,
      components: {},
      result: { total: null, totalMax: 100, complete: false },
    },
  ];
  jest.spyOn(service, 'workbook').mockResolvedValue({ scheme, rows } as never);
  const user = { _id: actorId, role: 'admin' } as AuthenticatedUser;
  const row = {
    studentId,
    studentCode: '260001',
    score: '١٧٫٥',
    expectedRev: 0,
  };
  return {
    service,
    user,
    row,
    sheetId,
    sheet,
    doc,
    imports,
    audit,
    access,
    rows,
    scheme,
    mutations,
  };
}

describe('Control workbook import and review', () => {
  it('skips unchanged imported marks instead of generating grade writes', async () => {
    const ctx = build();
    ctx.rows[0].components = {
      midterm: {
        studentId: ctx.row.studentId,
        score: 17.5,
        status: 'present',
        rev: 0,
        isPublished: false,
        updatedAt: null,
        attendanceMark: null,
        quizzesMark: null,
      },
    };
    const preview = await ctx.service.preview(ctx.user, ctx.sheetId, [ctx.row]);
    expect(preview).toMatchObject({ valid: 0, skipped: 1, errors: [] });
    expect(ctx.mutations.applyChanges).not.toHaveBeenCalled();
  });

  it('accepts a zero beside an absent midterm and retains the exam status', async () => {
    const ctx = build();
    const preview = await ctx.service.preview(ctx.user, ctx.sheetId, [
      {
        ...ctx.row,
        score: 0,
        status: 'absent',
      },
    ]);
    expect(preview.errors).toEqual([]);
    expect(preview.changes[0]).toMatchObject({ score: null, status: 'absent' });
  });

  it('exports a compact entry sheet with hidden revision metadata and separate context', async () => {
    const ctx = build();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
    const entry = book.getWorksheet('Marks')!;
    expect(entry.getColumn(7).hidden).toBe(true);
    expect(entry.getColumn(5).hidden).toBe(true);
    expect(entry.getColumn(9).hidden).toBe(true);
    expect(book.getWorksheet('CourseContext')).toBeDefined();
    expect(entry.getCell('C2').dataValidation).toMatchObject({
      type: 'decimal',
    });
  });
  it('denies ordinary sheet approval on a final sheet', async () => {
    const ctx = build('final');
    const access = new ControlAccessService({} as never, {} as never);
    ctx.access.assertPermission.mockImplementation((user, permission) =>
      access.assertPermission(user, permission),
    );
    await expect(
      ctx.service.review(
        {
          ...ctx.user,
          role: 'staff',
          permissions: [
            PERMISSIONS.CONTROL_ACCESS,
            PERMISSIONS.CONTROL_SHEETS_APPROVE,
          ],
        },
        ctx.sheetId,
        { action: 'APPROVE', expectedRevision: 0 } as never,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(ctx.doc).not.toHaveProperty('controlApprovedRev');
  });
  it('denies a review-only TA who calls approval directly', async () => {
    const ctx = build();
    const access = new ControlAccessService({} as never, {} as never);
    ctx.access.assertPermission.mockImplementation((user, permission) =>
      access.assertPermission(user, permission),
    );
    await expect(
      ctx.service.review(
        {
          ...ctx.user,
          role: 'staff',
          permissions: [
            PERMISSIONS.CONTROL_ACCESS,
            PERMISSIONS.CONTROL_SHEETS_REVIEW,
          ],
        },
        ctx.sheetId,
        { action: 'APPROVE', expectedRevision: 0 } as never,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(ctx.doc).not.toHaveProperty('controlApprovedRev');
  });
  it.each([
    [18, 10, 18],
    [10, 18, 18],
    [18, 18, 18],
  ])(
    'accepts a single edited column beside a saved reference mark (%s, %s)',
    async (score, context, expected) => {
      const ctx = build();
      Object.assign(ctx.rows[0].components, {
        midterm: { score: 10, status: 'present', rev: 0 },
      });
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
      book.getWorksheet('Marks')!.getCell('C2').value = score;
      book.getWorksheet('Marks')!.getCell('J2').value = context;
      const preview = await ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      expect(preview.valid).toBe(1);
      expect(preview.changes[0].score).toBe(expected);
    },
  );
  it('does not restore a reference mark when changing to a scoreless status', async () => {
    const ctx = build();
    Object.assign(ctx.rows[0].components, {
      midterm: { score: 10, status: 'present', rev: 0 },
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
    book.getWorksheet('Marks')!.getCell('C2').value = '';
    book.getWorksheet('Marks')!.getCell('D2').value = 'absent';
    const preview = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(preview.valid).toBe(1);
    expect(preview.changes[0]).toMatchObject({ score: null, status: 'absent' });
  });
  it.each([0, 18, 21, 0.25])(
    'validates a mark entered in the active midterm column: %s',
    async (mark) => {
      const ctx = build();
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
      book.getWorksheet('Marks')!.getCell('J2').value = mark;
      const result = await ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      expect(result.valid).toBe(mark <= 20 && mark % 0.5 === 0 ? 1 : 0);
      expect(result.errors).toHaveLength(result.valid ? 0 : 1);
      if (result.valid) expect(result.changes[0].score).toBe(mark);
      expect(ctx.mutations.applyChanges).not.toHaveBeenCalled();
    },
  );
  it('reports blank rows without treating them as saved and rejects conflicting score inputs', async () => {
    const ctx = build();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
    const blank = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(blank).toMatchObject({ valid: 0, skipped: 1, errors: [] });
    book.getWorksheet('Marks')!.getCell('C2').value = 10;
    book.getWorksheet('Marks')!.getCell('J2').value = 18;
    const conflict = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(conflict.valid).toBe(0);
    expect(conflict.errors[0]).toContain('Conflicting score');
  });
  it.each([{}, [], true, NaN, Infinity, null, undefined])(
    'rejects a non-scalar or invalid student code: %p',
    async (studentCode) => {
      const ctx = build();
      const result = await ctx.service.preview(ctx.user, ctx.sheetId, [
        { ...ctx.row, studentCode },
      ]);
      expect(result.changes).toHaveLength(0);
      expect(result.errors).toContain(
        'Row 2: Student identity/registration mismatch',
      );
    },
  );
  it('accepts a finite numeric student code from Excel', async () => {
    const ctx = build();
    const result = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, studentCode: 260001 },
    ]);
    expect(result.valid).toBe(1);
  });
  it.each(['absent', 'banned', 'excused', 'incomplete'])(
    'allows reviewed scoreless coursework status %s without a numeric breakdown',
    async (status) => {
      const ctx = build('coursework');
      ctx.doc.status = status;
      ctx.doc.grade = 0;
      await ctx.service.review(ctx.user, ctx.sheetId, {
        action: 'SUBMIT',
        expectedRevision: 0,
        reason: 'Reviewed scoreless status',
      });
      expect(ctx.sheet.workflowState).toBe('IN_REVIEW');
    },
  );
  it('normalizes Arabic marks, preserves zero and ignores blank cells', async () => {
    const ctx = build();
    const result = await ctx.service.preview(ctx.user, ctx.sheetId, [ctx.row]);
    expect(result.changes[0].score).toBe(17.5);
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: 0 },
        ])
      ).changes[0].score,
    ).toBe(0);
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: '' },
        ])
      ).valid,
    ).toBe(0);
  });
  it('rejects reused-code identity mismatches, invalid marks and duplicate students', async () => {
    const ctx = build();
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, studentCode: 'old-code' },
        ])
      ).errors,
    ).toHaveLength(1);
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: 21 },
        ])
      ).valid,
    ).toBe(0);
    const duplicate = await ctx.service.preview(ctx.user, ctx.sheetId, [
      ctx.row,
      ctx.row,
    ]);
    expect(duplicate.valid).toBe(1);
    expect(duplicate.errors).toHaveLength(1);
  });
  it('requires attendance and quiz contributions within the configured 5/15 split', async () => {
    const ctx = build('coursework');
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: 17, attendanceMark: 4, quizzesMark: 13 },
        ])
      ).valid,
    ).toBe(1);
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: 17, attendanceMark: 7, quizzesMark: 10 },
        ])
      ).valid,
    ).toBe(0);
    expect(
      (
        await ctx.service.preview(ctx.user, ctx.sheetId, [
          { ...ctx.row, score: 17 },
        ])
      ).valid,
    ).toBe(0);
    expect(computeCoursework(5, 15)).toBe(20);
    expect(computeCoursework(6, 15)).toBeNull();
  });
  it('rejects special statuses without their additional permission and reason', async () => {
    const ctx = build();
    const result = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: '', status: 'excused' },
    ]);
    expect(result.valid).toBe(0);
  });
  it('rejects a stale template scheme version', async () => {
    const ctx = build();
    await expect(
      ctx.service.preview(ctx.user, ctx.sheetId, [ctx.row], 99),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('exports a real workbook which can be previewed without altering grades', async () => {
    const ctx = build();
    const bytes = await ctx.service.export(ctx.user, ctx.sheetId);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    expect(book.getWorksheet('Marks')?.getCell('A2').text).toBe('260001');
    expect(book.getWorksheet('إرشادات الرصد')).toBeDefined();
    book.getWorksheet('Marks')!.getCell('C2').value = 18;
    const result = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(result.valid).toBe(1);
    expect(ctx.mutations.applyChanges).not.toHaveBeenCalled();
    book.getWorksheet('Marks')!.getCell('C2').value = {
      formula: '10+10',
      result: 20,
    };
    await expect(
      ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('previews 501 XLSX rows in scoped batches and rejects duplicates across batches', async () => {
    const ctx = build();
    const first = ctx.rows[0];
    for (let i = 1; i <= 500; i++)
      ctx.rows.push({
        ...first,
        studentId: String(new Types.ObjectId()),
        studentCode: String(260001 + i),
      });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
    const page = book.getWorksheet('Marks')!;
    for (let row = 2; row <= 502; row++) page.getCell('C' + row).value = 15;
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const firstBatch = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      bytes,
      0,
    );
    const lastBatch = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      bytes,
      1,
    );
    expect(firstBatch).toMatchObject({
      valid: 500,
      totalBatches: 2,
      totalRows: 501,
      batchIndex: 0,
    });
    expect(lastBatch).toMatchObject({ valid: 1, batchIndex: 1 });
    expect(lastBatch.changes[0].studentId).toBe(ctx.rows[500].studentId);
    expect(ctx.mutations.applyChanges).not.toHaveBeenCalled();
    page.getCell('C502').value = 25;
    const invalid = await ctx.service.previewFile(
      ctx.user,
      ctx.sheetId,
      Buffer.from(await book.xlsx.writeBuffer()),
      1,
    );
    expect(invalid.valid).toBe(0);
    expect(invalid.errors[0]).toMatch(/^Row 502:/);
    page.getCell('A502').value = page.getCell('A2').text;
    await expect(
      ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
        1,
      ),
    ).rejects.toThrow('Duplicate student in file at row 502');
    await expect(
      ctx.service.previewFile(ctx.user, ctx.sheetId, bytes, -1),
    ).rejects.toThrow('Invalid import batch');
    await expect(
      ctx.service.previewFile(ctx.user, ctx.sheetId, bytes, 2),
    ).rejects.toThrow('Invalid import batch');
  });
  it('submits an immutable digest and prevents the submitter approving their own sheet', async () => {
    const ctx = build();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
      reason: 'Marks checked',
    });
    expect(ctx.sheet.workflowState).toBe('IN_REVIEW');
    expect(ctx.sheet.submission?.digest).toBeTruthy();
    await expect(
      ctx.service.review(ctx.user, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 1,
        reason: 'Reviewed',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const reviewer = { ...ctx.user, _id: String(new Types.ObjectId()) };
    await ctx.service.review(reviewer, ctx.sheetId, {
      action: 'APPROVE',
      expectedRevision: 1,
      reason: 'Independent review',
    });
    expect(ctx.sheet.workflowState).toBe('APPROVED');
    expect(ctx.audit.create).toHaveBeenCalledTimes(2);
  });
  it('exports filtered missing/exception reports and scopes failed-row reports to the preview owner', async () => {
    const ctx = build();
    const missing = new ExcelJS.Workbook();
    await missing.xlsx.load(
      await ctx.service.export(ctx.user, ctx.sheetId, 'missing'),
    );
    expect(missing.getWorksheet('Marks')?.rowCount).toBe(2);
    const exceptions = new ExcelJS.Workbook();
    await exceptions.xlsx.load(
      await ctx.service.export(ctx.user, ctx.sheetId, 'exceptions'),
    );
    expect(exceptions.getWorksheet('Marks')?.rowCount).toBe(1);
    const previewId = String(new Types.ObjectId());
    await expect(
      ctx.service.exportErrors(ctx.user, ctx.sheetId, previewId),
    ).rejects.toBeInstanceOf(BadRequestException);
    ctx.imports.findOne.mockReturnValueOnce(
      chain({ errors: ['Row 2: invalid mark'] }),
    );
    const failed = new ExcelJS.Workbook();
    await failed.xlsx.load(
      await ctx.service.exportErrors(ctx.user, ctx.sheetId, previewId),
    );
    expect(failed.getWorksheet('Import errors')?.getCell('A2').text).toContain(
      'Row 2',
    );
  });
  it('detects changes to submitted marks and stale workflow revisions', async () => {
    const ctx = build();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
      reason: 'Checked',
    });
    ctx.doc.grade = 16;
    const reviewer = { ...ctx.user, _id: String(new Types.ObjectId()) };
    await expect(
      ctx.service.review(reviewer, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 1,
        reason: 'Reviewed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      ctx.service.review(reviewer, ctx.sheetId, {
        action: 'RETURN',
        expectedRevision: 0,
        reason: 'Correct',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
