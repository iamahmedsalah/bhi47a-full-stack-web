export const ANALYTICS_LOCALES = {
  AR: "ar",
  EN: "en",
} as const;

export type AnalyticsLocale =
  (typeof ANALYTICS_LOCALES)[keyof typeof ANALYTICS_LOCALES];

/** Stable export identifiers; localized worksheet names are presentation only. */
export const ANALYTICS_REPORT_SHEETS = [
  "info",
  "kpis",
  "departments",
  "cohorts",
  "gpa",
  "enrollment",
  "quizzes",
  "staffQuizzes",
  "courses",
  "students",
  "submissions",
  "complaints",
] as const;
export type AnalyticsReportSheet = (typeof ANALYTICS_REPORT_SHEETS)[number];

export interface StaffQuizStats {
  staffId: string;
  staffName: string;
  staffNameAr?: string;
  staffType?: string;
  role?: string;
  assignedCoursesCount: number;
  quizzesCreatedCount: number;
  publishedQuizzesCount: number;
  draftQuizzesCount: number;
  totalEligibleStudents: number;
  totalSubmissions: number;
  avgParticipationRate: number;
  avgPassRate: number;
  avgScorePercentage: number;
  lastQuizCreatedAt?: string | Date | null;
}

export interface QuizItemAnalytics {
  quizId: string;
  quizTitle: string;
  quizTitleAr?: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  creatorId: string;
  creatorName: string;
  creatorNameAr?: string;
  creatorStaffType?: string;
  academicYear?: string;
  semester?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  isPublished: boolean;
  questionsCount: number;
  eligibleCount: number;
  startedCount: number;
  submittedCount: number;
  notStartedCount: number;
  passedCount: number;
  failedCount: number;
  participationRate: number;
  passRate: number;
  avgScore: number;
  avgPercentage: number;
  highestScore: number;
  lowestScore: number;
  avgDurationSeconds: number;
  terminatedByExitCount: number;
  timedOutCount: number;
}

export interface CourseItemAnalytics {
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  department: string;
  level: string;
  creditHours: number;
  doctorNames: string[];
  teachingAssistantNames: string[];
  enrolledStudentsCount: number;
  quizzesCount: number;
  avgQuizParticipationRate: number;
  avgQuizPassRate: number;
  midtermGradedCount: number;
  midtermAbsentCount: number;
  midtermPassRate: number;
  finalGradedCount: number;
  finalAbsentCount: number;
  finalPassRate: number;
  overallPassRate: number;
  avgAttendanceRate?: number;
}

export interface AcademicAnalyticsOverview {
  kpis: {
    totalStudents: number;
    activeStudents: number;
    activeRate: number;
    suspendedStudents: number;
    withdrawnStudents: number;
    graduatedStudents: number;
    totalCourses: number;
    activeCourses: number;
    totalStaff: number;
    doctorCount: number;
    assistantLecturerCount: number;
    teachingAssistantCount: number;
    totalQuizzes: number;
    publishedQuizzes: number;
    activeQuizzes: number;
    avgQuizParticipationRate: number;
    avgQuizPassRate: number;
    totalComplaints: number;
    resolvedComplaints: number;
    complaintResolutionRate: number;
    urgentComplaints: number;
  };
  quizzesTopPerforming: QuizItemAnalytics[];
  staffPerformance: StaffQuizStats[];
  coursePerformance: CourseItemAnalytics[];
  generatedAt: string;
}
