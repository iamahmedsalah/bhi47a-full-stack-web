import api, { type PaginatedResponse } from '@/lib/api';
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
  fullNameAr?: string;
  fullNameEn?: string;
  nationalIdMasked?: string;
  nationalId?: string;
  phone?: string;
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
  fullName?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalId?: string;
  phone?: string;
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

  // Handle axios response interceptor unwrapping:
  // If response interceptor returned response.data, raw is already the Blob.
  // Otherwise if raw is an AxiosResponse object, extract raw.data.
  const rawRecord =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  let blob: Blob;
  if (raw instanceof Blob) {
    blob = raw;
  } else if (rawRecord && rawRecord.data instanceof Blob) {
    blob = rawRecord.data;
  } else if (rawRecord && rawRecord.data !== undefined) {
    blob = new Blob([rawRecord.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  } else {
    blob = new Blob([raw as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // Check if server returned an error JSON disguised as blob
  if (blob.type.includes('application/json')) {
    const errorText = await blob.text();
    try {
      const errObj = JSON.parse(errorText) as Record<string, unknown>;
      const msg = typeof errObj.message === 'string' ? errObj.message : '';
      throw new Error(msg || 'فشل تصدير كشف الطلاب');
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'فشل تصدير كشف الطلاب') throw e;
      throw new Error(errorText || 'فشل تصدير كشف الطلاب');
    }
  }

  if (blob.size === 0) {
    throw new Error('الملف المستلم فارغ');
  }

  const filename = buildStudentExportSlug({
    level: params.level,
    enrollmentStatus: params.enrollmentStatus,
    search: params.search,
    ext: 'xlsx',
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
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
