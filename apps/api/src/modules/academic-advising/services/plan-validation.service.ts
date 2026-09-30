import { Injectable } from '@nestjs/common';
import type { Course } from '../../courses/schemas/course.schema';
import type { Semester } from '@student-portal/shared';
import { isCourseOfferedForTerm } from '../../registrations/utils/term-availability.util';

export type ValidationSeverity = 'ERROR' | 'WARNING';

export type ValidationCode =
  | 'PREREQUISITE_NOT_PASSED'
  | 'COREQUISITE_NOT_SELECTED'
  | 'COURSE_ALREADY_PASSED'
  | 'COURSE_ALREADY_REGISTERED'
  | 'COURSE_NOT_OFFERED'
  | 'COURSE_INACTIVE'
  | 'DUPLICATE_COURSE'
  | 'MIN_HOURS_NOT_REACHED'
  | 'MAX_HOURS_EXCEEDED'
  | 'FAILED_COURSE_NOT_SELECTED'
  | 'INVALID_LEVEL_PROGRESSION'
  | 'GPA_REQUIREMENT_NOT_MET'
  | 'EQUIVALENT_COURSE_ALREADY_PASSED'
  | 'REGISTRATION_PERIOD_CLOSED'
  | 'ADVISOR_APPROVAL_REQUIRED';

export interface ValidationItem {
  code: ValidationCode;
  message: string;
  severity: ValidationSeverity;
  courseIds: string[];
  blockingCourses?: string[];
}

export interface PlanValidationInput {
  courses: Course[];
  completedCodes: string[];
  failedCodes: string[];
  equivalentPassedCodes?: string[];
  registeredCodes?: string[];
  maxCredits: number;
  minCredits?: number;
  gpa?: number;
  overrideReasons?: string[];
  semester: Semester;
}

export interface PlanValidationResult {
  valid: boolean;
  errors: ValidationItem[];
  warnings: ValidationItem[];
  requiredOverrides: string[];
  totalCredits: number;
  validatedAt: Date;
}

