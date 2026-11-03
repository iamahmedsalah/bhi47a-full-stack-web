import api, { type PaginatedResponse } from '@/lib/api';
import type {
  ControlComponentKey,
  ControlSchemeComponent,
  Semester,
} from '@student-portal/shared';
import type {
  ApplyChangesResponse,
  ControlAuditRow,
  ControlCapabilities,
  ControlCourseSummary,
  ControlRosterRow,
  ControlSheetDetails,
  GradeChangeInput,
  ResolvedGradingScheme,
} from './types';

export const controlKeys = {
  all: ['control'] as const,
  me: () => [...controlKeys.all, 'me'] as const,
  courses: (academicYear: string, semester: Semester) =>
    [...controlKeys.all, 'courses', academicYear, semester] as const,
  sheet: (sheetId: string) => [...controlKeys.all, 'sheet', sheetId] as const,
  entries: (sheetId: string, search?: string) =>
    [...controlKeys.all, 'entries', sheetId, search ?? ''] as const,
  scheme: (courseId: string, academicYear: string, semester: Semester) =>
    [...controlKeys.all, 'scheme', courseId, academicYear, semester] as const,
  audit: (
    sheetId: string,
    params: { page?: number; limit?: number; studentId?: string },
  ) => [...controlKeys.all, 'audit', sheetId, params] as const,
};

export async function getControlCapabilities(): Promise<ControlCapabilities> {
  const res = await api.get<ControlCapabilities>('/admin/control/me');
  return res as unknown as ControlCapabilities;
}

export async function listControlCourses(params: {
  academicYear: string;
  semester: Semester;
}): Promise<{ items: ControlCourseSummary[] }> {
  const res = await api.get<{ items: ControlCourseSummary[] }>(
    '/admin/control/courses',
    { params },
  );
  return res as unknown as { items: ControlCourseSummary[] };
}

export async function openControlSheet(dto: {
  academicYear: string;
  semester: Semester;
  courseId: string;
  component: ControlComponentKey;
}): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>('/admin/control/sheets', dto);
  return res as unknown as ControlSheetDetails;
}

export async function getControlSheet(
  sheetId: string,
): Promise<ControlSheetDetails> {
  const res = await api.get<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}`,
  );
  return res as unknown as ControlSheetDetails;
}

export async function listControlEntries(
  sheetId: string,
  params?: { search?: string },
): Promise<{ entries: ControlRosterRow[]; total: number }> {
  const res = await api.get<{ entries: ControlRosterRow[]; total: number }>(
    `/admin/control/sheets/${sheetId}/entries`,
    { params },
  );
  return res as unknown as { entries: ControlRosterRow[]; total: number };
}

export async function applyControlChanges(
  sheetId: string,
  dto: { changes: GradeChangeInput[]; reason?: string },
): Promise<ApplyChangesResponse> {
  const res = await api.patch<ApplyChangesResponse>(
    `/admin/control/sheets/${sheetId}/entries`,
    dto,
  );
  return res as unknown as ApplyChangesResponse;
}

export async function lockControlSheet(
  sheetId: string,
  reason?: string,
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/lock`,
    { reason },
  );
  return res as unknown as ControlSheetDetails;
}

export async function unlockControlSheet(
  sheetId: string,
  reason: string,
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/unlock`,
    { reason },
  );
  return res as unknown as ControlSheetDetails;
}

export async function listControlAudit(
  sheetId: string,
  params: { page?: number; limit?: number; studentId?: string },
): Promise<PaginatedResponse<ControlAuditRow>> {
  const res = await api.get<PaginatedResponse<ControlAuditRow>>(
    `/admin/control/sheets/${sheetId}/audit`,
    { params },
  );
  return res as unknown as PaginatedResponse<ControlAuditRow>;
}

export async function getGradingScheme(
  courseId: string,
  params: { academicYear: string; semester: Semester },
): Promise<ResolvedGradingScheme> {
  const res = await api.get<ResolvedGradingScheme>(
    `/admin/control/schemes/${courseId}`,
    { params },
  );
  return res as unknown as ResolvedGradingScheme;
}

export async function updateGradingScheme(
  courseId: string,
  dto: {
    academicYear: string;
    semester: Semester;
    components: Array<Pick<ControlSchemeComponent, 'key' | 'max' | 'step' | 'enabled'>>;
    force?: boolean;
    reason?: string;
  },
): Promise<ResolvedGradingScheme> {
  const res = await api.put<ResolvedGradingScheme>(
    `/admin/control/schemes/${courseId}`,
    dto,
  );
  return res as unknown as ResolvedGradingScheme;
}
