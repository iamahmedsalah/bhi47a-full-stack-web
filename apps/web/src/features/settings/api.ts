import api from "@/lib/api";

export interface GpaRuleItem {
  _id: string;
  minGpa: number;
  maxGpa: number;
  maxCreditHours: number;
  minCreditHours: number;
  minCourses: number;
  maxCourses: number;
  requiresAdvisor: boolean;
  requireForFailedCourses: boolean;
  requireForAcademicWarnings: boolean;
  academicWarningThreshold: number;
  requireForIncompleteCourses: boolean;
  requireForGraduationPlans: boolean;
  requireForSummerRegistration: boolean;
  exemptNewStudentsFromGpaRule: boolean;
  isActive: boolean;
}

export interface RegistrationTermItem {
  _id: string;
  academicYear: string;
  semester: string;
  isOpen: boolean;
  isCurrent?: boolean;
  opensAt?: string;
  closesAt?: string;
  startDate?: string;
  endDate?: string;
}

export interface AiSettingsItem {
  studentAdvisorEnabled: boolean;
  studentAdvisorConfigured?: boolean;
  provider: string;
  model: string;
  apiKeyConfigured: boolean;
  usage: {
    allTimeTokens: number;
    allTimeRequests: number;
    allTimeErrors: number;
    currentMonthTokens: number;
    currentMonthRequests: number;
    monthlyTokenBudget: number | null;
    remainingTokens: number | null;
    usagePercent: number | null;
    periodStart: string;
  };
}

export interface AdvisingRulesItem {
  maxCoursesLimit: number;
  preventHigherLevelCourses: boolean;
  allowLowGradeImprovementFallback: boolean;
  enforceDepartmentLevel3And4: boolean;
  probationMaxCredits: number;
  regularMaxCredits: number;
  graduatingMaxCredits: number;
  summerMaxCredits: number;
  summerProbationMaxCredits: number;
}

export const settingsKeys = {
  gpaRules: ["admin-gpa-rules"] as const,
  registrationTerms: ["admin-registration-terms"] as const,
  aiSettings: ["admin-ai-settings"] as const,
  advisingRules: ["admin-advising-rules"] as const,
  portalSettings: ["admin-portal-settings"] as const,
  publicPortalSettings: ["portal-settings"] as const,
};

export async function getAdvisingRules(): Promise<AdvisingRulesItem> {
  const response = await api.get<AdvisingRulesItem>("/admin/advising/rules");
  return response.data;
}

export async function updateAdvisingRules(
  dto: Partial<AdvisingRulesItem>,
): Promise<AdvisingRulesItem> {
  const response = await api.patch<AdvisingRulesItem>("/admin/advising/rules", dto);
  return response.data;
}

export async function listGpaRules(): Promise<GpaRuleItem[]> {
  const response = await api.get<GpaRuleItem[]>("/admin/gpa-rules");
  return response.data;
}

export async function createGpaRule(
  dto: Partial<GpaRuleItem>,
): Promise<GpaRuleItem> {
  const response = await api.post<GpaRuleItem>("/admin/gpa-rules", dto);
  return response.data;
}

export async function updateGpaRule(
  id: string,
  dto: Partial<GpaRuleItem>,
): Promise<GpaRuleItem> {
  const response = await api.patch<GpaRuleItem>(`/admin/gpa-rules/${id}`, dto);
  return response.data;
}

export async function deleteGpaRule(id: string): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(
    `/admin/gpa-rules/${id}`,
  );
  return response.data;
}

export interface AcademicYearGroup {
  academicYear: string;
  isCurrent: boolean;
  terms: RegistrationTermItem[];
  registrationCount: number;
  advisingCaseCount: number;
}

export async function listRegistrationTerms(): Promise<RegistrationTermItem[]> {
  const response = await api.get<RegistrationTermItem[]>(
    "/admin/registration-terms",
  );
  return response.data;
}

export async function listAcademicYears(): Promise<AcademicYearGroup[]> {
  const response = await api.get<AcademicYearGroup[]>('/admin/academic-years');
  return response.data;
}

export async function createAcademicYear(dto: {
  academicYear: string;
  makeCurrent?: boolean;
}): Promise<AcademicYearGroup[]> {
  const response = await api.post<AcademicYearGroup[]>('/admin/academic-years', dto);
  return response.data;
}

export async function setCurrentAcademicYear(
  academicYear: string,
): Promise<AcademicYearGroup[]> {
  const response = await api.patch<AcademicYearGroup[]>(
    `/admin/academic-years/${academicYear}/current`,
  );
  return response.data;
}

export async function deleteAcademicYear(
  academicYear: string,
): Promise<{ deleted: boolean; academicYear: string }> {
  const response = await api.delete<{ deleted: boolean; academicYear: string }>(
    `/admin/academic-years/${academicYear}`,
  );
  return response.data;
}

export async function toggleRegistrationTerm(
  id: string,
  isOpen: boolean,
): Promise<RegistrationTermItem> {
  const response = await api.patch<RegistrationTermItem>(
    `/admin/registration-terms/${id}`,
    { isOpen },
  );
  return response.data;
}

export async function updateRegistrationTermWindow(
  id: string,
  payload: {
    isOpen?: boolean;
    opensAt?: string | null;
    closesAt?: string | null;
  },
): Promise<RegistrationTermItem> {
  const response = await api.patch<RegistrationTermItem>(
    `/admin/registration-terms/${id}`,
    payload,
  );
  return response.data;
}

export async function getAiSettings(): Promise<AiSettingsItem> {
  const response = await api.get<AiSettingsItem>("/admin/ai/settings");
  return response.data;
}

export async function updateAiSettings(
  studentAdvisorEnabled: boolean,
): Promise<AiSettingsItem> {
  const response = await api.patch<AiSettingsItem>("/admin/ai/settings", {
    studentAdvisorEnabled,
  });
  return response.data;
}

export interface PortalSettingsItem {
  registrationVisible: boolean;
  syllabiVisible: boolean;
}

export async function getPortalSettings(): Promise<PortalSettingsItem> {
  const response = await api.get<PortalSettingsItem>("/admin/portal-settings");
  return response.data;
}

export async function getPublicPortalSettings(): Promise<PortalSettingsItem> {
  const response = await api.get<PortalSettingsItem>("/portal-settings");
  return response.data;
}

export async function updatePortalSettings(
  dto: Partial<PortalSettingsItem>,
): Promise<PortalSettingsItem> {
  const response = await api.patch<PortalSettingsItem>(
    "/admin/portal-settings",
    dto,
  );
  return response.data;
}

export interface ResetAcademicRecordsResult {
  success: boolean;
  warningsResetCount: number;
  gpaResetCount: number;
  message: string;
}

export async function resetAcademicRecords(options: {
  resetWarnings?: boolean;
  resetGpa?: boolean;
}): Promise<ResetAcademicRecordsResult> {
  const response = await api.post<ResetAcademicRecordsResult>(
    "/admin/students/reset-academic-records",
    options,
  );
  return response.data;
}
