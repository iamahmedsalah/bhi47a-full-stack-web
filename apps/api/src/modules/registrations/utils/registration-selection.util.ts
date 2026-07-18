import type { Semester } from '@student-portal/shared';

export interface RegistrationSelectionLimits {
  minCreditHours: number;
  maxCreditHours: number;
  minCourses: number;
  maxCourses: number;
}

export function getRegistrationSelectionLimits(
  semester: Semester,
  summerCourseLimit = 2,
): RegistrationSelectionLimits {
  if (semester === 'summer') {
    return {
      minCreditHours: 0,
      maxCreditHours: 18,
      minCourses: 2,
      maxCourses: Math.max(2, Math.min(3, summerCourseLimit)),
    };
  }

  return {
    minCreditHours: 12,
    maxCreditHours: 18,
    minCourses: 4,
    maxCourses: 6,
  };
}
