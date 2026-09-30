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

export type PromotionReasonCode =
  | 'PROMOTED_ALL_PASSED'
  | 'PROMOTED_WITH_CARRIED_COURSES'
  | 'RETAINED_EXCEEDED_FAILED_COURSES'
  | 'RETAINED_INCOMPLETE_CURRICULUM'
  | 'MAX_LEVEL_REACHED';

export interface PromotionEvaluation {
  currentLevel: CourseLevel;
  promotedLevel: CourseLevel;
  willPromote: boolean;
  reasonCode: PromotionReasonCode;
  reasonAr: string;
  reasonEn: string;
  carriedFailedCourses: string[];
  missingMandatoryCourses: string[];
}

/**
 * Evaluates academic progression for a student based on:
 * 1. Completeness of mandatory courses in both regular semesters (first & second).
 * 2. Carried failed courses rule (must not exceed maxAllowedCarriedCourses, default: 2).
 * 3. Level index bounds (caps at 4).
 */
export function evaluateAcademicProgression(input: {
  currentLevel: CourseLevel;
  courses: ProgressionCourse[];
  finalizedCourses: string[];
  failedCourses?: string[];
  maxAllowedCarriedCourses?: number;
}): PromotionEvaluation {
  const maxAllowedCarried = input.maxAllowedCarriedCourses ?? 2;
  const finalized = new Set(
    input.finalizedCourses.map((code) => code.trim().toUpperCase()),
  );
  const failedSet = new Set(
    (input.failedCourses ?? []).map((code) => code.trim().toUpperCase()),
  );

  let levelIndex = LEVELS.indexOf(input.currentLevel);
  if (levelIndex < 0) levelIndex = 0;

  if (levelIndex >= LEVELS.length - 1) {
    return {
      currentLevel: input.currentLevel,
      promotedLevel: input.currentLevel,
      willPromote: false,
      reasonCode: 'MAX_LEVEL_REACHED',
      reasonAr: 'الطالب في المستوى الرابع (المستوى النهائي / تخرج)',
      reasonEn: 'Student is at Level 4 (Final senior level)',
      carriedFailedCourses: [],
      missingMandatoryCourses: [],
    };
  }

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

  // Check 1: Mandatory courses must exist for both semesters
  if (firstCourses.length === 0 || secondCourses.length === 0) {
    return {
      currentLevel: input.currentLevel,
      promotedLevel: input.currentLevel,
      willPromote: false,
      reasonCode: 'RETAINED_INCOMPLETE_CURRICULUM',
      reasonAr: 'المقررات الإجبارية للفصلين غير مكتملة في اللائحة',
      reasonEn: 'Curriculum requirements incomplete for both regular semesters',
      carriedFailedCourses: [],
      missingMandatoryCourses: [],
    };
  }

  // Check 2: Check for missing finalized grades
  const missing = mandatory
    .filter((course) => !finalized.has(course.code.toUpperCase()))
    .map((course) => course.code);

  if (missing.length > 0) {
    return {
      currentLevel: input.currentLevel,
      promotedLevel: input.currentLevel,
      willPromote: false,
      reasonCode: 'RETAINED_INCOMPLETE_CURRICULUM',
      reasonAr: `باقٍ في مستواه لعدم استكمال نتائج جميع المقررات الإجبارية (${missing.length} مقرر: ${missing.join(', ')})`,
      reasonEn: `Retained in Level ${level}: missing final results for ${missing.length} mandatory course(s): ${missing.join(', ')}`,
      carriedFailedCourses: [],
      missingMandatoryCourses: missing,
    };
  }

  // Check 3: Check failed/carried courses in current level and overall
  const mandatoryCodes = new Set(
    mandatory.map((c) => c.code.toUpperCase()),
  );
  const levelFailedCourses = [...failedSet].filter((code) =>
    mandatoryCodes.has(code),
  );

  // If failed courses exceed the max allowed limit (e.g. > 2)
  if (levelFailedCourses.length > maxAllowedCarried) {
    return {
      currentLevel: input.currentLevel,
      promotedLevel: input.currentLevel,
      willPromote: false,
      reasonCode: 'RETAINED_EXCEEDED_FAILED_COURSES',
      reasonAr: `باقٍ في مستواه لتجاوز الحد الأقصى لمواد الرسوب (${levelFailedCourses.length} مواد رسوب: ${levelFailedCourses.join(', ')} - الحد المسموح: ${maxAllowedCarried})`,
      reasonEn: `Retained in Level ${level}: exceeded allowed failed courses (${levelFailedCourses.length} failed: ${levelFailedCourses.join(', ')} - max allowed is ${maxAllowedCarried})`,
      carriedFailedCourses: levelFailedCourses,
      missingMandatoryCourses: [],
    };
  }

  // Eligible for promotion!
  const nextLevel = LEVELS[levelIndex + 1];

  if (levelFailedCourses.length === 0) {
    return {
      currentLevel: input.currentLevel,
      promotedLevel: nextLevel,
      willPromote: true,
      reasonCode: 'PROMOTED_ALL_PASSED',
      reasonAr: `ناجح ومنقول إلى المستوى ${nextLevel} لاجتياز جميع المقررات الإجبارية بنجاح`,
      reasonEn: `Promoted to Level ${nextLevel}: passed all mandatory courses successfully`,
      carriedFailedCourses: [],
      missingMandatoryCourses: [],
    };
  }

  return {
    currentLevel: input.currentLevel,
    promotedLevel: nextLevel,
    willPromote: true,
    reasonCode: 'PROMOTED_WITH_CARRIED_COURSES',
    reasonAr: `منقول إلى المستوى ${nextLevel} بمواد تخلف (${levelFailedCourses.length} مقرر رسوب: ${levelFailedCourses.join(', ')} - ضمن الحد المسموح به)`,
    reasonEn: `Promoted to Level ${nextLevel} with carried courses (${levelFailedCourses.length} failed: ${levelFailedCourses.join(', ')} - within allowed limit)`,
    carriedFailedCourses: levelFailedCourses,
    missingMandatoryCourses: [],
  };
}

/**
 * Backward-compatible helper returning the promoted CourseLevel.
 */
export function calculatePromotedAcademicLevel(input: {
  currentLevel: CourseLevel;
  courses: ProgressionCourse[];
  finalizedCourses: string[];
  failedCourses?: string[];
  maxAllowedCarriedCourses?: number;
}): CourseLevel {
  const result = evaluateAcademicProgression(input);
  return result.promotedLevel;
}
