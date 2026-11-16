import { normalizeRowKeys } from './upload-utils';
import 'reflect-metadata';
import { Types } from 'mongoose';
import {
  validateHistoricalGrade,
  validateHistoricalGradeRow,
  DEFAULT_CONTROL_COMPONENTS,
} from '@student-portal/shared';
import { GradeImporter } from './importers/grade.importer';
import { UploadsController } from './uploads.controller';
import { UploadsTemplateGenerator } from './uploads-template.generator';
import * as ExcelJS from 'exceljs';

const row = {
  studentCode: '00123',
  courseCode: '111',
  academicYear: '2023-2024',
  semester: 'first',
  examType: 'midterm',
  grade: 25,
  status: 'present',
};
const now = new Date('2026-11-16T00:00:00Z');
const chain = (value: unknown) => {
  const q = { select: () => q, lean: () => Promise.resolve(value) };
  return q;
};

describe('historical grades', () => {
  it('uses new defaults, retains explicit historical maximums and validates Cairo academic-year boundaries', () => {
    expect(DEFAULT_CONTROL_COMPONENTS.map((c) => c.max)).toEqual([20, 30, 50]);
    expect(validateHistoricalGrade(row, now)).toMatchObject({
      ok: true,
      value: { maxGrade: 30, studentCode: '00123' },
    });
    expect(
      validateHistoricalGrade({ ...row, grade: 18, maxGrade: 20 }, now),
    ).toMatchObject({ ok: true, value: { maxGrade: 20 } });
    expect(
      validateHistoricalGrade(
        { ...row, academicYear: '2025-2026' },
        new Date('2026-08-31T20:00:00Z'),
      ).ok,
    ).toBe(false);
    expect(
      validateHistoricalGrade(
        { ...row, academicYear: '2025-2026' },
        new Date('2026-08-31T22:00:00Z'),
      ).ok,
    ).toBe(true);
  });
  it.each([
    { academicYear: undefined },
    { academicYear: '2026-2027' },
    { academicYear: '2023-2025' },
    { semester: undefined },
    { grade: -1 },
    { grade: 31 },
    { grade: '' },
    { grade: 'abc' },
    { grade: 0.001 },
    { maxGrade: 0 },
    { status: 'banned' },
    { midterm: 25 },
  ])('rejects ambiguous or invalid historical input %j', (changes) => {
    expect(validateHistoricalGrade({ ...row, ...changes }, now).ok).toBe(false);
  });
  it('does not turn invalid numeric text into a blank score or a default maximum during normalization', () => {
    for (const changes of [
      { grade: 'invalid', status: 'absent' },
      { maxGrade: 'invalid' },
      { grade: '25%' },
      { maxGrade: '30%' },
    ]) {
      expect(
        validateHistoricalGrade(
          normalizeRowKeys({ ...row, ...changes }, { strictNumbers: true }),
          now,
        ).ok,
      ).toBe(false);
    }
  });

  it('accepts absent midterms only with zero and preserves final exceptional statuses', () => {
    expect(
      validateHistoricalGrade({ ...row, grade: 0, status: 'absent' }, now).ok,
    ).toBe(true);
    expect(
      validateHistoricalGrade({ ...row, grade: 5, status: 'absent' }, now).ok,
    ).toBe(false);
    for (const status of ['banned', 'incomplete', 'excused'])
      expect(
        validateHistoricalGrade(
          { ...row, examType: 'final', grade: '', status },
          now,
        ).ok,
      ).toBe(true);
  });
  it('restricts the historical route to admins without changing ordinary upload permissions', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        Object.getOwnPropertyDescriptor(
          UploadsController.prototype,
          'uploadHistoricalBatch',
        )!.value as object,
      ),
    ).toEqual(['admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        Object.getOwnPropertyDescriptor(
          UploadsController.prototype,
          'uploadBatch',
        )!.value as object,
      ),
    ).toEqual(['admin', 'staff']);
  });
  it('inserts hidden marks, retries safely, rejects conflicting grades and respects Control ownership', async () => {
    let saved: Record<string, unknown> | null = null;
    const grades = {
      findOne: jest.fn(() => chain(saved)),
      findOneAndUpdate: jest.fn(
        (
          _filter: unknown,
          update: { $setOnInsert: Record<string, unknown> },
        ) => {
          saved = update.$setOnInsert;
          return chain(saved);
        },
      ),
    };
    const users = {
      find: jest.fn(() =>
        chain([{ _id: new Types.ObjectId(), studentCode: row.studentCode }]),
      ),
    };
    const courses = {
      find: jest.fn(() =>
        chain([{ _id: new Types.ObjectId(), code: '111', name: 'Thinking' }]),
      ),
    };
    const service = { hasControlSheet: jest.fn().mockResolvedValue(false) };
    const importer = new GradeImporter(
      users as never,
      courses as never,
      grades as never,
      service as never,
    );
    expect(
      await importer.commitHistorical([row], String(new Types.ObjectId())),
    ).toMatchObject({ successCount: 1, errors: [] });
    expect(saved).toMatchObject({
      historicalImport: true,
      isPublished: false,
      grade: 25,
      maxGrade: 30,
    });
    expect(await importer.commitHistorical([row], 'actor')).toMatchObject({
      successCount: 1,
      errors: [],
    });
    expect(grades.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(
      (await importer.commitHistorical([{ ...row, grade: 24 }], 'actor'))
        .successCount,
    ).toBe(0);
    service.hasControlSheet.mockResolvedValue(true);
    expect((await importer.commitHistorical([row], 'actor')).successCount).toBe(
      0,
    );
    expect(grades.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  it('generates a bilingual one-course-row template with separate scores, maxima and statuses', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const template = await UploadsTemplateGenerator.generate(
        'historical-grades',
        lang,
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(template.buffer as unknown as ExcelJS.Buffer);
      expect(workbook.worksheets).toHaveLength(1);
      expect(workbook.worksheets[0].columnCount).toBe(13);
      expect(workbook.worksheets[0].rowCount).toBe(1);
      expect(workbook.worksheets[0].getColumn(1).numFmt).toBe('@');
      expect(workbook.worksheets[0].getColumn(2).numFmt).toBe('@');
    }
  });

  it('validates one course row without inventing omitted marks or sharing exam statuses', () => {
    const wide = {
      studentCode: '00123',
      courseCode: '111',
      academicYear: '2023-2024',
      semester: 'first',
      coursework: 18,
      midterm: 0,
      final: 0,
      finalStatus: 'absent',
    };
    const parsed = validateHistoricalGradeRow(wide, now);
    expect(parsed).toMatchObject({
      ok: true,
      values: [
        { examType: 'coursework', grade: 18, maxGrade: 20, status: 'present' },
        { examType: 'midterm', grade: 0, maxGrade: 30, status: 'present' },
        { examType: 'final', grade: 0, maxGrade: 50, status: 'absent' },
      ],
    });
    expect(
      validateHistoricalGradeRow({ ...wide, coursework: '', midterm: '' }, now),
    ).toMatchObject({ ok: true, values: [{ examType: 'final' }] });
    expect(
      validateHistoricalGradeRow(
        { ...wide, final: 54, finalStatus: 'present', finalMaxGrade: 60 },
        now,
      ).ok,
    ).toBe(true);
    for (const changes of [
      { final: 51 },
      { midterm: '25%' },
      { final: 5 },
      { examType: 'final' },
      { status: 'absent' },
      { total: 18 },
      { practical: 2 },
      { finalMaxGrade: 'oops' },
      { final: '', finalStatus: 'absent' },
    ])
      expect(validateHistoricalGradeRow({ ...wide, ...changes }, now).ok).toBe(
        false,
      );
  });

  it('normalizes Arabic one-row headers without changing ordinary maximum aliases', () => {
    const input = {
      'كود الطالب': '00123',
      'كود المقرر': '111',
      'أعمال السنة': 18,
      الميدترم: 25,
      النهائي: 0,
      'عظمى النهائي': 60,
      'حالة النهائي': 'غائب',
      'السنة الدراسية': '2023-2024',
      'الفصل الدراسي': 'first',
    };
    expect(
      validateHistoricalGradeRow(
        normalizeRowKeys(input, { strictNumbers: true }),
        now,
      ),
    ).toMatchObject({
      ok: true,
      values: [
        { examType: 'coursework', grade: 18 },
        { examType: 'midterm', grade: 25 },
        { examType: 'final', grade: 0, maxGrade: 60, status: 'absent' },
      ],
    });
    expect(normalizeRowKeys({ 'عظمى النهائي': 60 })).toMatchObject({
      maxFinal: 60,
    });
  });

  it('counts a course row once, rejects invalid rows before writes, and retries each mark safely', async () => {
    const saved = new Map<string, Record<string, unknown>>();
    const grades = {
      findOne: jest.fn((filter: { examType: string }) =>
        chain(saved.get(filter.examType) ?? null),
      ),
      findOneAndUpdate: jest.fn(
        (
          filter: { examType: string },
          update: { $setOnInsert: Record<string, unknown> },
        ) => {
          saved.set(filter.examType, update.$setOnInsert);
          return chain(update.$setOnInsert);
        },
      ),
    };
    const service = { hasControlSheet: jest.fn().mockResolvedValue(false) };
    const importer = new GradeImporter(
      {
        find: () =>
          chain([{ _id: new Types.ObjectId(), studentCode: '00123' }]),
      } as never,
      {
        find: () =>
          chain([{ _id: new Types.ObjectId(), code: '111', name: 'Thinking' }]),
      } as never,
      grades as never,
      service as never,
    );
    const wide = {
      studentCode: '00123',
      courseCode: '111',
      academicYear: '2023-2024',
      semester: 'first',
      coursework: 18,
      midterm: 25,
      final: 0,
      finalStatus: 'absent',
    };
    expect(
      await importer.commitHistorical([{ ...wide, final: 70 }], 'actor'),
    ).toMatchObject({ successCount: 0 });
    expect(grades.findOneAndUpdate).not.toHaveBeenCalled();
    expect(await importer.commitHistorical([wide], 'actor')).toEqual({
      successCount: 1,
      errors: [],
    });
    expect(saved.size).toBe(3);
    expect(saved.get('coursework')).toMatchObject({
      grade: 18,
      status: 'present',
      isPublished: false,
      historicalImport: true,
    });
    expect(saved.get('final')).toMatchObject({ grade: 0, status: 'absent' });
    expect(await importer.commitHistorical([wide], 'actor')).toEqual({
      successCount: 1,
      errors: [],
    });
    expect(grades.findOneAndUpdate).toHaveBeenCalledTimes(3);
    const conflict = await importer.commitHistorical(
      [{ ...wide, coursework: 17, midterm: 24 }],
      'actor',
    );
    expect(conflict.successCount).toBe(0);
    expect(conflict.errors).toHaveLength(1);
    service.hasControlSheet.mockResolvedValue(true);
    expect(
      (await importer.commitHistorical([wide], 'actor')).successCount,
    ).toBe(0);
    expect(grades.findOneAndUpdate).toHaveBeenCalledTimes(3);
  });
});
