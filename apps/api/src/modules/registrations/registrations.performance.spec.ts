import { Types } from 'mongoose';
import { RegistrationsService } from './registrations.service';

function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function setup(
  options: {
    termOpen?: boolean;
    semester?: string;
    graduating?: boolean;
    graduationRule?: boolean;
    summerRule?: boolean;
    grades?: Array<Record<string, unknown>>;
  } = {},
) {
  const studentId = new Types.ObjectId();
  const term = {
    academicYear: '2026-2027',
    semester: options.semester ?? 'first',
    isCurrent: true,
    isOpen: options.termOpen ?? true,
  };
  const academic = {
    findOne: jest.fn().mockReturnValue(
      query({
        studentId,
        academicLevel: '2',
        semester: 'first',
        gpa: 3,
        completedCourses: ['A'],
        failedCourses: [],
        lowGradeCourses: [],
        academicWarnings: 0,
        approvedICCourseCompletions: [],
        isGraduatingThisYear: options.graduating ?? false,
      }),
    ),
  };
  const rules = {
    findOne: jest.fn().mockReturnValue(
      query({
        minGpa: 0,
        maxGpa: 4,
        minCreditHours: 10,
        maxCreditHours: 18,
        minCourses: 4,
        maxCourses: 6,
        requiresAdvisor: false,
        requireForGraduationPlans: options.graduationRule ?? false,
        requireForSummerRegistration: options.summerRule ?? false,
      }),
    ),
  };
  const advising = {
    findOne: jest.fn().mockReturnValue(query({ _id: 'advising-request' })),
  };
  const registrations = { findOne: jest.fn().mockReturnValue(query(null)) };
  const courses = {
    find: jest.fn().mockReturnValue(
      query([
        { code: 'B', semester: 'first', creditHours: 3 },
        { code: 'C', semester: 'second', creditHours: 3 },
        { code: 'D', semester: 'second', creditHours: 3 },
      ]),
    ),
  };
  const grades = {
    find: jest.fn().mockReturnValue(query(options.grades ?? [])),
  };
  const terms = {
    find: jest.fn().mockReturnValue(query([term])),
    findOne: jest.fn().mockReturnValue(query(term)),
  };
  const profiles = {
    findOne: jest.fn().mockReturnValue(
      query({
        department: 'business',
        academicWarnings: 0,
        academicYear: '2026-2027',
      }),
    ),
  };
  const students = { findByUserId: jest.fn() };
  const service = new RegistrationsService(
    academic as never,
    rules as never,
    advising as never,
    registrations as never,
    courses as never,
    grades as never,
    {} as never,
    {} as never,
    terms as never,
    profiles as never,
    students as never,
    {} as never,
  );
  return {
    service,
    studentId: studentId.toHexString(),
    academic,
    rules,
    advising,
    registrations,
    courses,
    grades,
    terms,
    profiles,
    students,
  };
}

describe('registration eligibility query workload', () => {
  it('repairs a missing student link even when academic data and a current term exist', async () => {
    const h = setup();
    h.profiles.findOne.mockReturnValueOnce(query(null));
    h.students.findByUserId.mockResolvedValue({
      level: '2',
      semester: 'first',
    });
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      canRegisterDirectly: true,
    });
    expect(h.students.findByUserId).toHaveBeenCalledTimes(1);
    expect(h.profiles.findOne).toHaveBeenCalledTimes(2);
  });

  it('does not permit a second registration in the same term', async () => {
    const h = setup();
    h.registrations.findOne.mockReturnValue(query({ _id: 'existing' }));
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      canRegisterDirectly: false,
    });
  });

  it('retains the legacy academic-profile repair path when the profile is absent', async () => {
    const h = setup();
    h.academic.findOne.mockReturnValue(query(null));
    h.profiles.findOne.mockReturnValueOnce(query(null));
    h.students.findByUserId.mockResolvedValue({
      level: '1',
      semester: 'first',
    });
    const repair = jest.fn().mockReturnValue(
      query({
        studentId: new Types.ObjectId(h.studentId),
        academicLevel: '1',
        semester: 'first',
        gpa: 0,
        completedCourses: [],
        failedCourses: [],
        lowGradeCourses: [],
        approvedICCourseCompletions: [],
        academicWarnings: 0,
      }),
    );
    Reflect.set(h.academic, 'findOneAndUpdate', repair);
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      canRegisterDirectly: true,
      academicLevel: '1',
      gpa: 0,
    });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(h.students.findByUserId).toHaveBeenCalledTimes(1);
  });

  it('uses seven reads without loading the user, full profile or course catalogue', async () => {
    const h = setup();
    const result = await h.service.getEligibility(h.studentId);
    expect(result).toMatchObject({
      canRegisterDirectly: true,
      gpa: 3,
      semester: 'first',
      requiresAdvisor: false,
    });
    for (const find of [
      h.academic.findOne,
      h.rules.findOne,
      h.registrations.findOne,
      h.grades.find,
      h.terms.find,
      h.terms.findOne,
      h.profiles.findOne,
    ])
      expect(find).toHaveBeenCalledTimes(1);
    expect(h.courses.find).not.toHaveBeenCalled();
    expect(h.students.findByUserId).not.toHaveBeenCalled();
    expect(h.advising.findOne).not.toHaveBeenCalled();
  });

  it('continues blocking registration when the term is closed', async () => {
    const h = setup({ termOpen: false });
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      canRegisterDirectly: false,
      registrationTerm: { isCurrentlyOpen: false },
    });
  });

  it('applies summer policy to the resolved semester and reuses the loaded GPA rule', async () => {
    const h = setup({ semester: 'summer', summerRule: true });
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      semester: 'summer',
      canRegisterDirectly: false,
      requiresAdvisor: true,
      advisingRequest: { _id: 'advising-request' },
    });
    expect(h.rules.findOne).toHaveBeenCalledTimes(1);
    expect(h.courses.find).not.toHaveBeenCalled();
  });

  it('still loads courses for graduation plans and detects mixed semesters', async () => {
    const h = setup({ graduating: true, graduationRule: true });
    expect(await h.service.getEligibility(h.studentId)).toMatchObject({
      requiresAdvisor: true,
      canRegisterDirectly: false,
      policyWarnings: expect.arrayContaining([
        'Graduation plan contains courses from mixed semesters.',
      ]),
    });
    expect(h.courses.find).toHaveBeenCalledTimes(1);
  });

  it('retains published-grade GPA calculation and loads only the matching course credits', async () => {
    const h = setup({
      grades: [
        {
          courseCode: 'B',
          examType: 'final',
          grade: 90,
          maxGrade: 100,
          status: 'present',
        },
      ],
    });
    const result = await h.service.getEligibility(h.studentId);
    expect(result.gpa).toBeGreaterThan(3);
    expect(h.courses.find).toHaveBeenCalledTimes(1);
    expect(h.courses.find).toHaveBeenCalledWith({ code: { $in: ['B'] } });
  });

  it('uses the student year fallback without loading account or academic data again', async () => {
    const h = setup();
    h.terms.find.mockReturnValue(query([]));
    expect(
      (await h.service.getEligibility(h.studentId)).registrationTerm
        .academicYear,
    ).toBe('2026-2027');
    expect(h.profiles.findOne).toHaveBeenCalledTimes(2);
    expect(h.academic.findOne).toHaveBeenCalledTimes(1);
    expect(h.students.findByUserId).not.toHaveBeenCalled();
  });
});
