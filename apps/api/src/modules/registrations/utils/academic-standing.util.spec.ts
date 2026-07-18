import {
  isNewStudentWithoutAcademicHistory,
  requiresAcademicAdvisingForStanding,
} from './academic-standing.util';

describe('academic standing rules', () => {
  it('treats an imported first-term student with GPA 0 as having no GPA yet', () => {
    const profile = {
      gpa: 0,
      completedCourses: [],
      failedCourses: [],
      lowGradeCourses: [],
      academicWarnings: 0,
    };

    expect(isNewStudentWithoutAcademicHistory(profile)).toBe(true);
    expect(requiresAcademicAdvisingForStanding(profile)).toBe(false);
  });

  it('requires advising when a zero-GPA student has failed courses', () => {
    expect(
      requiresAcademicAdvisingForStanding({
        gpa: 0,
        completedCourses: [],
        failedCourses: ['BIS101'],
        academicWarnings: 1,
      }),
    ).toBe(true);
  });

  it('requires advising for an earned GPA below 2', () => {
    expect(
      requiresAcademicAdvisingForStanding({
        gpa: 1.75,
        completedCourses: ['BIS101'],
        failedCourses: [],
      }),
    ).toBe(true);
  });
});
