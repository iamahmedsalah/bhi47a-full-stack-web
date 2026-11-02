import type { Course } from '../../courses/schemas/course.schema';
import { PlanValidationService } from './plan-validation.service';
const course = (code: string, prerequisites: string[] = []): Course => ({
  code,
  prerequisites,
  creditHours: 3,
  isActive: true,
  name: code,
  nameAr: code,
  nameEn: code,
  level: '1',
  academicLevel: '1',
  semester: 'first',
  offeredTerms: ['first'],
  type: 'required',
  coRequisites: [],
  equivalentCourses: [],
  registrationPriority: 0,
  doctorIds: [],
  doctors: [],
  teachingAssistantIds: [],
  teachingAssistants: [],
});
describe('PlanValidationService', () => {
  const service = new PlanValidationService();
  it('blocks already passed and prerequisite-invalid selections', () => {
    const result = service.validate({
      courses: [course('ACC101'), course('ACC202', ['ACC201'])],
      completedCodes: ['ACC101'],
      failedCodes: [],
      maxCredits: 18,
      semester: 'first',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'COURSE_ALREADY_PASSED' }),
        expect.objectContaining({ code: 'PREREQUISITE_NOT_PASSED' }),
      ]),
    );
  });
  it('requires a reason when the credit limit is exceeded', () => {
    const courses = [course('A'), course('B')];
    expect(
      service.validate({
        courses,
        completedCodes: [],
        failedCodes: [],
        maxCredits: 3,
        semester: 'first',
      }).valid,
    ).toBe(false);
    expect(
      service.validate({
        courses,
        completedCodes: [],
        failedCodes: [],
        maxCredits: 3,
        overrideReasons: ['Graduation exception'],
        semester: 'first',
      }).valid,
    ).toBe(true);
  });
  it('warns when a failed course is not prioritized', () => {
    const result = service.validate({
      courses: [course('NEW101')],
      completedCodes: [],
      failedCodes: ['OLD101'],
      maxCredits: 18,
      semester: 'first',
    });
    expect(result.warnings[0]).toEqual(
      expect.objectContaining({ code: 'FAILED_COURSE_NOT_SELECTED' }),
    );
  });
  it('blocks a plan containing a course outside the active semester', () => {
    const result = service.validate({
      courses: [course('FIRST101')],
      completedCodes: [],
      failedCodes: [],
      maxCredits: 18,
      semester: 'second',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ code: 'COURSE_NOT_OFFERED' }),
    );
  });
});
