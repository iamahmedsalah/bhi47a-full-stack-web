import api, { type ApiEnvelope } from '@/lib/api';
import type { ExamType, Semester } from '@student-portal/shared';

export type WipeTarget =
  | 'grades'
  | 'quizzes'
  | 'attendance'
  | 'students'
  | 'complaints'
  | 'all';

export type GradeWipeExamType = ExamType | 'total';
export type WipeSemester = 'all' | Semester;
export type GradeSourceScope = 'all' | 'historical_only' | 'non_control_only';
export type QuizWipeScope =
  | 'attempts_and_submissions'
  | 'all_quizzes_and_submissions'
  | 'legacy_course_quizzes'
  | 'everything';
export type AttendanceWipeScope =
  | 'qr_sessions_and_records'
  | 'legacy_attendance'
  | 'everything';
export type ComplaintWipeScope = 'resolved_and_closed' | 'all';

export interface WipeSummary {
  studentsCount: number;
  gradesCount: number;
  attendanceCount: number;
  registrationsCount: number;
  advisingCasesCount: number;
  quizzesCount: number;
  complaintsCount: number;
  resolvedClosedComplaintsCount: number;
  controlSheetsCount: number;
  protectedControlSheetsCount: number;
  quizzesBreakdown: {
    quizzes: number;
    quizAttempts: number;
    quizSubmissions: number;
    legacyCourseQuizzes: number;
  };
  attendanceBreakdown: {
    sessions: number;
    openSessions: number;
    records: number;
    legacyAttendance: number;
  };
  gradesByYear: Array<{ academicYear: string; count: number }>;
  gradesByExamType: Record<string, number>;
  availableAcademicYears: string[];
  quizAcademicYears: string[];
  attendanceAcademicYears: string[];
  availableLevels: Array<{ level: string; count: number }>;
}

export interface WipePreviewPayload {
  target: WipeTarget;
  academicYears?: string[];
  semester?: WipeSemester;
  examTypes?: GradeWipeExamType[];
  sourceScope?: GradeSourceScope;
  includeApprovedControl?: boolean;
  quizScope?: QuizWipeScope;
  attendanceScope?: AttendanceWipeScope;
  includeOpenAttendanceSessions?: boolean;
  complaintScope?: ComplaintWipeScope;
  olderThan?: string;
  levels?: string[];
}

export interface WipeExecutePayload extends WipePreviewPayload {
  reason?: string;
}

export interface WipeBreakdownItem {
  key: string;
  labelAr: string;
  labelEn: string;
  count: number;
}

export interface WipePreviewResponse {
  target: WipeTarget;
  totalToDelete: number;
  remainingSafeCount: number;
  affectedStudentsCount: number;
  protectedCount: number;
  protectedControlSheetsCount: number;
  protectedControlGradesCount: number;
  protectedOpenSessionsCount: number;
  breakdown: WipeBreakdownItem[];
  examTypeBreakdown?: Array<{ examType: string; count: number }>;
  yearBreakdown?: Array<{ academicYear: string; count: number }>;
}

export interface WipeExecuteResponse {
  success: boolean;
  target: WipeTarget;
  deletedCounts: Record<string, number>;
  totalDeleted: number;
  protectedControlGradesCount?: number;
  protectedOpenSessionsCount?: number;
}

function unwrapEnvelope<T>(raw: unknown): T {
  if (
    raw &&
    typeof raw === 'object' &&
    'data' in raw &&
    (raw as ApiEnvelope<T>).data !== undefined
  ) {
    return (raw as ApiEnvelope<T>).data;
  }
  return raw as T;
}

export async function getWipeSummary(): Promise<WipeSummary> {
  const raw = await api.get<WipeSummary>('/admin/uploads/wipe-summary');
  return unwrapEnvelope<WipeSummary>(raw);
}

export async function previewWipe(
  payload: WipePreviewPayload,
): Promise<WipePreviewResponse> {
  const raw = await api.post<WipePreviewResponse>(
    '/admin/uploads/wipe-preview',
    payload,
  );
  return unwrapEnvelope<WipePreviewResponse>(raw);
}

export async function executeWipe(
  payload: WipeExecutePayload,
): Promise<WipeExecuteResponse> {
  const raw = await api.post<WipeExecuteResponse>(
    '/admin/uploads/wipe',
    payload,
  );
  return unwrapEnvelope<WipeExecuteResponse>(raw);
}
