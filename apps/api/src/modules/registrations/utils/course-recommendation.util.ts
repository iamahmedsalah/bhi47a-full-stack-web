import type { CourseDocument } from '../../courses/schemas/course.schema';
import type { CourseLevel, Semester } from '@student-portal/shared';
import { RulesBasedRecommendationProvider } from '../recommendations/rules-based-recommendation.provider';
import { isCourseOfferedForTerm } from './term-availability.util';
import { coursesForDepartment } from '../../courses/utils/course-curriculum.util';

export interface RecommendationInput {
  courses: CourseDocument[];
  completedCourses: string[];
  failedCourses: string[];
  academicLevel: CourseLevel;
  semester: Semester;
  maxCreditHours: number;
  department?: string;
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
  department,
}: Omit<RecommendationInput, 'maxCreditHours'>): CourseDocument[] {
  const completed = new Set(normalizeCourseCodes(completedCourses));
  const failed = new Set(normalizeCourseCodes(failedCourses));

  return (department ? coursesForDepartment(courses, department) : courses)
    .filter((course) => {
      const code = course.code.toUpperCase();
      if (completed.has(code)) return false;
      if (!hasPassedPrerequisites(course, completed)) return false;
      const courseLevel = course.academicLevel ?? course.level;
      const offered = isCourseOfferedForTerm(course, semester);
      const inCurrentPlan = courseLevel === academicLevel && offered;
      return offered && (failed.has(code) || inCurrentPlan);
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
  return new RulesBasedRecommendationProvider()
    .generate(input)
    .filter(
      (recommendation) =>
        recommendation.isRecommendedForSemester &&
        recommendation.creditHours > 0,
    )
    .map((recommendation) => recommendation.courseCode);
}
