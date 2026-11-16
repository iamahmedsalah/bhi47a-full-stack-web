import { normalizeRowKeys } from './upload-utils';
import 'reflect-metadata';
import { Types } from 'mongoose';
import {
  validateHistoricalGrade,
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
  it('generates a single concise bilingual sheet without conflicting breakdown columns', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const template = await UploadsTemplateGenerator.generate(
        'historical-grades',
        lang,
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(template.buffer as unknown as ExcelJS.Buffer);
      expect(workbook.worksheets).toHaveLength(1);
      expect(workbook.worksheets[0].columnCount).toBe(8);
      expect(workbook.worksheets[0].rowCount).toBe(1);
      expect(workbook.worksheets[0].getColumn(1).numFmt).toBe('@');
      expect(workbook.worksheets[0].getColumn(2).numFmt).toBe('@');
    }
  });
});
