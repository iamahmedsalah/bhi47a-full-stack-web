import api from "@/lib/api";

export interface HistoricalPublicationScope {
  academicYear: string;
  semester: "first" | "second" | "summer";
  level: string;
}
export interface HistoricalPublicationPreview {
  scope: HistoricalPublicationScope;
  digest: string;
  totalStudents: number;
  courseAttempts: number;
  totalMarks: number;
  unpublishedMarks: number;
  alreadyPublishedMarks: number;
  issueCount: number;
  issues: string[];
  canPublish: boolean;
}
export interface HistoricalPublicationJob {
  id: string;
  scope: HistoricalPublicationScope;
  status: "pending" | "complete";
  publishedAt: string;
  gradeCount: number;
  totalStudents: number;
  processedStudents: number;
  reconciliationPending: boolean;
}
const historicalPublicationPath = "/admin/grades/historical-publication";
export async function previewHistoricalPublication(
  scope: HistoricalPublicationScope,
) {
  return (
    await api.post<HistoricalPublicationPreview>(
      `${historicalPublicationPath}/preview`,
      scope,
    )
  ).data;
}
export async function latestHistoricalPublication(
  scope: HistoricalPublicationScope,
) {
  return (
    await api.post<{ job: HistoricalPublicationJob | null }>(
      `${historicalPublicationPath}/status`,
      scope,
    )
  ).data;
}
export async function publishHistoricalPublication(
  scope: HistoricalPublicationScope,
  digest: string,
) {
  return (
    await api.post<HistoricalPublicationJob>(
      `${historicalPublicationPath}/publish`,
      { ...scope, digest },
    )
  ).data;
}
export async function processHistoricalPublication(id: string) {
  return (
    await api.post<HistoricalPublicationJob>(
      `${historicalPublicationPath}/${encodeURIComponent(id)}/process`,
      {},
    )
  ).data;
}

export interface GradeItem {
  _id: string;
  studentCode: string;
  studentName?: string;
  courseCode: string;
  courseName?: string;
  examType: string;
  grade: number;
  maxGrade: number;
  percentage?: number;
  letterGrade?: string;
  gradePoints?: number;
  status: string;
  academicYear: string;
  semester: string;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListGradesResponse {
  items: GradeItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const gradeKeys = {
  all: ["admin-grades"] as const,
  list: (params?: Record<string, unknown>) =>
    [...gradeKeys.all, "list", params] as const,
};

export async function listAdminGrades(
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ListGradesResponse> {
  const response = await api.get<ListGradesResponse>("/admin/grades", {
    params,
    signal,
  });
  return response.data;
}

export async function saveGrade(
  dto: Record<string, unknown>,
): Promise<GradeItem> {
  const response = await api.post<GradeItem>("/admin/grades", dto);
  return response.data;
}

export async function updateGrade(
  id: string,
  dto: Record<string, unknown>,
): Promise<GradeItem> {
  const response = await api.patch<GradeItem>(`/admin/grades/${id}`, dto);
  return response.data;
}

export async function deleteGrade(id: string): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(`/admin/grades/${id}`);
  return response.data;
}

export async function publishGradesBulk(
  dto: Record<string, unknown>,
): Promise<{ modifiedCount: number }> {
  if (dto.isPublished && !dto.releaseDigests) {
    const preview = await api.post<{ releaseDigests: Record<string, string> }>(
      "/admin/grades/release-preview",
      dto,
    );
    dto = { ...dto, releaseDigests: preview.data.releaseDigests };
  }
  const response = await api.post<{ modifiedCount: number }>(
    "/admin/grades/publish",
    dto,
  );
  return response.data;
}

export interface StudentPromotionEvaluation {
  studentId: string;
  studentCode: string;
  studentName: string;
  currentLevel: string;
  targetLevel: string;
  promoted: boolean;
  willPromote: boolean;
  gpa: number;
  completedCredits: number;
  totalFailedCount: number;
  carriedFailedCourseCodes: string[];
  carriedFailedCourses: string[];
  missingCourseCodes: string[];
  missingMandatoryCourses: string[];
  reasonCode: string;
  reasonAr: string;
  reasonEn: string;
}

export interface AcademicProgressRecalculateResult {
  dryRun: boolean;
  maxAllowedCarriedCourses: number;
  processed: number;
  promotedCount: number;
  retainedCount: number;
  students: StudentPromotionEvaluation[];
}

export async function recalculateAcademicProgress(options?: {
  studentCode?: string;
  dryRun?: boolean;
  maxAllowedCarriedCourses?: number;
}): Promise<AcademicProgressRecalculateResult> {
  const response = await api.post<AcademicProgressRecalculateResult>(
    "/admin/grades/recalculate-progress",
    options ?? {},
  );
  return response.data;
}

export interface AuditAcademicWarningsResult {
  totalAudited: number;
  warnedCount: number;
  clearedCount: number;
  goodStandingCount: number;
  dryRun: boolean;
  details: Array<{
    studentId: string;
    studentCode: string;
    studentName: string;
    gpa: number;
    previousWarnings: number;
    newWarnings: number;
    status: "WARNED" | "CLEARED" | "GOOD_STANDING";
    isActionRequired: boolean;
  }>;
}

export async function auditAcademicWarnings(options?: {
  dryRun?: boolean;
}): Promise<AuditAcademicWarningsResult> {
  const response = await api.post<AuditAcademicWarningsResult>(
    "/admin/grades/audit-warnings",
    options ?? {},
  );
  return response.data;
}

export interface GradesSettingsData {
  gradesLevelBasis?: "student" | "course";
  gradesSystemOpen: boolean;
  gradesOpenAt?: string | null;
  gradesCloseAt?: string | null;
  gradesPublishedLevels: string[];
  gradesPublishedExamTypes?: import("@student-portal/shared").ExamType[];
  gradesVisibilityRules?: import("@student-portal/shared").GradeVisibilityRule[];
}

export async function getGradesSettings(): Promise<GradesSettingsData> {
  const response = await api.get<GradesSettingsData>("/admin/grades/settings");
  return response.data;
}

export async function updateGradesSettings(
  dto: Partial<GradesSettingsData>,
): Promise<GradesSettingsData> {
  const response = await api.patch<GradesSettingsData>(
    "/admin/grades/settings",
    dto,
  );
  return response.data;
}

export interface StudentResultsStatusData {
  provisional?: boolean;
  visibleExamTypes?: Array<"midterm" | "final">;
  visibilityVersion?: string;
  isOpen: boolean;
  reason?:
    | "system_closed"
    | "not_started"
    | "ended"
    | "level_not_published"
    | "tuition_blocked"
    | "student_blocked";
  openAt?: string;
  closeAt?: string;
  studentLevel: string;
  isLevelPublished: boolean;
}

export async function getStudentResultsStatus(): Promise<StudentResultsStatusData> {
  const response = await api.get<StudentResultsStatusData>(
    "/students/me/results-window",
  );
  return response.data;
}
