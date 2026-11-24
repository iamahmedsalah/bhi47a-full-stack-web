import { jest } from '@jest/globals';
import ExcelJS from 'exceljs';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ControlReportsService } from './services/control-reports.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

function query<T>(data: T) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    batchSize: () => chain,
    lean: () => Promise.resolve(data),
  };
  return chain;
}
function fixture() {
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const course = {
    _id: courseId,
    code: '111',
    name: 'Thinking',
    nameAr: 'التفكير',
    level: '1',
  };
  const access = {
    assertPermission: jest.fn(),
    getCapabilities: () => ({ scopeAll: true }),
  };
  const profile = {
    userId: studentId,
    studentCode: '260001',
    fullName: 'Student',
    fullNameAr: 'طالب',
    tuitionFeesStatus: 'unpaid',
    isBlocked: true,
  };
  const rows = [
    {
      studentId: String(studentId),
      studentCode: profile.studentCode,
      name: 'Student',
      nameAr: 'طالب',
      notRegistered: false,
      components: {
        coursework: { score: 18, status: 'present' },
        midterm: { score: 15, status: 'present' },
        final: { score: null, status: 'banned' },
      },
      result: { total: 33 },
    },
  ];
  const courses = { find: jest.fn(() => query([course])) };
  const profiles = { find: jest.fn(() => query([profile])) };
  const marks = ['coursework', 'midterm', 'final'].map((examType) => ({
    studentId,
    courseId,
    examType,
    grade: examType === 'final' ? 0 : 15,
    status: examType === 'final' ? 'banned' : 'present',
  }));
  const grades = { find: jest.fn(() => query(marks)) };
  const registrations = {
    find: jest.fn(() => query([{ studentId, courses: ['111'] }])),
  };
  const service = new ControlReportsService(
    access as never,
    {
      getSheet: () =>
        Promise.resolve({
          sheet: { academicYear: '2026-2027', semester: 'first' },
          course: {
            id: String(courseId),
            code: '111',
            name: 'Thinking',
            nameAr: 'التفكير',
          },
        }),
    } as never,
    { workbook: () => Promise.resolve({ rows }) } as never,
    courses as never,
    profiles as never,
    grades as never,
    registrations as never,
  );
  const user = {
    _id: String(new Types.ObjectId()),
    role: 'admin',
  } as AuthenticatedUser;
  return {
    service,
    user,
    access,
    courses,
    profiles,
    grades,
    registrations,
    rows,
  };
}
describe('Control XLSX reports', () => {
  it('uses strict exam thresholds and present + banned denominator with flat fills', async () => {
    const ctx = fixture();
    const original = ctx.rows[0];
    ctx.rows.splice(
      0,
      ctx.rows.length,
      ...[
        { midterm: 18, final: 30, status: 'present' },
        { midterm: 19, final: 31, status: 'present' },
        { midterm: 30, final: 50, status: 'present' },
        { midterm: null, final: null, status: 'banned' },
        { midterm: 30, final: 50, status: 'absent' },
        { midterm: null, final: null, status: null },
      ].map((mark) => ({
        ...original,
        components: {
          ...original.components,
          midterm: { score: mark.midterm, status: mark.status },
          final: { score: mark.final, status: mark.status },
        },
      })),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await ctx.service.export(ctx.user, 'sheet', {
        type: 'course',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    );
    const analysis = book.worksheets[1];
    const rates: ExcelJS.Cell[] = [];
    analysis.eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === 'string' && label.includes('نسبة النجاح'))
        rates.push(row.getCell(2));
    });
    expect(rates).toHaveLength(2);
    // 2 passed out of (3 present + 1 banned = 4 eligible) = 0.5; absent & null excluded
    for (const cell of rates) {
      expect(cell.value).toBe(0.5);
      expect(cell.numFmt).toBe('0.00%');
      expect(cell.fill).toEqual({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0F2F1' },
      });
    }
    expect(analysis.model.conditionalFormattings ?? []).toHaveLength(0);
  });

  it('exports zero success rates for an empty course without division by zero', async () => {
    const ctx = fixture();
    ctx.rows.length = 0;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await ctx.service.export(ctx.user, 'sheet', {
        type: 'course',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    );
    const rates: ExcelJS.CellValue[] = [];
    book.worksheets[1].eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === 'string' && label.includes('نسبة النجاح'))
        rates.push(row.getCell(2).value);
    });
    expect(rates).toEqual([0, 0]);
  });
  it('exports course marks, exam status, registration, fees and a separate analysis', async () => {
    const ctx = fixture();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await ctx.service.export(ctx.user, 'sheet', {
        type: 'course',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    );
    expect(book.worksheets.map((page) => page.name)).toEqual([
      'تقرير المادة',
      'التحليل',
    ]);
    const page = book.worksheets[0];
    expect(page.getCell('I2').value).toBe(0);
    expect(page.getCell('J2').value).toBe('محروم');
    expect(page.getCell('L2').value).toBe('مسجل');
    expect(page.getCell('M2').value).toBe('غير مسدد');
    expect(book.worksheets[1].rowCount).toBeGreaterThan(20);
  });
  it('exports level/term courses and approved registration flags in the consolidated report', async () => {
    const ctx = fixture();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await ctx.service.export(ctx.user, 'sheet', {
        type: 'round-table',
        level: '1',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    );
    expect(book.worksheets).toHaveLength(1);
    const page = book.worksheets[0];
    expect(page.getCell('A2').value).toBe('260001');
    expect(page.getCell('C2').value).toBe('غير مسدد');
    expect(page.getCell('E2').value).toBe('مسجل');
    expect(page.getCell('K2').value).toBe('محروم');
    expect(ctx.profiles.find).toHaveBeenCalledWith({ level: '1' });
    expect(ctx.registrations.find).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYear: '2026-2027',
        semester: 'first',
        status: 'approved',
      }),
    );
  });
  it('rejects missing level, wrong term and staff scopes instead of exporting partial data', async () => {
    const ctx = fixture();
    await expect(
      ctx.service.export(ctx.user, 'sheet', {
        type: 'round-table',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    ).rejects.toThrow('Select a level');
    await expect(
      ctx.service.export(ctx.user, 'sheet', {
        type: 'course',
        academicYear: '2025-2026',
        semester: 'first',
      }),
    ).rejects.toThrow('Report term');
    ctx.access.getCapabilities = () => ({ scopeAll: false });
    await expect(
      ctx.service.export(ctx.user, 'sheet', {
        type: 'round-table',
        level: '1',
        academicYear: '2026-2027',
        semester: 'first',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.courses.find).not.toHaveBeenCalled();
  });
});
