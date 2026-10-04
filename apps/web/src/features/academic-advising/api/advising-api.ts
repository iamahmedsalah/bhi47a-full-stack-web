import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type {
  AdvisingAuditLog,
  AdvisingCase,
  AdvisingCourseMap,
  AdvisingNote,
  AdvisingPlan,
  AdvisingStudent,
  CourseRecommendation,
  GenerateRecommendationsResponse,
  StudentAdvising,
} from "../types/advising.types";
export interface StudentPage {
  items: AdvisingStudent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface CasePage {
  items: AdvisingCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface RegistrationTerm {
  _id?: string;
  academicYear: string;
  semester: "first" | "second" | "summer";
  isOpen: boolean;
  isCurrent?: boolean;
  opensAt?: string;
  closesAt?: string;
}
export interface AcademicYearSummary {
  academicYear: string;
  isCurrent: boolean;
  terms: RegistrationTerm[];
  registrationCount: number;
  advisingCaseCount: number;
}
export interface AdvisorSummary {
  _id: string;
  name: string;
  email?: string;
  userCode?: string;
  assignedStudentCount: number;
  activeCaseCount: number;
}
export interface AdminRegistration {
  _id: string;
  courses: string[];
  totalCreditHours: number;
  academicYear: string;
  semester: string;
  source: "student" | "advisor";
  status: string;
  approvedAt?: string;
}
interface RegistrationPage {
  items: AdminRegistration[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export const advisingApi = {
  students: (
    search = "",
    status = "",
    level = "",
    academicYear = "",
    semester = "",
  ) =>
    apiGet<StudentPage>("/admin/advising/students", {
      params: {
        search,
        status: status || undefined,
        level: level || undefined,
        academicYear: academicYear || undefined,
        semester: semester || undefined,
        page: 1,
        limit: 50,
      },
    }),
  cases: (params?: { page?: number; limit?: number; status?: string }) =>
    apiGet<CasePage>("/admin/advising/cases", { params }),
  case: (caseId: string) =>
    apiGet<AdvisingCase>(`/admin/advising/cases/${caseId}`),
  courseMap: (caseId: string) =>
    apiGet<AdvisingCourseMap>(`/admin/advising/cases/${caseId}/course-map`),
  createCase: (studentId: string, academicYear: string, semester: string) =>
    apiPost<
      AdvisingCase,
      { studentId: string; academicYear: string; semester: string }
    >("/admin/advising/cases", { studentId, academicYear, semester }),
  updateCaseStatus: (caseId: string, status: "NOT_STARTED" | "CLOSED") =>
    apiPatch<AdvisingCase, { status: string }>(
      `/admin/advising/cases/${caseId}/status`,
      { status },
    ),
  recommendations: (caseId: string) =>
    apiGet<CourseRecommendation[]>(
      `/admin/advising/cases/${caseId}/recommendations`,
    ),
  generate: (caseId: string, maxCredits?: number) =>
    apiPost<GenerateRecommendationsResponse, { maxCredits?: number }>(
      `/admin/advising/cases/${caseId}/generate-recommendations`,
      maxCredits ? { maxCredits } : {},
    ),
  decide: (id: string, decision: "ACCEPTED" | "REJECTED" | "PENDING") =>
    apiPatch<CourseRecommendation, { decision: string }>(
      `/admin/advising/recommendations/${id}`,
      { decision },
    ),
  plans: (caseId: string) =>
    apiGet<AdvisingPlan[]>(`/admin/advising/cases/${caseId}/plans`),
  createPlan: (caseId: string, courseIds: string[]) =>
    apiPost<
      AdvisingPlan,
      { type: string; title: string; selectedCourses: string[] }
    >(`/admin/advising/cases/${caseId}/plans`, {
      type: "ADVISOR_DRAFT",
      title: "Advisor draft",
      selectedCourses: courseIds,
    }),
  validate: (planId: string) =>
    apiPost<AdvisingPlan["validationResult"]>(
      `/admin/advising/plans/${planId}/validate`,
    ),
  approve: (planId: string) =>
    apiPost<AdvisingPlan>(`/admin/advising/plans/${planId}/approve`),
  notes: (caseId: string) =>
    apiGet<AdvisingNote[]>(`/admin/advising/cases/${caseId}/notes`),
  createNote: (
    caseId: string,
    payload: { content: string; visibility: "INTERNAL" | "STUDENT_VISIBLE" },
  ) =>
    apiPost<AdvisingNote, typeof payload>(
      `/admin/advising/cases/${caseId}/notes`,
      payload,
    ),
  audit: (caseId: string) =>
    apiGet<AdvisingAuditLog[]>(`/admin/advising/cases/${caseId}/audit-logs`),
  student: () => apiGet<StudentAdvising | null>("/student/advising"),
  requestReview: () =>
    apiPost<AdvisingCase>("/student/advising/request-review"),
  acknowledge: () => apiPost<AdvisingCase>("/student/advising/acknowledge"),
  registrationTerms: () =>
    apiGet<RegistrationTerm[]>("/admin/registration-terms"),
  saveRegistrationTerm: (term: Omit<RegistrationTerm, "_id">) =>
    apiPost<RegistrationTerm, Omit<RegistrationTerm, "_id">>(
      "/admin/registration-terms",
      term,
    ),
  academicYears: () => apiGet<AcademicYearSummary[]>("/admin/academic-years"),
  createAcademicYear: (academicYear: string, makeCurrent = false) =>
    apiPost<
      AcademicYearSummary[],
      { academicYear: string; makeCurrent: boolean }
    >("/admin/academic-years", { academicYear, makeCurrent }),
  setCurrentAcademicYear: (academicYear: string) =>
    apiPatch<AcademicYearSummary[]>(
      `/admin/academic-years/${academicYear}/current`,
    ),
  deleteAcademicYear: (academicYear: string) =>
    apiDelete<{ deleted: boolean; academicYear: string }>(
      `/admin/academic-years/${academicYear}`,
    ),
  advisors: () => apiGet<AdvisorSummary[]>("/admin/advising/advisors"),
  assignStudents: (payload: {
    advisorId: string;
    studentIds: string[];
    academicYear: string;
    semester: "first" | "second" | "summer";
  }) =>
    apiPost<{ assignedCount: number }, typeof payload>(
      "/admin/advising/advisors/assign-students",
      payload,
    ),
  registrations: (studentId: string) =>
    apiGet<RegistrationPage>("/admin/registrations", {
      params: { studentId, page: 1, limit: 20 },
    }),
  proxyRegistration: (studentId: string, courseCodes: string[]) =>
    apiPost<AdminRegistration, { studentId: string; courseCodes: string[] }>(
      "/admin/registrations/proxy",
      { studentId, courseCodes },
    ),
  roster: (params: {
    search?: string;
    status?: string;
    academicLevel?: string;
    semester?: string;
  }) =>
    apiGet<{ items: AdvisingStudent[]; total: number }>(
      "/admin/registrations/roster",
      {
        params: {
          limit: 100,
          search: params.search || undefined,
          status: params.status || undefined,
          academicLevel: params.academicLevel || undefined,
          semester: params.semester || undefined,
        },
      },
    ),
};
export const advisingKeys = {
  students: (
    search: string,
    status = "",
    level = "",
    academicYear = "",
    semester = "",
  ) =>
    [
      "advising",
      "students",
      search,
      status,
      level,
      academicYear,
      semester,
    ] as const,
  cases: ["advising", "cases"] as const,
  case: (id?: string) => ["advising", "case", id] as const,
  courseMap: (id?: string) => ["advising", "course-map", id] as const,
  recommendations: (id?: string) =>
    ["advising", "recommendations", id] as const,
  plans: (id?: string) => ["advising", "plans", id] as const,
  notes: (id?: string) => ["advising", "notes", id] as const,
  audit: (id?: string) => ["advising", "audit", id] as const,
  student: ["advising", "student"] as const,
  terms: ["advising", "registration-terms"] as const,
  academicYears: ["advising", "academic-years"] as const,
  advisors: ["advising", "advisors"] as const,
  registrations: (studentId?: string) =>
    ["advising", "registrations", studentId] as const,
  roster: (filters?: Record<string, string>) =>
    ["advising", "roster", filters] as const,
};
