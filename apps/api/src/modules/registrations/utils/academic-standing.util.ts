export interface AcademicStandingInput {
  gpa: number;
  completedCourses?: string[];
  failedCourses?: string[];
  lowGradeCourses?: string[];
  academicWarnings?: number;
}

/**
 * A zero GPA is the import/default value for students who have not completed
 * their first term. It must not be interpreted as an earned, failing GPA.
 */
export function isNewStudentWithoutAcademicHistory(
  profile: AcademicStandingInput,
): boolean {
  return (
    profile.gpa === 0 &&
    (profile.completedCourses?.length ?? 0) === 0 &&
    (profile.failedCourses?.length ?? 0) === 0 &&
    (profile.lowGradeCourses?.length ?? 0) === 0 &&
    (profile.academicWarnings ?? 0) === 0
  );
}

export function requiresAcademicAdvisingForStanding(
  profile: AcademicStandingInput,
): boolean {
  if ((profile.failedCourses?.length ?? 0) > 0) return true;
  return profile.gpa < 2 && !isNewStudentWithoutAcademicHistory(profile);
}
