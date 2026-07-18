import { isConsecutiveAcademicYear } from './academic-year.util';

describe('academic year validation', () => {
  it('accepts consecutive academic years', () => {
    expect(isConsecutiveAcademicYear('2026-2027')).toBe(true);
  });

  it.each(['2026', '2026/2027', '2026-2028', 'year-2027'])(
    'rejects invalid academic year %s',
    (value) => {
      expect(isConsecutiveAcademicYear(value)).toBe(false);
    },
  );
});
