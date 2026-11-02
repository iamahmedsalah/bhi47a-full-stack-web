import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsExportQueryDto } from './analytics-query.dto';

describe('analytics export query validation', () => {
  it('accepts omitted sheets for the complete workbook and parses a selected list', async () => {
    expect(
      await validate(plainToInstance(AnalyticsExportQueryDto, {})),
    ).toEqual([]);
    const dto = plainToInstance(AnalyticsExportQueryDto, {
      sheets: 'students, enrollment',
      academicYear: '2027-2028',
      department: 'ACC',
      level: '3',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.sheets).toEqual(['students', 'enrollment']);
    expect(dto.department).toBe('ACCOUNTING');
  });
  it.each([
    { sheets: '' },
    { sheets: [] },
    { sheets: 'private-data' },
    { sheets: ['students', 'students'] },
    { sheets: Array(13).fill('students') },
    { sheets: [['students']] },
    { department: 'unknown' },
    { level: '5' },
    { academicYear: '2026-2026' },
  ])('rejects invalid export parameters %j', async (query) => {
    expect(
      (await validate(plainToInstance(AnalyticsExportQueryDto, query))).length,
    ).toBeGreaterThan(0);
  });
});
