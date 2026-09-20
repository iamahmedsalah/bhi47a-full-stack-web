export type AdvisingStatus =
  | "NOT_STARTED"
  | "AUTO_RECOMMENDED"
  | "ASSIGNED"
  | "UNDER_REVIEW"
  | "DRAFT"
  | "WAITING_FOR_STUDENT"
  | "REVISION_REQUESTED"
  | "APPROVED"
  | "REGISTERED"
  | "CLOSED";
export interface AdvisingStudent {
  id: string;
  name: string;
  studentCode?: string;
  avatarUrl?: string;
  department?: string;
  academicLevel: string;
  semester: string;
  academicYear?: string;
  gpa: number;
  failedCourseCount: number;
  warningCount: number;
  expectedGraduation: boolean;
  advisingStatus: AdvisingStatus;
  caseId?: string;
  assignedAdvisorId?: string;
}
export interface AdvisingCourseMap {
  student: {
    name?: string;
    studentCode?: string;
    avatarUrl?: string;
    gpa: number;
    academicLevel: string;
    semester: string;
  };
  summary: {
    passedCourses: number;
    failedCourses: number;
    completedCredits: number;
    remainingCredits: number;
    totalProgramCredits: number;
  };
  selectedCourses: string[];
  suggestedCourses: string[];
  registration: {
    id: string;
    status: string;
    source: string;
    courses: string[];
  } | null;
  generationReadiness: {
    canGenerate: boolean;
    reason?:
      "FIRST_SEMESTER_REGISTRATION_REQUIRED" | "FIRST_SEMESTER_GRADES_REQUIRED";
    missingCourseCodes: string[];
  };
  courses: Array<
    AdvisingCourse & {
      name: string;
      progressStatus:
        | "passed"
        | "failed"
        | "low_grade"
        | "planned"
        | "recommended"
        | "not_taken";
      gradeSummary?: {
        totalGrade: number;
        totalMaxGrade: number;
        percentage: number;
        hasFinal: boolean;
        gradePoints?: number;
        exams: Array<{
          examType: string;
          grade: number;
          maxGrade: number;
          status: string;
        }>;
      };
    }
  >;
}
export interface AdvisingCase {
  _id: string;
  studentId:
    | { _id: string; name: string; studentCode?: string; avatarUrl?: string }
    | string;
  assignedAdvisorId?: { _id: string; name: string };
  academicYear: string;
  semester: string;
  status: AdvisingStatus;
  currentDraftId?: string;
  approvedPlanId?: string;
  timeline: Array<{
    status: AdvisingStatus;
    changedAt: string;
    actorId?: string;
  }>;
}
export interface AdvisingCourse {
  _id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  academicLevel?: string;
  level?: string;
  creditHours?: number;
  prerequisites?: string[];
  offeredTerms?: string[];
  semester?: string;
  type?: string;
}
export interface CourseRecommendation {
  _id: string;
  courseId: AdvisingCourse;
  category?:
    | "FAILED_COURSE"
    | "FAILED_PREREQUISITE"
    | "REQUIRED_CURRENT_SEMESTER"
    | "REQUIRED_EARLIER_SEMESTER"
    | "REQUIRED_NEXT_SEMESTER"
    | "ELECTIVE"
    | "MIN_HOURS_FILLER";
  score: number;
  priority: "HIGH" | "MEDIUM" | "LOW" | "BLOCKED";
  eligible: boolean;
  isRecommendedForSemester: boolean;
  reasonCodes?: string[];
  explanation: string;
  warnings: string[];
  blockedReasons: string[];
  accepted: boolean;
  rejected: boolean;
}
export interface GenerateRecommendationsResponse {
  recommendations: CourseRecommendation[];
  recommendedCount: number;
  recommendedCreditHours: number;
  maxCreditHours: number;
}
export interface AdvisingPlan {
  _id: string;
  title: string;
  version: number;
  status: string;
  type: string;
  totalCredits: number;
  selectedCourses: AdvisingCourse[];
  advisorNotes?: string;
  studentVisibleNotes?: string;
  validationResult?: {
    valid: boolean;
    errors: Array<
      | { code: string; message: string; severity: string; courseIds: string[] }
      | string
    >;
    warnings: Array<
      | { code: string; message: string; severity: string; courseIds: string[] }
      | string
    >;
    requiredOverrides: string[];
    totalCredits: number;
  };
}
export interface StudentAdvising {
  case: AdvisingCase;
  approvedPlan: AdvisingPlan | null;
  recommendations: CourseRecommendation[];
  notes: Array<{ _id: string; content: string; createdAt: string }>;
}

export interface AdvisingNote {
  _id: string;
  content: string;
  visibility: "INTERNAL" | "STUDENT_VISIBLE";
  createdAt: string;
  authorId?: { _id: string; name: string; role?: string } | string;
}

export interface AdvisingAuditLog {
  _id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}
