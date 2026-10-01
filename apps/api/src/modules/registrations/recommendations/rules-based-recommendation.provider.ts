import { Injectable } from '@nestjs/common';
import {
  type AcademicCourseRecommendation,
  type AcademicRecommendationContext,
  type AcademicRecommendationProvider,
  type RecommendationCategory,
  type RecommendationPriority,
  type RecommendationReasonCode,
  type RecommendationCourse,
} from './recommendation-provider.interface';
import { isCourseOfferedForTerm } from '../utils/term-availability.util';

const normalize = (codes: readonly string[] = []): Set<string> =>
  new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));

const codeOf = (course: Pick<RecommendationCourse, 'code'>): string =>
  course.code.trim().toUpperCase();

@Injectable()
export class RulesBasedRecommendationProvider implements AcademicRecommendationProvider {
  generate(
    context: AcademicRecommendationContext,
  ): AcademicCourseRecommendation[] {
    const completed = normalize(context.completedCourses);
    const failed = normalize(context.failedCourses);
    const inProgress = normalize(context.inProgressCourses);
    const unlockCounts = this.buildUnlockCounts(context.courses);
    const courseByCode = new Map(context.courses.map((c) => [codeOf(c), c]));

    const evaluated = context.courses
      .filter((course) => course.isActive)
      .map((course) =>
        this.evaluateCourse(
          course,
          context,
          completed,
          failed,
          inProgress,
          unlockCounts.get(codeOf(course)) ?? 0,
        ),
      )
      .sort((left, right) => {
        // 1. Eligible failed courses that unlock/block future courses are the absolute first priority!
        const leftFailedUnlock =
          failed.has(left.courseCode) &&
          left.eligible &&
          (unlockCounts.get(left.courseCode) ?? 0) > 0
            ? 1
            : 0;
        const rightFailedUnlock =
          failed.has(right.courseCode) &&
          right.eligible &&
          (unlockCounts.get(right.courseCode) ?? 0) > 0
            ? 1
            : 0;
        if (leftFailedUnlock !== rightFailedUnlock)
          return rightFailedUnlock - leftFailedUnlock;

        // 2. If both are failed unlocking courses, sort by higher unlock count
        if (leftFailedUnlock && rightFailedUnlock) {
          const leftCount = unlockCounts.get(left.courseCode) ?? 0;
          const rightCount = unlockCounts.get(right.courseCode) ?? 0;
          if (leftCount !== rightCount) return rightCount - leftCount;
        }

        // 3. Other eligible failed courses
        const leftFailed = failed.has(left.courseCode) && left.eligible ? 1 : 0;
        const rightFailed =
          failed.has(right.courseCode) && right.eligible ? 1 : 0;
        if (leftFailed !== rightFailed) return rightFailed - leftFailed;

        // 4. Keep every academically eligible course ahead of blocked records.
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;

        // 5. Available courses in the student's current academic year (level) AND semester!
        const leftCourse = courseByCode.get(left.courseCode);
        const rightCourse = courseByCode.get(right.courseCode);
        const leftSameYearSem =
          left.eligible &&
          leftCourse &&
          (leftCourse.academicLevel ?? leftCourse.level) ===
            context.academicLevel &&
          isCourseOfferedForTerm(leftCourse, context.semester)
            ? 1
            : 0;
        const rightSameYearSem =
          right.eligible &&
          rightCourse &&
          (rightCourse.academicLevel ?? rightCourse.level) ===
            context.academicLevel &&
          isCourseOfferedForTerm(rightCourse, context.semester)
            ? 1
            : 0;
        if (leftSameYearSem !== rightSameYearSem)
          return rightSameYearSem - leftSameYearSem;

        // 6. High score first
        if (right.score !== left.score) return right.score - left.score;

        // 7. Alphabetical tie-breaker
        return left.courseCode.localeCompare(right.courseCode);
      });

    let allocatedCredits = 0;
    let allocatedCourses = 0;
    const maxCoursesLimit = context.maxCourses ?? 6;

    return evaluated.map((recommendation) => {
      if (!recommendation.eligible) return recommendation;

      // Low grade improvement courses are optional suggestions, not auto-forced into semester plan
      if (recommendation.category === 'LOW_GRADE_IMPROVEMENT') {
        return {
          ...recommendation,
          isRecommendedForSemester: false,
          warnings: [
            ...recommendation.warnings,
            'Optional improvement course: Can be added optionally if the student desires to improve GPA.',
          ],
        };
      }

      if (
        allocatedCourses < maxCoursesLimit &&
        allocatedCredits + recommendation.creditHours <= context.maxCreditHours
      ) {
        allocatedCredits += recommendation.creditHours;
        allocatedCourses += 1;
        return { ...recommendation, isRecommendedForSemester: true };
      }

      const exceededReason =
        allocatedCourses >= maxCoursesLimit
          ? ('COURSE_LIMIT_EXCEEDED' as const)
          : ('CREDIT_LIMIT_EXCEEDED' as const);

      return {
        ...recommendation,
        reasonCodes: [...recommendation.reasonCodes, exceededReason],
        warnings: [
          ...recommendation.warnings,
          allocatedCourses >= maxCoursesLimit
            ? `Not included in recommended semester plan because the student reached the maximum limit of ${maxCoursesLimit} courses.`
            : `Not included in the recommended semester plan because it would exceed the ${context.maxCreditHours}-credit limit.`,
        ],
      };
    });
  }

