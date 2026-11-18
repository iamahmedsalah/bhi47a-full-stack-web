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
    components: DEFAULT_CONTROL_COMPONENTS.map((c) => ({
      ...c,
      step: 0.5,
      max: c.key === 'midterm' ? 20 : c.key === 'final' ? 60 : c.max,
    })),
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
    reviewSubmission: undefined as undefined | Record<string, unknown>,
    locked: false,
  };
  const doc = {
    examType: component,
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
    find: () => chain([sheet]),
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
    listEntries: jest.fn(),
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
  const profiles = {
    find: jest.fn(() =>
      chain(
        [] as Array<{
          userId: Types.ObjectId;
          isBlocked: boolean;
          tuitionFeesStatus: string;
        }>,
      ),
    ),
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
    { approve: jest.fn().mockResolvedValue(undefined) } as never,
    profiles as never,
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
    grades,
    profiles,
    sheetService,
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
  it('reads current tuition flags in one scoped query without changing exam marks', async () => {
    const ctx = build();
    jest.restoreAllMocks();
    ctx.sheetService.listEntries.mockResolvedValue({ entries: ctx.rows });
    ctx.profiles.find.mockReturnValue(
      chain([
        {
          userId: new Types.ObjectId(ctx.rows[0].studentId),
          isBlocked: true,
          tuitionFeesStatus: 'unpaid',
        },
      ]),
    );
    const result = await ctx.service.workbook(ctx.user, ctx.sheetId);
    expect(result.rows[0].tuition).toEqual({
      isBlocked: true,
      status: 'unpaid',
    });
    expect(result.rows[0].components.midterm).toMatchObject({
      score: 15,
      status: 'present',
    });
    expect(ctx.profiles.find).toHaveBeenCalledTimes(1);
    expect(ctx.profiles.find).toHaveBeenCalledWith({
      userId: { $in: [new Types.ObjectId(ctx.rows[0].studentId)] },
    });
    ctx.profiles.find.mockReturnValue(
      chain([
        {
          userId: new Types.ObjectId(ctx.rows[0].studentId),
          isBlocked: false,
          tuitionFeesStatus: 'paid',
        },
      ]),
    );
    expect(
      (await ctx.service.workbook(ctx.user, ctx.sheetId)).rows[0].tuition,
    ).toEqual({ isBlocked: false, status: 'paid' });
    ctx.profiles.find.mockReturnValue(chain([]));
    expect(
      (await ctx.service.workbook(ctx.user, ctx.sheetId)).rows[0].tuition,
    ).toEqual({ isBlocked: false, status: null });
  });
  it.each(['midterm', 'coursework', 'final'] as const)(
    'highlights held %s Excel rows and keeps tuition informational on import',
    async (component) => {
      const ctx = build(component);
      Object.assign(ctx.rows[0], {
        tuition: { isBlocked: true, status: 'unpaid' },
      });
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        await ctx.service.template(ctx.user, ctx.sheetId, component),
      );
      const page = book.worksheets[0];
      expect(page.getCell('O2').text).toContain('محجوب');
      for (const col of [1, 2, 3, 4, 8, 15])
        expect(page.getCell(2, col).fill).toMatchObject({
          fgColor: { argb: 'FFFDE9E7' },
        });
      expect(page.conditionalFormattings[0].ref).toBe('A2:O2');
      page.getCell('C2').value = component === 'coursework' ? 17 : 18;
      page.getCell('D2').value = 'حاضر';
      if (component === 'coursework') {
        page.getCell('E2').value = 4;
        page.getCell('F2').value = 13;
      }
      page.getCell('O2').value = 'مسدد / Paid';
      const result = await ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      expect(result.errors).toEqual([]);
      expect(result.changes[0].status).toBe('present');
      expect(result.changes[0]).not.toHaveProperty('tuition');
      const exported = new ExcelJS.Workbook();
      await exported.xlsx.load(await ctx.service.export(ctx.user, ctx.sheetId));
      expect(exported.getWorksheet('Marks')!.getCell('O2').text).toContain(
        'محجوب',
      );
      expect(
        exported.getWorksheet('CourseContext')!.getCell('I2').text,
      ).toContain('محجوب');
    },
  );
  it.each(['coursework', 'midterm', 'final'] as const)(
    'round trips the single-sheet %s entry template without extra tabs',
    async (component) => {
      const ctx = build(component);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        await ctx.service.template(ctx.user, ctx.sheetId, component),
      );
      expect(book.worksheets).toHaveLength(1);
      const page = book.worksheets[0];
      expect(page.name).toMatch(/^رصد /);
      expect(page.getColumn(9).hidden).toBe(true);
      expect(page.getColumn(7).hidden).toBe(true);
      page.getCell('C2').value = component === 'coursework' ? 17 : 18;
      if (component === 'coursework') {
        page.getCell('E2').value = 4;
        page.getCell('F2').value = 13;
      }
      const result = await ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(1);
      page.getCell('N1').value = component === 'final' ? 'midterm' : 'final';
      await expect(
        ctx.service.previewFile(
          ctx.user,
          ctx.sheetId,
          Buffer.from(await book.xlsx.writeBuffer()),
        ),
      ).rejects.toThrow('Download the template for this sheet');
    },
  );
  it('skips unchanged rows from an older template but rejects stale changed marks', async () => {
    const ctx = build();
    ctx.rows[0].components = {
      midterm: { score: 5, status: 'present', rev: 4 },
    };
    const unchanged = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: 5, status: 'present', expectedRev: 0 },
    ]);
    expect(unchanged).toMatchObject({ valid: 0, skipped: 1, errors: [] });
    const changed = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: 12, status: 'present', expectedRev: 0 },
    ]);
    expect(changed.valid).toBe(0);
    expect(changed.errors[0]).toContain('Stale mark revision');
  });
  it('reports the exact maximum or increment instead of an ambiguous score error', async () => {
    const ctx = build();
    const maximum = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: 21 },
    ]);
    expect(maximum.errors[0]).toContain(
      'Mark rule: above_max; max=20; step=0.5',
    );
    const increment = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: 12.2 },
    ]);
    expect(increment.errors[0]).toContain(
      'Mark rule: off_step; max=20; step=0.5',
    );
  });
  it('skips unchanged IC copies but marks an Excel edit invalid before commit', async () => {
    const ctx = build();
    ctx.rows[0].components = {
      midterm: {
        score: 15,
        status: 'present',
        rev: 1,
        carriedFrom: { academicYear: '2025-2026', semester: 'first' },
      },
    };
    expect(
      await ctx.service.preview(ctx.user, ctx.sheetId, [
        { ...ctx.row, score: 15, status: 'present', expectedRev: 1 },
      ]),
    ).toMatchObject({ valid: 0, skipped: 1, errors: [] });
    const edited = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: 12, status: 'present', expectedRev: 1 },
    ]);
    expect(edited.valid).toBe(0);
    expect(edited.errors[0]).toContain('IC contributions are read-only');
  });
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
  it('rejects special statuses without their additional permission', async () => {
    const ctx = build();
    const result = await ctx.service.preview(ctx.user, ctx.sheetId, [
      { ...ctx.row, score: '', status: 'excused' },
    ]);
    expect(result.valid).toBe(0);
  });
  it.each(['banned', 'incomplete', 'excused', 'withheld'] as const)(
    'previews %s imports with an optional reason',
    async (status) => {
      const ctx = build('final');
      ctx.access.getCapabilities = () => ({ canManageStates: true });
      const result = await ctx.service.preview(ctx.user, ctx.sheetId, [
        { ...ctx.row, status, score: status === 'withheld' ? 12 : '' },
      ]);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(1);
      expect(result.changes[0].reason).toBeUndefined();
    },
  );
  it.each(['midterm', 'final'] as const)(
    'round trips a banned %s XLSX status without a reason',
    async (component) => {
      const ctx = build(component);
      ctx.access.getCapabilities = () => ({ canManageStates: true });
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        await ctx.service.template(ctx.user, ctx.sheetId, component),
      );
      book.worksheets[0].getCell('C2').value = 0;
      book.worksheets[0].getCell('D2').value = 'محروم';
      const result = await ctx.service.previewFile(
        ctx.user,
        ctx.sheetId,
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      expect(result.errors).toEqual([]);
      expect(result.changes[0]).toMatchObject({
        status: 'banned',
        score: null,
      });
    },
  );
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
    expect(result.reviewRows[0]).toMatchObject({
      sourceRow: 2,
      studentCode: '260001',
      after: 18,
      examStatus: 'present',
      status: 'valid',
      issues: [],
    });
    expect(result.rules).toMatchObject({
      component: 'midterm',
      max: 20,
      step: 0.5,
    });
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
    expect(invalid.reviewRows[0]).toMatchObject({
      sourceRow: 502,
      studentCode: ctx.rows[500].studentCode,
      status: 'invalid',
    });
    expect(invalid.reviewRows[0].issues).toHaveLength(1);
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
  it('explains an empty exported workbook instead of reporting a successful import', async () => {
    const ctx = build();
    ctx.rows.splice(0);
    const bytes = await ctx.service.export(ctx.user, ctx.sheetId, 'missing');
    await expect(
      ctx.service.previewFile(ctx.user, ctx.sheetId, bytes),
    ).rejects.toMatchObject({
      response: { code: 'CONTROL_IMPORT_EMPTY' },
    });
    expect(ctx.mutations.applyChanges).not.toHaveBeenCalled();
  });
  it.each(['midterm', 'final'] as const)(
    'defers a held blank %s through submission, review and approval without inserting a grade',
    async (key) => {
      const ctx = build(key);
      jest.spyOn(ctx.grades, 'find').mockReturnValue(chain([]));
      ctx.profiles.find.mockReturnValue(
        chain([
          {
            userId: ctx.doc.studentId,
            isBlocked: true,
            tuitionFeesStatus: 'unpaid',
          },
        ]),
      );
      for (const [index, action] of (
        ['SUBMIT', 'SUBMIT_APPROVAL', 'APPROVE'] as const
      ).entries()) {
        await ctx.service.review(ctx.user, ctx.sheetId, {
          action,
          expectedRevision: index,
        });
      }
      expect(ctx.sheet.workflowState).toBe('APPROVED');
      expect(ctx.sheet).toMatchObject({
        tuitionDeferredStudentIds: [String(ctx.doc.studentId)],
      });
      expect(ctx.grades.updateMany).toHaveBeenCalledWith(
        { _id: { $in: [] } },
        expect.any(Array),
        expect.any(Object),
      );
      expect(ctx.audit.create).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            newValue: expect.objectContaining({
              tuitionDeferredStudentIds: [String(ctx.doc.studentId)],
            }),
          }),
        ],
        expect.any(Object),
      );
    },
  );
  it.each(['midterm', 'final', 'coursework'] as const)(
    'still rejects missing %s without an eligible financial deferral',
    async (key) => {
      const ctx = build(key);
      jest.spyOn(ctx.grades, 'find').mockReturnValue(chain([]));
      // Coursework is required even when the student has a financial hold.
      if (key === 'coursework')
        ctx.profiles.find.mockReturnValue(
          chain([
            {
              userId: ctx.doc.studentId,
              isBlocked: true,
              tuitionFeesStatus: 'unpaid',
            },
          ]),
        );
      await expect(
        ctx.service.review(ctx.user, ctx.sheetId, {
          action: 'SUBMIT',
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({
        response: { code: 'RESULT_INCOMPLETE', details: { missingCount: 1 } },
      });
      expect(ctx.sheet.workflowState).toBe('DRAFT');
    },
  );
  it('rechecks a lifted hold before approval instead of treating the blank as zero', async () => {
    const ctx = build();
    jest.spyOn(ctx.grades, 'find').mockReturnValue(chain([]));
    ctx.profiles.find.mockReturnValue(
      chain([
        {
          userId: ctx.doc.studentId,
          isBlocked: true,
          tuitionFeesStatus: 'unpaid',
        },
      ]),
    );
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
    });
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 1,
    });
    ctx.profiles.find.mockReturnValue(chain([]));
    await expect(
      ctx.service.review(ctx.user, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ response: { code: 'RESULT_INCOMPLETE' } });
    expect(ctx.sheet.workflowState).toBe('PENDING_APPROVAL');
  });
  it('does not waive invalid entered marks because a student is financially blocked', async () => {
    const ctx = build();
    ctx.doc.grade = 21;
    await expect(
      ctx.service.review(ctx.user, ctx.sheetId, {
        action: 'SUBMIT',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESULT_INCOMPLETE', details: { invalidCount: 1 } },
    });
  });
  it('submits an immutable digest and prevents staff approving their own sheet', async () => {
    const ctx = build();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
      reason: 'Marks checked',
    });
    expect(ctx.sheet.workflowState).toBe('IN_REVIEW');
    expect(ctx.sheet.submission?.digest).toBeTruthy();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 1,
      reason: 'Control checked',
    });
    await expect(
      ctx.service.review(
        { ...ctx.user, role: 'staff', permissions: Object.values(PERMISSIONS) },
        ctx.sheetId,
        {
          action: 'APPROVE',
          expectedRevision: 2,
          reason: 'Reviewed',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const reviewer = { ...ctx.user, _id: String(new Types.ObjectId()) };
    await ctx.service.review(reviewer, ctx.sheetId, {
      action: 'APPROVE',
      expectedRevision: 2,
      reason: 'Independent review',
    });
    expect(ctx.sheet.workflowState).toBe('APPROVED');
    expect(ctx.audit.create).toHaveBeenCalledTimes(3);
  });
  it('freezes the corrected snapshot before approval and returns approval corrections to Control', async () => {
    const ctx = build();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
      reason: 'Doctor marks',
    });
    const original = ctx.sheet.submission?.digest;
    await expect(
      ctx.service.review(ctx.user, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 1,
        reason: 'Skip review',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    ctx.doc.grade = 16;
    const control = {
      ...ctx.user,
      _id: String(new Types.ObjectId()),
      role: 'staff' as const,
    };
    await ctx.service.review(control, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 1,
      reason: 'Control corrected',
    });
    expect(ctx.sheet.workflowState).toBe('PENDING_APPROVAL');
    expect(ctx.sheet.submission?.digest).toBe(original);
    expect(ctx.sheet.reviewSubmission?.digest).not.toBe(original);
    await expect(
      ctx.service.review(control, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 2,
        reason: 'Self approval',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'RETURN',
      expectedRevision: 2,
      reason: 'Control recheck',
    });
    expect(ctx.sheet.workflowState).toBe('IN_REVIEW');
    expect(ctx.sheet.reviewSubmission).toBeNull();
    await ctx.service.review(control, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 3,
      reason: 'Review complete',
    });
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'APPROVE',
      expectedRevision: 4,
      reason: 'Admin approval',
    });
    expect(ctx.sheet.workflowState).toBe('APPROVED');
  });
  it('allows the administrator to approve their own unchanged submitted sheet', async () => {
    const ctx = build();
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT',
      expectedRevision: 0,
      reason: 'Admin submission',
    });
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 1,
      reason: 'Admin review',
    });
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'APPROVE',
      expectedRevision: 2,
      reason: 'Admin self approval',
    });
    expect(ctx.sheet.workflowState).toBe('APPROVED');
    expect(ctx.audit.create).toHaveBeenCalledTimes(3);
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'REOPEN',
      expectedRevision: 3,
    });
    expect(ctx.sheet.workflowState).toBe('DRAFT');
    expect(ctx.audit.create).toHaveBeenCalledTimes(4);
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
    await ctx.service.review(ctx.user, ctx.sheetId, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: 1,
      reason: 'Reviewed',
    });
    ctx.doc.grade = 16;
    const reviewer = { ...ctx.user, _id: String(new Types.ObjectId()) };
    await expect(
      ctx.service.review(reviewer, ctx.sheetId, {
        action: 'APPROVE',
        expectedRevision: 2,
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
