import api, { type PaginatedResponse } from '@/lib/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { downloadFileBlob, EXCEL_MIME_TYPE } from '@/lib/export-utils';

export interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  address?: string;
  guardians?: Array<{ name: string; relation: string; phone: string }>;
  nationalIdMasked?: string;
  nationalId?: string;
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalIdMasked?: string;
  nationalId?: string;
  phone?: string;
  address?: string;
  guardians?: Array<{ name: string; relation: string; phone: string }>;
  academicEmail?: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: StudentUserRef | string;
  registrationSummary?: {
    academicYear?: string;
    semester?: string;
    isTermOpen: boolean;
    status: string;
    registrationId?: string;
    courseCount: number;
    totalCreditHours: number;
    advisingCaseId?: string;
    advisingStatus: string;
  };
  gpa?: number;
  academicWarnings?: number;
  academicProfile?: {
    gpa?: number;
    academicWarnings?: number;
    completedCourses?: string[];
    failedCourses?: string[];
  };
}

export interface GradeSummary {
  _id: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
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
}

export interface ComplaintSummary {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
}

export interface AcademicEmailSummary {
  _id: string;
  academicEmail: string;
  status: string;
}

export interface StudentListParams {
  page?: number;
  limit?: number;
  search?: string;
  level?: string;
  department?: string;
  group?: string;
  enrollmentStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StudentWritePayload {
  studentCode?: string;
  fullName?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalId?: string;
  phone?: string;
  address?: string;
  guardians?: Array<{ name: string; relation: string; phone: string }>;
  academicEmail?: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  enrollmentStatus?: string;
  mustChangePassword?: boolean;
}

export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (params: StudentListParams) => [...studentKeys.lists(), params] as const,
  detail: (id?: string) => [...studentKeys.all, 'detail', id] as const,
  grades: (studentCode?: string) =>
    [...studentKeys.all, 'grades', studentCode] as const,
  complaints: (studentCode?: string) =>
    [...studentKeys.all, 'complaints', studentCode] as const,
  academicEmail: (studentCode?: string) =>
    [...studentKeys.all, 'academic-email', studentCode] as const,
};

export function listStudents(params: StudentListParams) {
  return apiGet<PaginatedResponse<Student>>('/admin/students', { params });
}

export function getStudent(id: string) {
  return apiGet<Student>(`/admin/students/${id}`);
}

export function deleteStudent(id: string) {
  return apiDelete<{ success: boolean; message: string }>(`/admin/students/${id}`);
}

export async function listStudentGrades(studentCode: string, limit = 100) {
  const pageSize = Math.min(100, Math.max(1, limit));
  const first = await apiGet<PaginatedResponse<GradeSummary>>('/admin/grades', {
    params: { studentCode, limit: pageSize, page: 1 },
  });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await apiGet<PaginatedResponse<GradeSummary>>('/admin/grades', {
      params: { studentCode, limit: pageSize, page },
    });
    items.push(...next.items);
  }
  return { ...first, items };
}

export function listStudentComplaints(studentCode: string, limit = 50) {
  return apiGet<PaginatedResponse<ComplaintSummary>>('/admin/complaints', {
    params: { search: studentCode, limit, view: 'summary' },
  });
}

export async function getStudentAcademicEmail(studentCode: string) {
  const response = await apiGet<PaginatedResponse<AcademicEmailSummary>>(
    '/admin/academic-emails',
    { params: { search: studentCode, limit: 5 } },
  );
  return response.items[0] ?? null;
}

export function createStudent(payload: StudentWritePayload) {
  return apiPost<Student, StudentWritePayload>('/admin/students', payload);
}

export function updateStudent(id: string, payload: StudentWritePayload) {
  const rest = { ...payload };
  delete rest.studentCode;
  const cleanPayload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (key !== 'studentCode' && val !== undefined && val !== '') {
      cleanPayload[key] = val;
    }
  }
  return apiPatch<Student, typeof cleanPayload>(`/admin/students/${id}`, cleanPayload);
}

