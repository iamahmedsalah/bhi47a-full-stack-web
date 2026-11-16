import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS, calculateGradeScale } from '@student-portal/shared';
import {
  compareAttempts,
  summarizeAttempt,
  type CourseAttempt,
} from './utils/attempt-comparison.util';
import { mergeAcademicCourseProgress } from '../registrations/utils/academic-course-progress.util';
import { ControlAttemptsService } from './services/control-attempts.service';
import { ControlAccessService } from './services/control-access.service';

function attempt(
  year: string,
  scores: [number, number, number],
  finalStatus = 'present',
): CourseAttempt {
  return {
    academicYear: year,
    semester: 'first',
    marks: (['coursework', 'midterm', 'final'] as const).map(
      (component, index) => ({
        id: `${year}-${component}`,
        component,
        grade: scores[index],
        maxGrade: [20, 30, 50][index],
        status: index === 2 ? finalStatus : 'present',
        rev: 1,
      }),
    ),
  };
}
describe('whole-course attempt comparison', () => {
  it('accepts a higher whole attempt even when one component is lower; never mixes components', () => {
    const result = compareAttempts(
      attempt('2024-2025', [20, 10, 40]),
      attempt('2025-2026', [10, 30, 40]),
    );
    expect(result.canAcceptNew).toBe(true);
    expect(result.current.result.total).toBe(80);
    expect(result.previous.result.total).toBe(70);
  });
  it('keeps old grades for lower, equal or incomplete new outcomes', () => {
    const previous = attempt('2024-2025', [20, 25, 45]);
    expect(
      compareAttempts(previous, attempt('2025-2026', [10, 15, 20]))
        .recommendation,
    ).toBe('keep_previous');
    expect(
      compareAttempts(previous, attempt('2025-2026', [20, 25, 45]))
        .recommendation,
    ).toBe('keep_previous');
    expect(
      compareAttempts(previous, attempt('2025-2026', [20, 25, 0], 'incomplete'))
        .recommendation,
    ).toBe('keep_previous');
  });
  it('keeps the higher percentage even when it is FX and the new lower attempt passes', () => {
    const previous = attempt('2024-2025', [20, 30, 0], 'banned');
    const next = attempt('2025-2026', [10, 10, 25]);
    next.policy = {
      passPercentage: 40,
      finalMinimumPercentage: 0,
      retake: 'best',
    };
    const comparison = compareAttempts(previous, next);
    expect(comparison.previous.result.letterGrade).toBe('FX');
    expect(comparison.current.result.passed).toBe(true);
    expect(comparison.canAcceptNew).toBe(false);
  });
  it('compares percentages rather than raw scores when maximums differ', () => {
    const previous = attempt('2024-2025', [20, 20, 40]);
    const next = attempt('2025-2026', [15, 15, 35]);
    next.marks[1].maxGrade = 20;
    next.marks[2].maxGrade = 40;
    expect(compareAttempts(previous, next).current.result.percentage).toBe(
      81.25,
    );
    expect(compareAttempts(previous, next).canAcceptNew).toBe(true);
  });
  it('preserves IC coursework and midterm without inventing a numeric final outcome', () => {
    const original = attempt('2024-2025', [17, 25, 0], 'incomplete');
    const before = structuredClone(original);
    const result = summarizeAttempt(original);
    expect(result.result).toMatchObject({
      incomplete: true,
      official: false,
      percentage: null,
      letterGrade: 'IC',
    });
    expect(original).toEqual(before);
    expect(original.marks.slice(0, 2).map((mark) => mark.grade)).toEqual([
      17, 25,
    ]);
  });
  it('changes the review fingerprint when a source mark or its revision changes', () => {
    const old = attempt('2024-2025', [17, 25, 40]),
      next = attempt('2025-2026', [17, 25, 45]);
    const digest = compareAttempts(old, next).fingerprint;
    old.marks[2].rev++;
    expect(compareAttempts(old, next).fingerprint).not.toBe(digest);
  });
  it('protects GPA against lower latest attempts and unfinished IC attempts without double-counting credits', () => {
    const rows = [
      attempt('2024-2025', [20, 25, 45]),
      attempt('2025-2026', [10, 20, 10]),
      attempt('2026-2027', [17, 25, 0], 'incomplete'),
    ].flatMap((entry) =>
      entry.marks.map((mark) => ({
        academicYear: entry.academicYear,
        semester: entry.semester,
        courseCode: '111',
        examType: mark.component,
        grade: mark.grade,
        maxGrade: mark.maxGrade,
        status: mark.status,
        retakePolicy: 'latest' as const,
      })),
    );
    const result = mergeAcademicCourseProgress({
      grades: rows,
      courseCredits: { '111': 3 },
    });
    expect(result.courseResults).toHaveLength(1);
    expect(result.courseResults[0].percentage).toBe(90);
    expect(result.gradedCredits).toBe(3);
    expect(result.calculatedGpa).toBe(
      calculateGradeScale(90, 'present').points,
    );
  });
  it('keeps the older whole attempt and its FX on equal percentages', () => {
    const grades = [
      attempt('2024-2025', [20, 30, 0], 'banned'),
      attempt('2025-2026', [10, 10, 30]),
    ].flatMap((entry) =>
      entry.marks.map((mark) => ({
        academicYear: entry.academicYear,
        semester: entry.semester,
        courseCode: '111',
        examType: mark.component,
        grade: mark.grade,
        maxGrade: mark.maxGrade,
        status: mark.status,
      })),
    );
    const progress = mergeAcademicCourseProgress({
      grades,
      courseCredits: { '111': 3 },
    });
    expect(progress.courseResults[0]).toMatchObject({
      percentage: 50,
      letterGrade: 'FX',
      passed: false,
    });
    expect(progress.gradedCredits).toBe(3);
  });
  it('does not expose historical comparisons or carry marks to an entry-only staff member', async () => {
    const access = new ControlAccessService({} as never, {} as never);
    const user = {
      _id: String(new Types.ObjectId()),
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
    } as never;
    const scopes = { requireSheetInScope: jest.fn() };
    const service = new ControlAttemptsService(
      {} as never,
      access,
      scopes as never,
      {} as never,
    );
    await expect(
      service.preview(user, String(new Types.ObjectId()), 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.carry(
        user,
        String(new Types.ObjectId()),
        String(new Types.ObjectId()),
        '0'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopes.requireSheetInScope).not.toHaveBeenCalled();
  });
});
