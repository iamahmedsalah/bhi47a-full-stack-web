import type { CourseDocument } from '../../courses/schemas/course.schema';
import type { CourseLevel, Semester } from '@student-portal/shared';

export interface RecommendationInput {
  courses: CourseDocument[];
  completedCourses: string[];
  failedCourses: string[];
  academicLevel: CourseLevel;
  semester: Semester;
  maxCreditHours: number;
}

export function normalizeCourseCodes(codes: string[] = []): string[] {
  return Array.from(
    new Set(
      codes
        .map((code) => code.trim().toUpperCase())
        .filter((code) => code.length > 0),
    ),
  );
}

export function hasPassedPrerequisites(
  course: Pick<CourseDocument, 'prerequisites'>,
  completedCourses: Set<string>,
): boolean {
  return (course.prerequisites ?? []).every((code) =>
    completedCourses.has(code.toUpperCase()),
  );
}

export function buildEligibleCourseList({
  courses,
  completedCourses,
  failedCourses,
  academicLevel,
  semester,
}: Omit<RecommendationInput, 'maxCreditHours'>): CourseDocument[] {
  const completed = new Set(normalizeCourseCodes(completedCourses));
  const failed = new Set(normalizeCourseCodes(failedCourses));

  return courses
    .filter((course) => {
      const code = course.code.toUpperCase();
      if (completed.has(code)) return false;
      if (!hasPassedPrerequisites(course, completed)) return false;
      const courseLevel = course.academicLevel ?? course.level;
      const inCurrentPlan =
        courseLevel === academicLevel && course.semester === semester;
      return failed.has(code) || inCurrentPlan;
    })
    .sort((a, b) => {
      const aFailed = failed.has(a.code.toUpperCase()) ? 0 : 1;
      const bFailed = failed.has(b.code.toUpperCase()) ? 0 : 1;
      if (aFailed !== bFailed) return aFailed - bFailed;

      const aRequired = a.type === 'required' ? 0 : 1;
      const bRequired = b.type === 'required' ? 0 : 1;
      if (aRequired !== bRequired) return aRequired - bRequired;

      return a.code.localeCompare(b.code);
    });
}

export function recommendCourses(input: RecommendationInput): string[] {
  let total = 0;
  const selected: string[] = [];

  for (const course of buildEligibleCourseList(input)) {
    const hours = course.creditHours ?? 0;
    if (hours <= 0) continue;
    if (total + hours > input.maxCreditHours) continue;
    selected.push(course.code.toUpperCase());
    total += hours;
  }

  return selected;
}
