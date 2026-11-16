import { calculateGradeScale } from '@student-portal/shared';
import { normalizeCourseCodes } from './course-recommendation.util';

export interface CourseGradeRecord {
  academicYear?: string;
  semester?: string;
  retakePolicy?: 'latest' | 'best';
  officialResult?: {
    official: boolean;
    passed: boolean;
    percentage: number | null;
    gradePoints: number | null;
    letterGrade: string | null;
  };
  courseCode: string;
  examType: string;
  grade: number;
  maxGrade: number;
  status: string;
}

export function mergeAcademicCourseProgress(input: {
  completedCourses?: string[];
  failedCourses?: string[];
  lowGradeCourses?: string[];
  grades?: CourseGradeRecord[];
  courseCredits?: Record<string, number>;
}) {
  const completed = new Set(normalizeCourseCodes(input.completedCourses));
  const failed = new Set(normalizeCourseCodes(input.failedCourses));
  const lowGrade = new Set(normalizeCourseCodes(input.lowGradeCourses));
  const gradesByCourse = new Map<string, CourseGradeRecord[]>();
  const courseResults: Array<{
    courseCode: string;
    percentage: number;
    gradePoints: number;
    letterGrade: string;
    creditHours: number;
    passed: boolean;
  }> = [];

  let weightedGradePoints = 0;
  let gradedCredits = 0;

  // Never sum records from different terms into one attempt. Choose the best
  // complete attempt; IC/deferred attempts do not erase an existing result.
  const attempts = new Map<string, CourseGradeRecord[]>();
  for (const grade of input.grades ?? []) {
    const key = `${grade.courseCode.trim().toUpperCase()}|${grade.academicYear ?? ''}|${grade.semester ?? ''}`;
    attempts.set(key, [...(attempts.get(key) ?? []), grade]);
  }
  const candidates = new Map<string, CourseGradeRecord[][]>();
  for (const records of attempts.values()) {
    if (!records.some((r) => r.examType === 'final')) continue;
    if (
      records.some((r) =>
        ['incomplete', 'excused', 'withheld'].includes(r.status),
      ) &&
      !records.some((r) => r.officialResult?.official)
    )
      continue;
    const official = records.find((r) => r.officialResult?.official);
    const chosen = official ? [official] : records;
    const code = chosen[0].courseCode.trim().toUpperCase();
    candidates.set(code, [...(candidates.get(code) ?? []), chosen]);
  }
  const effective: CourseGradeRecord[] = [];
  const termOrder = (records: CourseGradeRecord[]) =>
    `${records[0].academicYear ?? ''}|${({ first: '1', second: '2', summer: '3' } as Record<string, string>)[records[0].semester ?? ''] ?? ''}`;
  for (const choices of candidates.values()) {
    // Improvement attempts may never regress the effective result, including legacy latest policies.
    choices.sort((a, b) => {
      const percentage = (rows: CourseGradeRecord[]) =>
        rows[0].officialResult?.percentage ??
        (rows.reduce((n, r) => n + (r.status === 'present' ? r.grade : 0), 0) /
          rows.reduce((n, r) => n + r.maxGrade, 0)) *
          100;
      return (
        percentage(b) - percentage(a) ||
        termOrder(a).localeCompare(termOrder(b))
      );
    });
    effective.push(...choices[0]);
  }
  for (const grade of effective) {
    const code = grade.courseCode.trim().toUpperCase();
    if (!code) continue;
    const records = gradesByCourse.get(code) ?? [];
    records.push(grade);
    gradesByCourse.set(code, records);
  }

  for (const [code, records] of gradesByCourse) {
    const finalRecords = records.filter(
      (record) => record.examType === 'final',
    );
    if (finalRecords.length === 0) continue;

    const blockedFinal = finalRecords.some(
      (record) => record.status === 'absent' || record.status === 'banned',
    );
    const totalMax = records.reduce(
      (total, record) => total + Math.max(0, record.maxGrade ?? 0),
      0,
    );
    const totalEarned = records.reduce(
      (total, record) =>
        total +
        (record.status === 'present' ? Math.max(0, record.grade ?? 0) : 0),
      0,
    );
    const official = finalRecords.find(
      (r) => r.officialResult?.official,
    )?.officialResult;
    const passed =
      official?.passed ??
      (!blockedFinal && totalMax > 0 && totalEarned / totalMax >= 0.5);
    const percentage =
      official?.percentage ??
      (totalMax > 0 ? (totalEarned / totalMax) * 100 : 0);
    const scale = calculateGradeScale(
      percentage,
      finalRecords.some((record) => record.status === 'banned')
        ? 'banned'
        : blockedFinal
          ? 'absent'
          : 'present',
    );
    const gradePoints = official?.gradePoints ?? scale.points;
    const letterGrade = official?.letterGrade ?? scale.letter;
    const creditHours = Math.max(0, input.courseCredits?.[code] ?? 1);
    weightedGradePoints += gradePoints * creditHours;
    gradedCredits += creditHours;
    courseResults.push({
      courseCode: code,
      percentage: Math.round(percentage * 100) / 100,
      gradePoints: Math.round(gradePoints * 100) / 100,
      letterGrade,
      creditHours,
      passed,
    });

    if (passed) {
      completed.add(code);
      failed.delete(code);
      lowGrade.delete(code);
    } else {
      failed.add(code);
      completed.delete(code);
      lowGrade.delete(code);
    }
  }

  return {
    completedCourses: [...completed].sort(),
    failedCourses: [...failed].sort(),
    lowGradeCourses: [...lowGrade].sort(),
    calculatedGpa:
      gradedCredits > 0
        ? Math.round((weightedGradePoints / gradedCredits) * 100) / 100
        : null,
    gradedCredits,
    courseResults: courseResults.sort((a, b) =>
      a.courseCode.localeCompare(b.courseCode),
    ),
  };
}
