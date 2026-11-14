import {
  DEFAULT_CONTROL_COMPONENTS,
  calculateGradeScale,
} from '@student-portal/shared';
import {
  DEFAULT_RESULT_POLICY,
  evaluateOfficialResult,
} from './utils/official-result.util';
import { mergeAcademicCourseProgress } from '../registrations/utils/academic-course-progress.util';

const components = DEFAULT_CONTROL_COMPONENTS.map((c) => ({
  ...c,
  enabled: true,
}));
const marks = {
  coursework: { score: 17, status: 'present' },
  midterm: { score: 15, status: 'present' },
  final: { score: 48, status: 'present' },
};
describe('Official Control course results', () => {
  it('can release an explicit IC status without a numeric outcome or GPA points', () => {
    const result = evaluateOfficialResult(
      components,
      {
        ...marks,
        final: { score: null, status: 'incomplete' },
      },
      DEFAULT_RESULT_POLICY,
    );
    expect(result).toMatchObject({
      official: false,
      incomplete: true,
      total: null,
      gradePoints: null,
      letterGrade: 'IC',
    });
    const missing = evaluateOfficialResult(
      components,
      {
        final: { score: null, status: 'incomplete' },
      },
      DEFAULT_RESULT_POLICY,
    );
    expect(missing.incomplete).toBe(false);
  });
  it.each([
    ['banned', 'FX'],
    ['incomplete', 'IC'],
    ['absent', 'F'],
    ['present', 'F'],
  ])('classifies %s as %s without passing credit', (status, letter) => {
    expect(calculateGradeScale(20, status)).toMatchObject({
      letter,
      points: 0,
      isPass: false,
    });
  });
  it.each(['absent', 'banned'])(
    'keeps coursework and midterm contributions when the final is %s',
    (status) => {
      const result = evaluateOfficialResult(
        components,
        {
          ...marks,
          final: { status, score: null },
        },
        DEFAULT_RESULT_POLICY,
      );
      expect(result).toMatchObject({
        official: true,
        total: 32,
        totalMax: 100,
        passed: false,
        gradePoints: 0,
        letterGrade: status === 'banned' ? 'FX' : 'F',
      });
      expect(
        result.components.find((item) => item.key === 'midterm')?.value,
      ).toBe(15);
      expect(
        result.components.find((item) => item.key === 'coursework')?.value,
      ).toBe(17);
    },
  );
  it('keeps an absent midterm independent from a present final', () => {
    const entries = {
      ...marks,
      midterm: { score: null, status: 'absent' },
      final: { score: 60, status: 'present' },
    };
    expect(
      evaluateOfficialResult(components, entries, DEFAULT_RESULT_POLICY),
    ).toMatchObject({ official: true, total: 77, passed: true });
    expect(entries.midterm.status).toBe('absent');
    expect(entries.final.status).toBe('present');
  });
  it('calculates 17 + 15 + 48 exactly once as 80/100', () => {
    expect(
      evaluateOfficialResult(components, marks, DEFAULT_RESULT_POLICY),
    ).toMatchObject({
      official: true,
      total: 80,
      totalMax: 100,
      passed: true,
      percentage: 80,
    });
  });
  it.each(['excused', 'incomplete', 'withheld'])(
    'does not publish a numeric official result with %s',
    (status) => {
      expect(
        evaluateOfficialResult(
          components,
          { ...marks, final: { score: 48, status } },
          DEFAULT_RESULT_POLICY,
        ).official,
      ).toBe(false);
    },
  );
  it('fails an absent final regardless of the other contributions', () => {
    expect(
      evaluateOfficialResult(
        components,
        { ...marks, final: { score: 0, status: 'absent' } },
        DEFAULT_RESULT_POLICY,
      ),
    ).toMatchObject({ official: true, passed: false, gradePoints: 0 });
  });
  it('uses the configured final minimum and pass threshold', () => {
    expect(
      evaluateOfficialResult(components, marks, {
        ...DEFAULT_RESULT_POLICY,
        finalMinimumPercentage: 85,
      }).passed,
    ).toBe(false);
    expect(
      evaluateOfficialResult(components, marks, {
        ...DEFAULT_RESULT_POLICY,
        passPercentage: 81,
      }).passed,
    ).toBe(false);
  });
  const attempt = (
    academicYear: string,
    grade: number,
    semester = 'first',
  ) => ({
    courseCode: 'CS101',
    examType: 'final',
    academicYear,
    semester,
    grade,
    maxGrade: 100,
    status: 'present',
  });
  it('replaces an older passing attempt with the latest failed attempt without combining marks', () => {
    const result = mergeAcademicCourseProgress({
      completedCourses: ['CS101'],
      grades: [attempt('2025-2026', 90), attempt('2026-2027', 20)],
      courseCredits: { CS101: 3 },
    });
    expect(result).toMatchObject({
      completedCourses: [],
      failedCourses: ['CS101'],
      gradedCredits: 3,
      calculatedGpa: 0,
    });
    expect(result.courseResults).toHaveLength(1);
  });
  it('selects best when the latest approved policy requests it', () => {
    expect(
      mergeAcademicCourseProgress({
        grades: [
          attempt('2025-2026', 90),
          { ...attempt('2026-2027', 20), retakePolicy: 'best' },
        ],
      }).completedCourses,
    ).toEqual(['CS101']);
  });
  it('does not let a newer midterm replace a finalized prior attempt', () => {
    expect(
      mergeAcademicCourseProgress({
        grades: [
          attempt('2025-2026', 90),
          { ...attempt('2026-2027', 10), examType: 'midterm' },
        ],
      }).courseResults[0].percentage,
    ).toBe(90);
  });
  it('uses the official course result instead of summing the components a second time', () => {
    const result = evaluateOfficialResult(
      components,
      marks,
      DEFAULT_RESULT_POLICY,
    );
    const progress = mergeAcademicCourseProgress({
      grades: [
        { ...attempt('2026-2027', 80), officialResult: result },
        { ...attempt('2026-2027', 15), examType: 'midterm', maxGrade: 20 },
      ],
    });
    expect(progress.courseResults[0].percentage).toBe(80);
  });
});
