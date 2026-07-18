import { normalizeCourseCodes } from './course-recommendation.util';

export interface CourseGradeRecord {
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
    creditHours: number;
    passed: boolean;
  }> = [];
  let weightedGradePoints = 0;
  let gradedCredits = 0;

  for (const grade of input.grades ?? []) {
    const code = grade.courseCode.trim().toUpperCase();
    if (!code) continue;
    const records = gradesByCourse.get(code) ?? [];
    records.push(grade);
    gradesByCourse.set(code, records);
  }

  for (const [code, records] of gradesByCourse) {
    const finalRecords = records.filter((record) => record.examType === 'final');
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
        total + (record.status === 'present' ? Math.max(0, record.grade ?? 0) : 0),
      0,
    );
    const passed = !blockedFinal && totalMax > 0 && totalEarned / totalMax >= 0.5;
    const percentage = totalMax > 0 ? (totalEarned / totalMax) * 100 : 0;
    const gradePoints = Math.min(4, Math.max(0, percentage / 25));
    const creditHours = Math.max(0, input.courseCredits?.[code] ?? 1);
    weightedGradePoints += gradePoints * creditHours;
    gradedCredits += creditHours;
    courseResults.push({
      courseCode: code,
      percentage: Math.round(percentage * 100) / 100,
      gradePoints: Math.round(gradePoints * 100) / 100,
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
