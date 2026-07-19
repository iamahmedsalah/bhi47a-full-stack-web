import { Injectable } from '@nestjs/common';
import type { CourseDocument } from '../../courses/schemas/course.schema';
import {
  type AcademicCourseRecommendation,
  type AcademicRecommendationContext,
  type AcademicRecommendationProvider,
  type RecommendationCategory,
  type RecommendationPriority,
  type RecommendationReasonCode,
} from './recommendation-provider.interface';
import { isCourseOfferedForTerm } from '../utils/term-availability.util';

const normalize = (codes: readonly string[] = []): Set<string> =>
  new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));

const codeOf = (course: Pick<CourseDocument, 'code'>): string =>
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
    const criticalPathDepths = this.buildCriticalPathDepths(context.courses);

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
          criticalPathDepths.get(codeOf(course)) ?? 0,
        ),
      )
      .sort((left, right) => {
        // 1. Failed courses first
        const leftFailed = failed.has(left.courseCode) && left.eligible ? 1 : 0;
        const rightFailed = failed.has(right.courseCode) && right.eligible ? 1 : 0;
        if (leftFailed !== rightFailed) return rightFailed - leftFailed;

        // 2. High score first
        if (right.score !== left.score) return right.score - left.score;

        // 3. Alphabetical tie-breaker
        return left.courseCode.localeCompare(right.courseCode);
      });

    let allocatedCredits = 0;
    return evaluated.map((recommendation) => {
      if (!recommendation.eligible) return recommendation;
      if (
        allocatedCredits + recommendation.creditHours <=
        context.maxCreditHours
      ) {
        allocatedCredits += recommendation.creditHours;
        return recommendation;
      }
      return {
        ...recommendation,
        eligible: false,
        priority: 'BLOCKED' as const,
        reasonCodes: [...recommendation.reasonCodes, 'CREDIT_LIMIT_EXCEEDED' as const],
        blockedReasons: [
          ...recommendation.blockedReasons,
          `Adding this course would exceed the ${context.maxCreditHours}-credit limit for this term.`,
        ],
      };
    });
  }

  private evaluateCourse(
    course: CourseDocument,
    context: AcademicRecommendationContext,
    completed: Set<string>,
    failed: Set<string>,
    inProgress: Set<string>,
    unlockCount: number,
    criticalPathDepth: number,
  ): AcademicCourseRecommendation {
    const courseCode = codeOf(course);
    const courseName = course.name;
    const courseNameAr = course.nameAr;
    const courseNameEn = course.nameEn;
    const prerequisites = [...(course.prerequisites ?? [])].map((code) =>
      code.toUpperCase(),
    );

    // Consider both completed and in-progress for prerequisite chain evaluation
    const missing = prerequisites.filter(
      (code) => !completed.has(code) && !inProgress.has(code),
    );
    const missingOnlyCompleted = prerequisites.filter((code) => !completed.has(code));

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

    // 1. Failed Courses First (+100 score boost)
    if (previouslyFailed) {
      score += 100;
      reasonCodes.push('FAILED_PREVIOUSLY');
    }

    // 2. Critical Path / Minimum Semesters to Graduate (+15 per depth step, max 60)
    if (criticalPathDepth > 0) {
      score += Math.min(criticalPathDepth * 15, 60);
      reasonCodes.push('UNLOCKS_FUTURE_COURSES');
    }

    // 3. Direct unlock count (+5 per unlock, max 20)
    if (unlockCount > 0) {
      score += Math.min(unlockCount * 5, 20);
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

    if (alreadyPassed) {
      reasonCodes.push('ALREADY_PASSED');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} has already been passed.`,
      );
    }
    if (alreadyInProgress) {
      reasonCodes.push('ALREADY_IN_PROGRESS');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} is currently in progress.`,
      );
    }
    if (missingOnlyCompleted.length > 0) {
      reasonCodes.push('MISSING_PREREQUISITE');
      const inProgressPrereqs = missingOnlyCompleted.filter((code) => inProgress.has(code));
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

    const eligible =
      offered && !alreadyPassed && !alreadyInProgress && missingOnlyCompleted.length === 0;

    score = Math.max(0, Math.min(100, score));
    const priority: RecommendationPriority = !eligible
      ? 'BLOCKED'
      : score >= 75
        ? 'HIGH'
        : score >= 40
          ? 'MEDIUM'
          : 'LOW';

    const category: RecommendationCategory = previouslyFailed
      ? (missingOnlyCompleted.length > 0 ? 'FAILED_PREREQUISITE' : 'FAILED_COURSE')
      : required && currentLevel
        ? 'REQUIRED_CURRENT_SEMESTER'
        : required && !currentLevel && score > 10
          ? 'REQUIRED_EARLIER_SEMESTER'
          : !required
            ? 'ELECTIVE'
            : 'REQUIRED_NEXT_SEMESTER';

    const nameDisplay = courseNameEn && courseNameAr
      ? `${courseCode} — ${courseNameEn} / ${courseNameAr}`
      : `${courseCode} — ${courseNameEn ?? courseName}`;

    const explanation = previouslyFailed
      ? `Priority #1: ${nameDisplay} was previously failed and must be retaken first for graduation.`
      : criticalPathDepth > 0
        ? `Shortest Path: ${nameDisplay} is on a ${criticalPathDepth}-step critical prerequisite path to graduation.`
        : required
          ? `${nameDisplay} is a required course for level ${course.academicLevel ?? course.level}.`
          : `${nameDisplay} is an elective course fitting the student plan.`;

    return {
      courseId: course._id?.toString(),
      courseCode,
      courseName,
      courseNameAr,
      courseNameEn,
      category,
      score,
      priority,
      eligible,
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
    courses: readonly CourseDocument[],
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

  /**
   * Computes the longest downstream prerequisite depth (critical path to graduation)
   * for each course using a directed graph.
   */
  private buildCriticalPathDepths(
    courses: readonly CourseDocument[],
  ): Map<string, number> {
    const adj = new Map<string, string[]>(); // prerequisite -> courses that require it
    const depths = new Map<string, number>();

    courses.forEach((course) => {
      const code = codeOf(course);
      if (!adj.has(code)) adj.set(code, []);
      (course.prerequisites ?? []).forEach((prereq) => {
        const pCode = prereq.toUpperCase();
        if (!adj.has(pCode)) adj.set(pCode, []);
        adj.get(pCode)!.push(code);
      });
    });

    const getDepth = (code: string, visited: Set<string>): number => {
      if (depths.has(code)) return depths.get(code)!;
      if (visited.has(code)) return 0; // Cycle safety

      visited.add(code);
      const dependents = adj.get(code) ?? [];
      let maxChildDepth = 0;

      for (const child of dependents) {
        maxChildDepth = Math.max(maxChildDepth, 1 + getDepth(child, new Set(visited)));
      }

      depths.set(code, maxChildDepth);
      return maxChildDepth;
    };

    courses.forEach((course) => getDepth(codeOf(course), new Set()));
    return depths;
  }
}