@Injectable()
export class PlanValidationService {
  validate(input: PlanValidationInput): PlanValidationResult {
    const completed = new Set(
      input.completedCodes.map((code) => code.toUpperCase()),
    );
    const equivalentPassed = new Set(
      (input.equivalentPassedCodes ?? []).map((code) => code.toUpperCase()),
    );
    const registered = new Set(
      (input.registeredCodes ?? []).map((code) => code.toUpperCase()),
    );
    const selected = new Set(
      input.courses.map((course) => course.code.toUpperCase()),
    );
    const errors: ValidationItem[] = [];
    const warnings: ValidationItem[] = [];
    const requiredOverrides: string[] = [];
    const totalCredits = input.courses.reduce(
      (sum, course) => sum + (course.creditHours ?? 0),
      0,
    );

    // Check for duplicates
    const seenCodes = new Set<string>();
    for (const course of input.courses) {
      const code = course.code.toUpperCase();
      if (seenCodes.has(code)) {
        errors.push({
          code: 'DUPLICATE_COURSE',
          message: `${course.code} is selected more than once.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }
      seenCodes.add(code);
    }

    input.courses.forEach((course) => {
      const code = course.code.toUpperCase();

      // Already passed
      if (completed.has(code)) {
        errors.push({
          code: 'COURSE_ALREADY_PASSED',
          message: `${course.code} (${course.nameEn ?? course.name}) has already been passed.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }

      // Equivalent already passed
      const equiv = (course.equivalentCourses ?? []).find(
        (eq) =>
          completed.has(eq.toUpperCase()) ||
          equivalentPassed.has(eq.toUpperCase()),
      );
      if (equiv) {
        errors.push({
          code: 'EQUIVALENT_COURSE_ALREADY_PASSED',
          message: `${course.code} cannot be taken because equivalent course ${equiv} has already been passed.`,
          severity: 'ERROR',
          courseIds: [course.code],
          blockingCourses: [equiv],
        });
      }

      // Already registered
      if (registered.has(code)) {
        errors.push({
          code: 'COURSE_ALREADY_REGISTERED',
          message: `${course.code} is already registered for the current term.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }

      // Prerequisites
      const missing = (course.prerequisites ?? []).filter(
        (prereq) =>
          !completed.has(prereq.toUpperCase()) &&
          !selected.has(prereq.toUpperCase()),
      );
      if (missing.length) {
        errors.push({
          code: 'PREREQUISITE_NOT_PASSED',
          message: `You must pass ${missing.join(', ')} before registering for ${course.code} (${course.nameEn ?? course.name}).`,
          severity: 'ERROR',
          courseIds: [course.code],
          blockingCourses: missing,
        });
      }

      // Co-requisites
      const missingCoreq = (course.coRequisites ?? []).filter(
        (coreq) =>
          !completed.has(coreq.toUpperCase()) &&
          !selected.has(coreq.toUpperCase()),
      );
      if (missingCoreq.length) {
        errors.push({
          code: 'COREQUISITE_NOT_SELECTED',
          message: `Co-requisite${missingCoreq.length > 1 ? 's' : ''} ${missingCoreq.join(', ')} must be selected along with ${course.code}.`,
          severity: 'ERROR',
          courseIds: [course.code],
          blockingCourses: missingCoreq,
        });
      }

      // Course inactive
      if (!course.isActive) {
        errors.push({
          code: 'COURSE_INACTIVE',
          message: `${course.code} (${course.nameEn ?? course.name}) is currently inactive.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }

      // Not offered this semester
      if (!isCourseOfferedForTerm(course, input.semester)) {
        errors.push({
          code: 'COURSE_NOT_OFFERED',
          message: `${course.code} (${course.nameEn ?? course.name}) is not offered in the ${input.semester} semester.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }

      // GPA requirement
      if (
        course.minimumGpa !== undefined &&
        course.minimumGpa > 0 &&
        input.gpa !== undefined &&
        input.gpa < course.minimumGpa
      ) {
        errors.push({
          code: 'GPA_REQUIREMENT_NOT_MET',
          message: `${course.code} requires a minimum GPA of ${course.minimumGpa}, but your GPA is ${input.gpa}.`,
          severity: 'ERROR',
          courseIds: [course.code],
        });
      }
    });

    // Credit hour limits
    if (totalCredits > input.maxCredits) {
      requiredOverrides.push(
        `Credit load ${totalCredits} exceeds the ${input.maxCredits}-credit limit.`,
      );
      errors.push({
        code: 'MAX_HOURS_EXCEEDED',
        message: `The selected courses total ${totalCredits} credit hours, exceeding the maximum allowed ${input.maxCredits} hours.`,
        severity: 'ERROR',
        courseIds: [],
      });
    }

    const minCredits = input.minCredits ?? 0;
    if (minCredits > 0 && totalCredits < minCredits) {
      warnings.push({
        code: 'MIN_HOURS_NOT_REACHED',
        message: `The selected courses total ${totalCredits} credit hours, which is below the minimum ${minCredits} hours.`,
        severity: 'WARNING',
        courseIds: [],
      });
    }

    // Failed course not selected warning
    const selectedFailed = input.failedCodes.filter((code) =>
      selected.has(code.toUpperCase()),
    );
    if (input.failedCodes.length && !selectedFailed.length) {
      warnings.push({
        code: 'FAILED_COURSE_NOT_SELECTED',
        message:
          'A previously failed required course was not selected. Failed courses should be prioritized.',
        severity: 'WARNING',
        courseIds: input.failedCodes,
      });
    }

    const overridesCoverRequirements =
      requiredOverrides.length === 0 ||
      (input.overrideReasons?.length ?? 0) >= requiredOverrides.length;
    const effectiveErrors = overridesCoverRequirements
      ? errors.filter((error) => error.code !== 'MAX_HOURS_EXCEEDED')
      : errors;

    return {
      valid: effectiveErrors.length === 0 && overridesCoverRequirements,
      errors: effectiveErrors,
      warnings,
      requiredOverrides,
      totalCredits,
      validatedAt: new Date(),
    };
  }
}
