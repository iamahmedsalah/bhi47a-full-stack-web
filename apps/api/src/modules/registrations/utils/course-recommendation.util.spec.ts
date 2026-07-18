import {
  buildEligibleCourseList,
  hasPassedPrerequisites,
  normalizeCourseCodes,
  recommendCourses,
} from './course-recommendation.util';
import type { CourseDocument } from '../../courses/schemas/course.schema';

const course = (
  code: string,
  prerequisites: string[] = [],
  creditHours = 3,
): CourseDocument =>
  ({
    code,
    name: code,
    nameAr: code,
    nameEn: code,
    level: '2',
    academicLevel: '2',
    semester: 'first',
    offeredTerms: ['first'],
    prerequisites,
    creditHours,
    type: 'required',
    isActive: true,
  }) as CourseDocument;

describe('summer course recommendations', () => {
  it('normalizes duplicate course codes', () => {
    expect(normalizeCourseCodes([' eco101 ', 'ECO101', 'acc101'])).toEqual([
      'ECO101',
      'ACC101',
    ]);
  });

  it('blocks a course until every prerequisite is passed', () => {
    expect(
      hasPassedPrerequisites(
        course('BUS302', ['MKT201', 'FIN301']),
        new Set(['MKT201']),
      ),
    ).toBe(false);
  });

  it('prioritizes a failed course before a new course', () => {
    const courses = [course('NEW201'), course('FAIL201')];
    const eligible = buildEligibleCourseList({
      courses,
      completedCourses: [],
      failedCourses: ['FAIL201'],
      academicLevel: '2',
      semester: 'first',
    });
    expect(eligible.map(({ code }) => code)).toEqual(['FAIL201', 'NEW201']);
  });

  it('keeps the recommendation within the configured credit cap', () => {
    expect(
      recommendCourses({
        courses: [course('FAIL201', [], 3), course('NEW201', [], 3)],
        completedCourses: [],
        failedCourses: ['FAIL201'],
        academicLevel: '2',
        semester: 'first',
        maxCreditHours: 3,
      }),
    ).toEqual(['FAIL201']);
  });
});
