import api from '@/lib/api';

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
  startDate?: string;
  endDate?: string;
}

export interface StaffUserItem {
  _id: string;
  userCode?: string;
  name: string;
  email?: string;
  role: 'admin' | 'staff';
  permissions?: string[];
}

export const settingsKeys = {
  gpaRules: ['admin-gpa-rules'] as const,
  registrationTerms: ['admin-registration-terms'] as const,
  staffUsers: ['admin-staff-users'] as const,
};

export async function listGpaRules(): Promise<GpaRuleItem[]> {
  const response = await api.get<GpaRuleItem[]>('/admin/gpa-rules');
  return response.data;
}

export async function createGpaRule(dto: Partial<GpaRuleItem>): Promise<GpaRuleItem> {
  const response = await api.post<GpaRuleItem>('/admin/gpa-rules', dto);
  return response.data;
}

export async function updateGpaRule(id: string, dto: Partial<GpaRuleItem>): Promise<GpaRuleItem> {
  const response = await api.patch<GpaRuleItem>(`/admin/gpa-rules/${id}`, dto);
  return response.data;
}

export async function deleteGpaRule(id: string): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(`/admin/gpa-rules/${id}`);
  return response.data;
}

export async function listRegistrationTerms(): Promise<RegistrationTermItem[]> {
  const response = await api.get<RegistrationTermItem[]>('/admin/registration-terms');
  return response.data;
}

export async function toggleRegistrationTerm(id: string, isOpen: boolean): Promise<RegistrationTermItem> {
  const response = await api.patch<RegistrationTermItem>(`/admin/registration-terms/${id}`, { isOpen });
  return response.data;
}

export async function listStaffUsers(): Promise<StaffUserItem[]> {
  const response = await api.get<StaffUserItem[]>('/admin/staff');
  return response.data;
}

export async function updateStaffPermissions(staffId: string, permissions: string[]): Promise<StaffUserItem> {
  const response = await api.patch<StaffUserItem>(`/admin/staff/${staffId}/permissions`, { permissions });
  return response.data;
}
