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
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.courseCode.localeCompare(right.courseCode),
      );

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
          `Adding this course would exceed the ${context.maxCreditHours}-credit limit.`,
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
  ): AcademicCourseRecommendation {
    const courseCode = codeOf(course);
    const courseName = course.name;
    const courseNameAr = course.nameAr;
    const courseNameEn = course.nameEn;
    const prerequisites = [...(course.prerequisites ?? [])].map((code) =>
      code.toUpperCase(),
    );
    const missing = prerequisites.filter((code) => !completed.has(code));
    const offered = isCourseOfferedForTerm(course, context.semester);
    const alreadyPassed = completed.has(courseCode);
    const alreadyInProgress = inProgress.has(courseCode);
    const previouslyFailed = failed.has(courseCode);
    const currentLevel =
      (course.academicLevel ?? course.level) === context.academicLevel;
    const required = course.type === 'required' ||
      course.type === 'university_req' ||
      course.type === 'institute_req' ||
      course.type === 'specialization_req';
    const reasonCodes: RecommendationReasonCode[] = [];
    const blockedReasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    if (previouslyFailed) {
      score += 55;
      reasonCodes.push('FAILED_PREVIOUSLY');
    }
    if (required) {
      score += 18;
      reasonCodes.push('REQUIRED_COURSE');
    } else {
      score += 3;
      reasonCodes.push('ELECTIVE_COURSE');
    }
    if (offered) {
      score += 12;
      reasonCodes.push('OFFERED_THIS_SEMESTER');
    } else {
      reasonCodes.push('NOT_OFFERED_THIS_SEMESTER');
      blockedReasons.push(
        `${courseCode} ${courseNameEn ?? courseName} is not offered in the selected semester.`,
      );
    }
    if (currentLevel) {
      score += 8;
      reasonCodes.push('CURRENT_LEVEL_REQUIREMENT');
    }
    if (unlockCount > 0) {
      score += Math.min(unlockCount * 4, 16);
      reasonCodes.push('UNLOCKS_FUTURE_COURSES');
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
        `${courseCode} ${courseNameEn ?? courseName} is already in progress.`,
      );
    }
    if (missing.length > 0) {
      reasonCodes.push('MISSING_PREREQUISITE');
      blockedReasons.push(
        `Missing prerequisite${missing.length > 1 ? 's' : ''} for ${courseCode} ${courseNameEn ?? courseName}: ${missing.join(', ')}.`,
      );
    }
    if ((context.academicWarningCount ?? 0) > 3 && !previouslyFailed) {
      score = Math.max(0, score - 20);
      warnings.push(
        'Failed courses should be prioritized because the student has more than three academic warnings.',
      );
    }

    const eligible =
      offered && !alreadyPassed && !alreadyInProgress && missing.length === 0;
    score = Math.max(0, Math.min(100, score));
    const priority: RecommendationPriority = !eligible
      ? 'BLOCKED'
      : score >= 70
        ? 'HIGH'
        : score >= 35
          ? 'MEDIUM'
          : 'LOW';

    // Determine recommendation category
    const category: RecommendationCategory = previouslyFailed
      ? (missing.length > 0 ? 'FAILED_PREREQUISITE' : 'FAILED_COURSE')
      : required && currentLevel
        ? 'REQUIRED_CURRENT_SEMESTER'
        : required && !currentLevel && score > 10
          ? 'REQUIRED_EARLIER_SEMESTER'
          : !required
            ? 'ELECTIVE'
            : 'REQUIRED_NEXT_SEMESTER';

    // Build bilingual explanation
    const nameDisplay = courseNameEn && courseNameAr
      ? `${courseCode} — ${courseNameEn} / ${courseNameAr}`
      : `${courseCode} — ${courseNameEn ?? courseName}`;

    const explanation = previouslyFailed
      ? `${nameDisplay} was previously failed${required ? ' and is required for graduation' : ''}${unlockCount ? `; it unlocks ${unlockCount} future course${unlockCount === 1 ? '' : 's'}` : ''}.`
      : required
        ? `${nameDisplay} is a required course${unlockCount ? ` that unlocks ${unlockCount} future course${unlockCount === 1 ? '' : 's'}` : ''}.`
        : `${nameDisplay} is an elective course suitable for the current plan.`;

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
        satisfied: missing.length === 0,
        required: prerequisites,
        missing,
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
}
