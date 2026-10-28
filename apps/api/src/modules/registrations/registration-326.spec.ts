import { Types } from 'mongoose';
import { COURSE_326_CURRICULA } from '@student-portal/shared';
import { RegistrationsService } from './registrations.service';
import { RulesBasedRecommendationProvider } from './recommendations/rules-based-recommendation.provider';
import { courseForDepartment } from '../courses/utils/course-curriculum.util';

const course = {
  code: '326',
  _id: new Types.ObjectId(),
  name: 'Governmental Accounting',
  nameAr: 'المحاسبة في الوحدات الحكومية',
  nameEn: 'Governmental Accounting',
  level: '3' as const,
  academicLevel: '3' as const,
  semester: 'second' as const,
  type: 'required' as const,
  department: 'BIS',
  creditHours: 3,
  isActive: true,
  prerequisites: [] as string[],
  offeredTerms: ['first', 'second'],
  curricula: COURSE_326_CURRICULA.map((item) => ({ ...item })),
};
function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('326 registration and historical print data', () => {
  it.each([
    ['ACCOUNTING', 'first', true],
    ['ACCOUNTING', 'second', false],
    ['BIS', 'first', false],
    ['BIS', 'second', true],
  ] as const)(
    'recommendations for %s in %s: %s',
    (department, semester, expected) => {
      const scoped = courseForDepartment(course, department)!;
      const result = new RulesBasedRecommendationProvider().generate({
        courses: [scoped as never],
        academicLevel: '3',
        semester,
        department,
        completedCourses: [],
        failedCourses: [],
        maxCreditHours: 18,
      });
      expect(result[0].eligible).toBe(expected);
    },
  );
  it('prints the stored registration term and status, and resolves course type by department', async () => {
    const studentId = new Types.ObjectId();
    const registrationId = new Types.ObjectId();
    const registrations = {
      findOne: jest.fn().mockResolvedValue({
        _id: registrationId,
        studentId,
        courses: ['326'],
        academicYear: '2024-2025',
        semester: 'second',
        status: 'pending',
        source: 'student',
        totalCreditHours: 3,
      }),
    };
    const args = Array.from(
      { length: 12 },
      () => ({}),
    ) as unknown as ConstructorParameters<typeof RegistrationsService>;
    args[3] = registrations as never;
    args[4] = { find: jest.fn().mockReturnValue(query([course])) } as never;
    const service = new RegistrationsService(...args);
    Object.assign(service, {
      resolveStudentPrintProfile: jest.fn().mockResolvedValue({
        fullName: 'Test Student',
        studentCode: 'TEST326',
        department: 'ACCOUNTING',
        level: '3',
      }),
      getAcademicProfile: jest
        .fn()
        .mockResolvedValue({ academicLevel: '3', semester: 'first', gpa: 3 }),
    });
    const result = await service.getPrintableForm(
      registrationId.toHexString(),
      studentId.toHexString(),
      'student',
    );
    expect(result.academicYear).toBe('2024-2025');
    expect(result.studentInformation.semester).toBe('second');
    expect(result.studentInformation.department).toBe('ACCOUNTING');
    expect(result.registeredCourses[0]).toMatchObject({
      code: '326',
      type: 'elective',
      status: 'pending',
      creditHours: 3,
    });
    expect(registrations.findOne).toHaveBeenCalledWith({
      _id: registrationId,
      studentId,
    });
  });
  it('denies printing another student registration', async () => {
    const args = Array.from(
      { length: 12 },
      () => ({}),
    ) as unknown as ConstructorParameters<typeof RegistrationsService>;
    args[3] = { findOne: jest.fn().mockResolvedValue(null) } as never;
    const service = new RegistrationsService(...args);
    await expect(
      service.getPrintableForm(
        new Types.ObjectId().toHexString(),
        new Types.ObjectId().toHexString(),
        'student',
      ),
    ).rejects.toThrow('own registration');
  });
});
