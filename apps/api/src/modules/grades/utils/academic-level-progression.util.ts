import type { CourseLevel, Semester } from '@student-portal/shared';

const LEVELS: CourseLevel[] = ['1', '2', '3', '4'];

export interface ProgressionCourse {
  code: string;
  academicLevel?: CourseLevel;
  level?: CourseLevel;
  semester: Semester;
  type: string;
  isActive: boolean;
}

/**
 * Promotes a student after every mandatory course in both regular semesters
 * has a published final outcome. Failed courses are carried forward for
 * retake/advising and do not keep the student in the previous level. Summer
 * and elective courses do not block progression. The result is capped at 4.
 */
export function calculatePromotedAcademicLevel(input: {
  currentLevel: CourseLevel;
  courses: ProgressionCourse[];
  finalizedCourses: string[];
}): CourseLevel {
  const finalized = new Set(
    input.finalizedCourses.map((code) => code.trim().toUpperCase()),
  );
  let levelIndex = LEVELS.indexOf(input.currentLevel);
  if (levelIndex < 0) levelIndex = 0;

  while (levelIndex < LEVELS.length - 1) {
    const level = LEVELS[levelIndex];
    const mandatory = input.courses.filter(
      (course) =>
        course.isActive &&
        (course.academicLevel ?? course.level) === level &&
        (course.semester === 'first' || course.semester === 'second') &&
        course.type !== 'elective',
    );
    const firstCourses = mandatory.filter(
      (course) => course.semester === 'first',
    );
    const secondCourses = mandatory.filter(
      (course) => course.semester === 'second',
    );

    // Missing curriculum data must never promote a student accidentally.
    if (firstCourses.length === 0 || secondCourses.length === 0) break;
    if (!mandatory.every((course) => finalized.has(course.code.toUpperCase())))
      break;
    levelIndex += 1;
  }

  return LEVELS[levelIndex];
}
