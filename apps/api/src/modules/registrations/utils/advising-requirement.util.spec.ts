import { evaluateConfiguredAdvisingTriggers } from './advising-requirement.util';

const rule = {
  requiresAdvisor: true,
  requireForFailedCourses: true,
  requireForAcademicWarnings: true,
  academicWarningThreshold: 2,
  requireForIncompleteCourses: true,
  requireForSummerRegistration: false,
  exemptNewStudentsFromGpaRule: true,
};

describe('evaluateConfiguredAdvisingTriggers', () => {
  it('exempts a new student from only the GPA trigger', () => {
    expect(
      evaluateConfiguredAdvisingTriggers({ isNewStudent: true }, rule)
        .requiresAdvisor,
    ).toBe(false);
  });

  it('requires advising for failed courses when enabled', () => {
    const result = evaluateConfiguredAdvisingTriggers(
      { isNewStudent: false, failedCourses: ['ACC101'] },
      { ...rule, requiresAdvisor: false },
    );
    expect(result.requiresAdvisor).toBe(true);
    expect(result.reason).toBe('failed_courses');
  });

  it('respects the configured academic warning threshold', () => {
    expect(
      evaluateConfiguredAdvisingTriggers(
        { isNewStudent: false, academicWarnings: 1 },
        { ...rule, requiresAdvisor: false },
      ).requiresAdvisor,
    ).toBe(false);
    expect(
      evaluateConfiguredAdvisingTriggers(
        { isNewStudent: false, academicWarnings: 2 },
        { ...rule, requiresAdvisor: false },
      ).requiresAdvisor,
    ).toBe(true);
  });

  it('does not apply a disabled failed-course trigger', () => {
    expect(
      evaluateConfiguredAdvisingTriggers(
        { isNewStudent: false, failedCourses: ['ACC101'] },
        {
          ...rule,
          requiresAdvisor: false,
          requireForFailedCourses: false,
        },
      ).requiresAdvisor,
    ).toBe(false);
  });
});