  private evaluateCourse(
    course: RecommendationCourse,
    context: AcademicRecommendationContext,
    completed: Set<string>,
    failed: Set<string>,
    inProgress: Set<string>,
    unlockCount: number,
  ): AcademicCourseRecommendation {
    const courseCode = codeOf(course);
    const courseName = course.name;
    const courseNameAr = course.nameAr;
    const courseNameEn = course.nameEn;
    const prerequisites = [...(course.prerequisites ?? [])].map((code) =>
      code.toUpperCase(),
    );

    const missingOnlyCompleted = prerequisites.filter(
      (code) => !completed.has(code),
    );

    const offered = isCourseOfferedForTerm(course, context.semester);
    const alreadyPassed = completed.has(courseCode);
    const alreadyInProgress = inProgress.has(courseCode);
    const previouslyFailed = failed.has(courseCode);
    const currentLevel =
      (course.academicLevel ?? course.level) === context.academicLevel;
    const required =
      course.type === 'required' ||
      course.type === 'university_req' ||
      course.type === 'institute_req' ||
      course.type === 'specialization_req';

    const reasonCodes: RecommendationReasonCode[] = [];
    const blockedReasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // Failed courses receive an exact score of 100 once re-registration is valid.
    if (previouslyFailed) {
      reasonCodes.push('FAILED_PREVIOUSLY');
    }

    // Failed prerequisite courses that unlock later courses receive an
    // additional signal, while every eligible failed course still scores 100.
    if (unlockCount > 0) {
      score += Math.min(unlockCount * 5, 20);
      reasonCodes.push('UNLOCKS_FUTURE_COURSES');
    }

    // 4. Current level requirement (+15)
    if (currentLevel) {
      score += 15;
      reasonCodes.push('CURRENT_LEVEL_REQUIREMENT');
    }

    // 5. Course type
    if (required) {
      score += 20;
      reasonCodes.push('REQUIRED_COURSE');
    } else {
      score += 5;
      reasonCodes.push('ELECTIVE_COURSE');
    }

    // 6. Term availability
    if (offered) {
      score += 15;
      reasonCodes.push('OFFERED_THIS_SEMESTER');
    } else {
      reasonCodes.push('NOT_OFFERED_THIS_SEMESTER');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} is not offered in the ${context.semester} semester.`,
      );
    }

    const isLowGrade = (context.lowGradeCourses ?? []).some(
      (code) => code.toUpperCase() === courseCode,
    );

    if (alreadyPassed) {
      if (isLowGrade) {
        reasonCodes.push('LOW_GRADE_IMPROVEMENT_AVAILABLE');
        warnings.push(
          `${courseCode} ${courseNameEn ?? courseName} was previously passed with a low grade (D/D+); available as an optional improvement course.`,
        );
      } else {
        reasonCodes.push('ALREADY_PASSED');
        blockedReasons.push(
          `${courseCode} ${courseNameEn ?? courseName} has already been passed.`,
        );
      }
    }
    if (alreadyInProgress) {
      reasonCodes.push('ALREADY_IN_PROGRESS');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} is currently in progress.`,
      );
    }
    if (missingOnlyCompleted.length > 0) {
      reasonCodes.push('MISSING_PREREQUISITE');
      const inProgressPrereqs = missingOnlyCompleted.filter((code) =>
        inProgress.has(code),
      );
      if (inProgressPrereqs.length > 0) {
        warnings.push(
          `Prerequisite ${inProgressPrereqs.join(', ')} is currently in-progress and must be completed first.`,
        );
      } else {
        blockedReasons.push(
          `Missing prerequisite${missingOnlyCompleted.length > 1 ? 's' : ''} for ${courseCode} ${courseNameEn ?? courseName}: ${missingOnlyCompleted.join(', ')}.`,
        );
      }
    }

    if ((context.academicWarningCount ?? 0) > 3 && !previouslyFailed) {
      score = Math.max(0, score - 25);
      warnings.push(
        'Failed courses must be prioritized first due to academic warnings.',
      );
    }

    // Level check: Do not recommend courses higher than student current level
    const courseLevelNum = Number(course.academicLevel ?? course.level ?? '1');
    const studentLevelNum = Number(context.academicLevel ?? '1');
    const isHigherLevel = courseLevelNum > studentLevelNum;

    if (isHigherLevel && !context.allowHigherLevelCourses) {
      reasonCodes.push('HIGHER_LEVEL_RESTRICTED');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} is a Level ${courseLevelNum} course, which is higher than the student's current level (${studentLevelNum}). It cannot be recommended.`,
      );
    }

    // Department compatibility check for Level 3 & Level 4
    const isSpecializedLevel = courseLevelNum >= 3;
    let departmentMismatch = false;

    if (isSpecializedLevel && context.department) {
      const studentDeptNorm = this.normalizeDepartment(context.department);
      const courseDeptNorm = this.normalizeDepartment(course.department);

      // Common courses shared by both BIS and Accounting in Level 3
      const isCommonSharedCourse = ['317', '411', '318', '319', '326'].includes(
        courseCode,
      );

      if (
        !isCommonSharedCourse &&
        courseDeptNorm &&
        courseDeptNorm !== 'GENERAL' &&
        studentDeptNorm &&
        studentDeptNorm !== 'GENERAL' &&
        courseDeptNorm !== studentDeptNorm
      ) {
        departmentMismatch = true;
        reasonCodes.push('DIFFERENT_DEPARTMENT');
        blockedReasons.push(
          `${courseCode} ${courseNameEn ?? courseName} belongs to the ${course.department} track and does not match the student's department (${context.department}).`,
        );
      }
    }

    const eligible =
      offered &&
      (!alreadyPassed || isLowGrade) &&
      !alreadyInProgress &&
      !departmentMismatch &&
      !(isHigherLevel && !context.allowHigherLevelCourses) &&
      missingOnlyCompleted.length === 0;

    score =
      previouslyFailed && eligible ? 100 : Math.max(0, Math.min(99, score));
    const priority: RecommendationPriority = !eligible
      ? 'BLOCKED'
      : score >= 75
        ? 'HIGH'
        : score >= 40
          ? 'MEDIUM'
          : 'LOW';

    const category: RecommendationCategory = previouslyFailed
      ? unlockCount > 0
        ? 'FAILED_PREREQUISITE'
        : 'FAILED_COURSE'
      : alreadyPassed && isLowGrade
        ? 'LOW_GRADE_IMPROVEMENT'
        : required && currentLevel
          ? 'REQUIRED_CURRENT_SEMESTER'
          : required && !currentLevel && score > 10
            ? 'REQUIRED_EARLIER_SEMESTER'
            : !required
              ? 'ELECTIVE'
              : 'REQUIRED_NEXT_SEMESTER';

    const nameDisplay =
      courseNameEn && courseNameAr
        ? `${courseCode} — ${courseNameEn} / ${courseNameAr}`
        : `${courseCode} — ${courseNameEn ?? courseName}`;

    const explanation = previouslyFailed
      ? !offered
        ? `${nameDisplay} was previously failed, but it is not offered in the ${context.semester} semester. Defer it until its next offering and select another eligible course for the current plan.`
        : unlockCount > 0
          ? `Priority #1 (Critical Blocker): ${nameDisplay} was previously failed and blocks ${unlockCount} upcoming course${unlockCount > 1 ? 's' : ''}! Must be retaken to unblock future registrations.`
          : `Priority #1: ${nameDisplay} was previously failed and must be retaken first for graduation.`
      : required
        ? `${nameDisplay} is a required course for level ${course.academicLevel ?? course.level}.`
        : `${nameDisplay} is an elective course fitting the student plan.`;

    return {
      courseId:
        course._id != null
          ? (course._id as { toString(): string }).toString()
          : undefined,
      courseCode,
      courseName,
      courseNameAr,
      courseNameEn,
      category,
      score,
      priority,
      eligible,
      isRecommendedForSemester: false,
      reasonCodes,
      explanation,
      warnings,
      blockedReasons,
      prerequisiteEvaluation: {
        satisfied: missingOnlyCompleted.length === 0,
        required: prerequisites,
        missing: missingOnlyCompleted,
      },
      schedulingEvaluation: { offered, conflict: false },
      creditHours: course.creditHours ?? 0,
    };
  }

  private buildUnlockCounts(
    courses: readonly RecommendationCourse[],
  ): Map<string, number> {
    const counts = new Map<string, number>();
    courses.forEach((course) =>
      course.prerequisites?.forEach((code) => {
        const normalized = code.toUpperCase();
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }),
    );
    return counts;
  }

  private normalizeDepartment(dept?: string): string {
    if (!dept) return '';
    const clean = dept.trim().toUpperCase();
    if (
      clean.includes('BIS') ||
      clean.includes('نظم') ||
      clean.includes('INFORMATION')
    ) {
      return 'BIS';
    }
    if (clean.includes('ACC') || clean.includes('محاسب')) {
      return 'ACCOUNTING';
    }
    if (clean === 'GENERAL' || clean === 'عام') {
      return 'GENERAL';
    }
    return clean;
  }
}
