export interface AdvisingRequirementProfile {
  failedCourses?: string[];
  academicWarnings?: number;
  approvedICCourseCompletions?: string[];
  semester?: string;
  isNewStudent: boolean;
}

export interface AdvisingRequirementRule {
  requiresAdvisor: boolean;
  requireForFailedCourses: boolean;
  requireForAcademicWarnings: boolean;
  academicWarningThreshold: number;
  requireForIncompleteCourses: boolean;
  requireForSummerRegistration: boolean;
  exemptNewStudentsFromGpaRule: boolean;
}

export type ConfiguredAdvisingReason =
  'low_gpa' | 'probation' | 'failed_courses' | 'summer_policy';

export function evaluateConfiguredAdvisingTriggers(
  profile: AdvisingRequirementProfile,
  rule: AdvisingRequirementRule,
): {
  requiresAdvisor: boolean;
  reason?: ConfiguredAdvisingReason;
  warnings: string[];
} {
  let requiresAdvisor =
    rule.requiresAdvisor &&
    !(rule.exemptNewStudentsFromGpaRule && profile.isNewStudent);
  let reason: ConfiguredAdvisingReason | undefined = requiresAdvisor
    ? 'low_gpa'
    : undefined;
  const warnings: string[] = requiresAdvisor
    ? ['The matching GPA registration rule requires academic advising.']
    : [];

  if (
    rule.requireForFailedCourses &&
    (profile.failedCourses?.length ?? 0) > 0
  ) {
    requiresAdvisor = true;
    reason = 'failed_courses';
    warnings.push('Failed courses require academic advising.');
  }

  if (
    rule.requireForAcademicWarnings &&
    (profile.academicWarnings ?? 0) >= rule.academicWarningThreshold
  ) {
    requiresAdvisor = true;
    reason = 'probation';
    warnings.push(
      `Academic advising is required from ${rule.academicWarningThreshold} academic warning(s).`,
    );
  }

  if (rule.requireForSummerRegistration && profile.semester === 'summer') {
    requiresAdvisor = true;
    reason = 'summer_policy';
    warnings.push('Summer registration requires academic advising.');
  }

  if (
    rule.requireForIncompleteCourses &&
    (profile.approvedICCourseCompletions?.length ?? 0) > 0
  ) {
    requiresAdvisor = true;
    reason = 'summer_policy';
    warnings.push('Approved IC completions may bypass summer limits.');
  }

  return { requiresAdvisor, reason, warnings };
}
