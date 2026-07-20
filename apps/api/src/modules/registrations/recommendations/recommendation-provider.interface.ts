import type { Course } from '../../courses/schemas/course.schema';
import type { CourseLevel, Semester } from '@student-portal/shared';

export type RecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';

export type RecommendationReasonCode =
  | 'FAILED_PREVIOUSLY'
  | 'REQUIRED_COURSE'
  | 'OFFERED_THIS_SEMESTER'
  | 'CURRENT_LEVEL_REQUIREMENT'
  | 'UNLOCKS_FUTURE_COURSES'
  | 'ELECTIVE_COURSE'
  | 'ALREADY_PASSED'
  | 'ALREADY_IN_PROGRESS'
  | 'MISSING_PREREQUISITE'
  | 'NOT_OFFERED_THIS_SEMESTER'
  | 'CREDIT_LIMIT_EXCEEDED';

export type RecommendationCourse = Course & { _id?: unknown };

export interface AcademicRecommendationContext {
  courses: readonly RecommendationCourse[];
  completedCourses: readonly string[];
  failedCourses: readonly string[];
  inProgressCourses?: readonly string[];
  academicLevel: CourseLevel;
  semester: Semester;
  maxCreditHours: number;
  academicWarningCount?: number;
}

export interface PrerequisiteEvaluation {
  satisfied: boolean;
  required: string[];
  missing: string[];
}

export interface SchedulingEvaluation {
  offered: boolean;
  conflict: boolean;
}

export type RecommendationCategory =
  | 'FAILED_COURSE'
  | 'FAILED_PREREQUISITE'
  | 'REQUIRED_CURRENT_SEMESTER'
  | 'REQUIRED_EARLIER_SEMESTER'
  | 'REQUIRED_NEXT_SEMESTER'
  | 'ELECTIVE'
  | 'MIN_HOURS_FILLER';

export interface AcademicCourseRecommendation {
  courseId?: string;
  courseCode: string;
  courseName?: string;
  courseNameAr?: string;
  courseNameEn?: string;
  category: RecommendationCategory;
  score: number;
  priority: RecommendationPriority;
  eligible: boolean;
  isRecommendedForSemester: boolean;
  reasonCodes: RecommendationReasonCode[];
  explanation: string;
  warnings: string[];
  blockedReasons: string[];
  prerequisiteEvaluation: PrerequisiteEvaluation;
  schedulingEvaluation: SchedulingEvaluation;
  creditHours: number;
}

export interface AcademicRecommendationProvider {
  generate(
    context: AcademicRecommendationContext,
  ): AcademicCourseRecommendation[];
}
