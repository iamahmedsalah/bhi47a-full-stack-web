import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RegistrationsService } from './registrations.service';

function harness() {
  const course = {
    code: 'TEST',
    level: '3',
    academicLevel: '3',
    creditHours: 3,
    prerequisites: [] as string[],
  };
  const args = Array.from(
    { length: 12 },
    () => ({}),
  ) as unknown as ConstructorParameters<typeof RegistrationsService>;
  args[4] = {
    find: jest.fn().mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve(
            Array.from({ length: 7 }, () => ({ creditHours: 3 })),
          ),
      }),
    }),
  } as never;
  const service = new RegistrationsService(...args);
  const getAcademicProfile = jest
    .fn()
    .mockResolvedValue({ completedCourses: [], academicLevel: '3', gpa: 3 });
  Object.assign(service, {
    getAcademicProfile,
    getRuleForGpa: jest
      .fn()
      .mockResolvedValue({ maxCourses: 6, maxCreditHours: 18 }),
  });
  return {
    service,
    getAcademicProfile,
    course,
    codes: ['1', '2', '3', '4', '5', '6'],
    studentId: new Types.ObjectId().toHexString(),
  };
}
describe('administrative course and credit limit exception', () => {
  it('rejects normal additions with actionable structured counts', async () => {
    const h = harness();
    try {
      await h.service.assertAdministrativeCourseAddition(
        h.studentId,
        h.course as never,
        h.codes,
        'first',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'REGISTRATION_LIMIT_EXCEEDED',
        limits: {
          currentCourseCount: 6,
          proposedCourseCount: 7,
          currentCreditHours: 18,
          proposedCreditHours: 21,
          maxCourses: 6,
          maxCreditHours: 18,
        },
      });
    }
  });
  it('returns the actual exceeded limits for recording when explicitly authorized', async () => {
    const h = harness();
    expect(
      await h.service.assertAdministrativeCourseAddition(
        h.studentId,
        h.course as never,
        h.codes,
        'first',
        true,
      ),
    ).toMatchObject({ proposedCourseCount: 7, proposedCreditHours: 21 });
  });
  it.each(['completed', 'equivalent'])(
    'does not waive %s course protection',
    async (requirement) => {
      const h = harness();
      h.getAcademicProfile.mockResolvedValue({
        completedCourses: ['PASSED'],
        academicLevel: '3',
        gpa: 3,
      });
      const course = {
        ...h.course,
        ...(requirement === 'completed'
          ? { code: 'PASSED' }
          : { equivalentCourses: ['PASSED'] }),
      };
      await expect(
        h.service.assertAdministrativeCourseAddition(
          h.studentId,
          course as never,
          h.codes,
          'first',
          true,
        ),
      ).rejects.toThrow();
    },
  );
});
