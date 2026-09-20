import type { PaginatedResponse } from '@/lib/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';

export interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  nationalIdMasked?: string;
  nationalId?: string;
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  nationalIdMasked?: string;
  nationalId?: string;
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
  examType: string;
  grade: number;
  maxGrade: number;
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
  enrollmentStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StudentWritePayload {
  studentCode?: string;
  fullName: string;
  nationalId?: string;
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

export function listStudentGrades(studentCode: string, limit = 100) {
  return apiGet<PaginatedResponse<GradeSummary>>('/admin/grades', {
    params: { studentCode, limit },
  });
}

export function listStudentComplaints(studentCode: string, limit = 50) {
  return apiGet<PaginatedResponse<ComplaintSummary>>('/admin/complaints', {
    params: { search: studentCode, limit },
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
  return apiPatch<Student, StudentWritePayload>(`/admin/students/${id}`, payload);
}

export function resetStudentPassword(id: string, newPassword: string, mustChangePassword = false) {
  return apiPost<{ message?: string }, { newPassword: string; mustChangePassword: boolean }>(
    `/admin/students/${id}/reset-password`,
    { newPassword, mustChangePassword },
  );
}

export function deactivateStudent(id: string) {
  return apiDelete(`/admin/students/${id}`);
}

export function activateStudent(id: string) {
  return apiPost<Student>(`/admin/students/${id}/activate`);
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
