import type { CourseDocument } from '../../courses/schemas/course.schema';
import { RulesBasedRecommendationProvider } from './rules-based-recommendation.provider';

const course = (
  code: string,
  options: Partial<CourseDocument> = {},
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
    prerequisites: [],
    creditHours: 3,
    type: 'required',
    isActive: true,
    ...options,
  }) as CourseDocument;

describe('RulesBasedRecommendationProvider', () => {
  const provider = new RulesBasedRecommendationProvider();

  it('explains and prioritizes a previously failed course', () => {
    const [recommendation] = provider.generate({
      courses: [course('ACC201')],
      completedCourses: [],
      failedCourses: ['ACC201'],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 6,
    });

    expect(recommendation).toMatchObject({
      courseCode: 'ACC201',
      eligible: true,
      score: 100,
      priority: 'HIGH',
      isRecommendedForSemester: true,
    });
    expect(recommendation.reasonCodes).toContain('FAILED_PREVIOUSLY');
    expect(recommendation.explanation).toContain('previously failed');
  });

  it('keeps a failed prerequisite course ahead of new courses it unlocks', () => {
    const recommendations = provider.generate({
      courses: [
        course('NEW201'),
        course('FAIL201'),
        course('NEXT301', {
          academicLevel: '3',
          level: '3',
          prerequisites: ['FAIL201'],
        }),
      ],
      completedCourses: [],
      failedCourses: ['FAIL201'],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 6,
    });

    expect(recommendations[0]).toMatchObject({
      courseCode: 'FAIL201',
      score: 100,
      isRecommendedForSemester: true,
    });
    expect(recommendations[0].reasonCodes).toContain('UNLOCKS_FUTURE_COURSES');
    expect(recommendations[1]).toMatchObject({
      courseCode: 'NEW201',
      isRecommendedForSemester: true,
    });
  });

  it('returns blocked recommendations with prerequisite evidence', () => {
    const [recommendation] = provider.generate({
      courses: [course('FIN301', { prerequisites: ['ACC201'] })],
      completedCourses: [],
      failedCourses: [],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 6,
    });

    expect(recommendation.eligible).toBe(false);
    expect(recommendation.priority).toBe('BLOCKED');
    expect(recommendation.prerequisiteEvaluation.missing).toEqual(['ACC201']);
    expect(recommendation.blockedReasons[0]).toContain('ACC201');
  });

  it('allocates the credit cap in score order', () => {
    const recommendations = provider.generate({
      courses: [course('NEW201'), course('FAIL201')],
      completedCourses: [],
      failedCourses: ['FAIL201'],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 3,
    });

    expect(
      recommendations.find(({ courseCode }) => courseCode === 'FAIL201')
        ?.eligible,
    ).toBe(true);
    expect(
      recommendations.find(({ courseCode }) => courseCode === 'NEW201'),
    ).toMatchObject({
      eligible: true,
      isRecommendedForSemester: false,
    });
  });

  it('never recommends passed or in-progress courses again', () => {
    const recommendations = provider.generate({
      courses: [course('PASSED201'), course('ACTIVE201')],
      completedCourses: ['PASSED201'],
      failedCourses: [],
      inProgressCourses: ['ACTIVE201'],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 6,
    });

    expect(recommendations.every(({ eligible }) => !eligible)).toBe(true);
    expect(recommendations.flatMap(({ reasonCodes }) => reasonCodes)).toEqual(
      expect.arrayContaining(['ALREADY_PASSED', 'ALREADY_IN_PROGRESS']),
    );
  });

  it('flags only top eligible courses within the semester credit cap', () => {
    const recommendations = provider.generate({
      courses: [course('A201'), course('B201'), course('C201')],
      completedCourses: [],
      failedCourses: [],
      academicLevel: '2',
      semester: 'first',
      maxCreditHours: 6,
    });

    expect(
      recommendations.filter(
        ({ isRecommendedForSemester }) => isRecommendedForSemester,
      ),
    ).toHaveLength(2);
    expect(
      recommendations
        .filter(({ isRecommendedForSemester }) => isRecommendedForSemester)
        .reduce(
          (total, recommendation) => total + recommendation.creditHours,
          0,
        ),
    ).toBe(6);
  });

  it('prioritizes failed blocker courses first, then available courses in the same level and semester', () => {
    const recommendations = provider.generate({
      courses: [
        course('FUTURE301', {
          academicLevel: '3',
          level: '3',
          semester: 'first',
          offeredTerms: ['first'],
        }),
        course('CURRENT201', {
          academicLevel: '2',
          level: '2',
          semester: 'second',
          offeredTerms: ['second'],
        }),
        course('FAIL_BLOCKER', {
          academicLevel: '1',
          level: '1',
          semester: 'first',
          offeredTerms: ['first', 'second'],
        }),
        course('OTHER_L3', {
          academicLevel: '3',
          level: '3',
          semester: 'second',
          offeredTerms: ['second'],
          prerequisites: ['FAIL_BLOCKER'],
        }),
      ],
      completedCourses: [],
      failedCourses: ['FAIL_BLOCKER'],
      academicLevel: '2',
      semester: 'second',
      maxCreditHours: 6,
    });

    expect(recommendations[0].courseCode).toBe('FAIL_BLOCKER');
    expect(recommendations[0].isRecommendedForSemester).toBe(true);

    expect(recommendations[1].courseCode).toBe('CURRENT201');
    expect(recommendations[1].isRecommendedForSemester).toBe(true);
  });

  it('blocks a failed course that is not offered in the active semester', () => {
    const recommendations = provider.generate({
      courses: [
        course('FAILED_FIRST', {
          semester: 'first',
          offeredTerms: ['first'],
        }),
        course('OPEN_SECOND', {
          semester: 'second',
          offeredTerms: ['second'],
        }),
      ],
      completedCourses: [],
      failedCourses: ['FAILED_FIRST'],
      academicLevel: '2',
      semester: 'second',
      maxCreditHours: 3,
    });

    expect(
      recommendations.find(({ courseCode }) => courseCode === 'FAILED_FIRST'),
    ).toMatchObject({
      eligible: false,
      isRecommendedForSemester: false,
      schedulingEvaluation: { offered: false },
    });
    expect(
      recommendations.find(({ courseCode }) => courseCode === 'FAILED_FIRST')
        ?.reasonCodes,
    ).toContain('NOT_OFFERED_THIS_SEMESTER');
    expect(
      recommendations.find(({ courseCode }) => courseCode === 'OPEN_SECOND'),
    ).toMatchObject({
      eligible: true,
      isRecommendedForSemester: true,
    });
    expect(recommendations[0].courseCode).toBe('OPEN_SECOND');
  });
});
