import type { CourseDocument } from '../../courses/schemas/course.schema';
import { buildEligibleCourseList } from './course-recommendation.util';
import { isCourseOfferedForTerm } from './term-availability.util';

const course = (
  code: string,
  semester: 'first' | 'second' | 'summer',
  offeredTerms: Array<'first' | 'second' | 'summer'> = [],
): CourseDocument =>
  ({
    code,
    name: code,
    nameAr: code,
    nameEn: code,
    level: '2',
    academicLevel: '2',
    semester,
    offeredTerms,
    prerequisites: [],
    creditHours: 3,
    type: 'required',
    isActive: true,
    coRequisites: [],
    equivalentCourses: [],
    registrationPriority: 0,
  }) as unknown as CourseDocument;

describe('term-aware course availability', () => {
  it('keeps first and second semester offerings separate', () => {
    const courses = [
      course('FIRST201', 'first'),
      course('SECOND201', 'second'),
    ];
    expect(
      buildEligibleCourseList({
        courses,
        completedCourses: [],
        failedCourses: [],
        academicLevel: '2',
        semester: 'second',
      }).map(({ code }) => code),
    ).toEqual(['SECOND201']);
  });

  it('only offers a regular-semester course in summer when explicitly configured', () => {
    expect(isCourseOfferedForTerm(course('ACC101', 'first'), 'summer')).toBe(
      false,
    );
    expect(
      isCourseOfferedForTerm(
        course('ACC101', 'first', ['first', 'summer']),
        'summer',
      ),
    ).toBe(true);
  });

  it('allows a failed course only when it is offered in the active term', () => {
    const courses = [
      course('FAILED201', 'first'),
      course('FAILED202', 'second'),
    ];
    expect(
      buildEligibleCourseList({
        courses,
        completedCourses: [],
        failedCourses: ['FAILED201', 'FAILED202'],
        academicLevel: '2',
        semester: 'second',
      }).map(({ code }) => code),
    ).toEqual(['FAILED202']);
  });
});
