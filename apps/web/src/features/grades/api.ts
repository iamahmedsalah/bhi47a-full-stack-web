import api from '@/lib/api';

export interface GradeItem {
  _id: string;
  studentCode: string;
  studentName?: string;
  courseCode: string;
  courseName?: string;
  examType: string;
  grade: number;
  maxGrade: number;
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
  all: ['admin-grades'] as const,
  list: (params?: Record<string, unknown>) => [...gradeKeys.all, 'list', params] as const,
};

export async function listAdminGrades(params?: Record<string, unknown>): Promise<ListGradesResponse> {
  const response = await api.get<ListGradesResponse>('/admin/grades', { params });
  return response.data;
}

export async function saveGrade(dto: Record<string, unknown>): Promise<GradeItem> {
  const response = await api.post<GradeItem>('/admin/grades', dto);
  return response.data;
}

export async function updateGrade(id: string, dto: Record<string, unknown>): Promise<GradeItem> {
  const response = await api.patch<GradeItem>(`/admin/grades/${id}`, dto);
  return response.data;
}

export async function deleteGrade(id: string): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(`/admin/grades/${id}`);
  return response.data;
}

export async function publishGradesBulk(dto: Record<string, unknown>): Promise<{ modifiedCount: number }> {
  const response = await api.post<{ modifiedCount: number }>('/admin/grades/publish', dto);
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
    '/admin/grades/recalculate-progress',
    options ?? {},
  );
  return response.data;
}
