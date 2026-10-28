export interface CourseEnrollmentLimitDetails {
  currentCourseCount: number;
  proposedCourseCount: number;
  currentCreditHours: number;
  proposedCreditHours: number;
  maxCourses: number;
  maxCreditHours: number;
}

export interface CourseEnrollmentIssue {
  row: number;
  code: 'REGISTRATION_LIMIT_EXCEEDED' | 'VALIDATION_ERROR';
  message: string;
  limits?: CourseEnrollmentLimitDetails;
}

export interface CourseEnrollmentResult {
  courseId: string;
  courseCode: string;
  courseName: string;
  totalRows: number;
  enrolledCount: number;
  alreadyEnrolledCount: number;
  skippedBlockedCount: number;
  overriddenCount?: number;
  errorCount: number;
  errors: string[];
  issues?: CourseEnrollmentIssue[];
}
