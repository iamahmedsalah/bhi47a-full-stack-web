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
      priority: 'HIGH',
    });
    expect(recommendation.reasonCodes).toContain('FAILED_PREVIOUSLY');
    expect(recommendation.explanation).toContain('previously failed');
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
      eligible: false,
      priority: 'BLOCKED',
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
});