export function resetStudentPassword(id: string, newPassword?: string, mustChangePassword = true) {
  return apiPost<{ message?: string; mustChangePassword?: boolean }, { newPassword?: string; mustChangePassword?: boolean }>(
    `/admin/students/${id}/reset-password`,
    { ...(newPassword ? { newPassword } : {}), mustChangePassword },
  );
}

export function deactivateStudent(id: string) {
  return apiDelete(`/admin/students/${id}`);
}

export function activateStudent(id: string) {
  return apiPost<Student>(`/admin/students/${id}/activate`);
}

export function transferDepartment(payload: {
  studentIds: string[];
  targetDepartment: string;
  targetLevel?: string;
}) {
  return apiPost<{ updatedCount: number; message: string }, typeof payload>(
    '/admin/students/transfer-department',
    payload,
  );
}

export function buildStudentExportSlug(params: {
  level?: string;
  enrollmentStatus?: string;
  search?: string;
  ext?: string;
}): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const parts: string[] = ['students-registry'];

  if (params.level && params.level !== 'all') {
    parts.push(`level-${params.level}`);
  }

  if (params.enrollmentStatus && params.enrollmentStatus !== 'all') {
    parts.push(
      params.enrollmentStatus.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    );
  }

  if (params.search && params.search.trim()) {
    const cleanSearch = params.search
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
    if (cleanSearch) parts.push(cleanSearch);
  }

  parts.push(dateStr);
  const ext = params.ext || 'xlsx';
  return `${parts.join('-')}.${ext}`;
}

export async function exportStudentsStreamingExcel(
  params: Omit<StudentListParams, 'page' | 'limit'>,
) {
  const queryParams: Record<string, string> = {};
  if (params.search) queryParams.search = params.search;
  if (params.level && params.level !== 'all') queryParams.level = params.level;
  if (params.enrollmentStatus && params.enrollmentStatus !== 'all') {
    queryParams.enrollmentStatus = params.enrollmentStatus;
  }

  const raw = (await api.get('/admin/students/export/excel', {
    params: queryParams,
    responseType: 'blob',
  })) as unknown;

  const filename = buildStudentExportSlug({
    level: params.level,
    enrollmentStatus: params.enrollmentStatus,
    search: params.search,
    ext: 'xlsx',
  });

  await downloadFileBlob(raw, filename, EXCEL_MIME_TYPE);
}

export async function listAllStudentsForExport(
  params: Omit<StudentListParams, 'page'>,
) {
  const firstPage = await listStudents({ ...params, page: 1 });
  const pages = [firstPage.items];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const response = await listStudents({ ...params, page });
    pages.push(response.items);
  }

  return pages.flat();
}

export interface MustChangePasswordSummary {
  totalStudents: number;
  mustChangeCount: number;
  allEnabled: boolean;
  anyEnabled: boolean;
}

export function setStudentPasswordRequirement(studentCode: string, enabled: boolean) {
  return apiPost<{ studentCode: string; enabled: boolean }>(
    '/admin/students-password-requirement',
    { studentCode, enabled },
  );
}

export function getMustChangePasswordCodes(page = 1) {
  return apiGet<{ items: string[]; total: number; totalPages: number }>('/admin/students-must-change-password-codes', { params: { page, limit: 100 } });
}

export async function getMustChangePasswordSummary(): Promise<MustChangePasswordSummary> {
  return apiGet<MustChangePasswordSummary>(
    '/admin/students-must-change-password-summary',
  );
}

export async function toggleAllMustChangePassword(
  enabled: boolean,
): Promise<{ enabled: boolean; modifiedCount: number }> {
  return apiPost<{ enabled: boolean; modifiedCount: number }>(
    '/admin/students-toggle-all-must-change-password',
    { enabled },
  );
}
