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
  return { service, user, access, courses, profiles, grades, registrations };
}
describe('Control XLSX reports', () => {
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
