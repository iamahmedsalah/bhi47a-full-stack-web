import api, { type PaginatedResponse } from "@/lib/api";
import type {
  ControlComponentKey,
  ControlSchemeComponent,
  Semester,
} from "@student-portal/shared";
import type {
  ApplyChangesResponse,
  ControlAuditRow,
  ControlCapabilities,
  ControlCourseSummary,
  ControlRosterRow,
  ControlSheetDetails,
  GradeChangeInput,
  ResolvedGradingScheme,
} from "./types";

export const controlKeys = {
  all: ["control"] as const,
  me: () => [...controlKeys.all, "me"] as const,
  courses: (academicYear: string, semester: Semester, level?: string) =>
    [
      ...controlKeys.all,
      "courses",
      academicYear,
      semester,
      level ?? "all",
    ] as const,
  sheet: (sheetId: string) => [...controlKeys.all, "sheet", sheetId] as const,
  entries: (sheetId: string, search?: string) =>
    [...controlKeys.all, "entries", sheetId, search ?? ""] as const,
  scheme: (courseId: string, academicYear: string, semester: Semester) =>
    [...controlKeys.all, "scheme", courseId, academicYear, semester] as const,
  audit: (
    sheetId: string,
    params: { page?: number; limit?: number; studentId?: string },
  ) => [...controlKeys.all, "audit", sheetId, params] as const,
};

export async function getControlCapabilities(): Promise<ControlCapabilities> {
  const res = await api.get<ControlCapabilities>("/admin/control/me");
  return res.data;
}

export async function listControlCourses(params: {
  academicYear: string;
  semester: Semester;
  level?: string;
}): Promise<{ items: ControlCourseSummary[] }> {
  const res = await api.get<{ items: ControlCourseSummary[] }>(
    "/admin/control/courses",
    { params },
  );
  return res.data;
}

export async function openControlSheet(dto: {
  academicYear: string;
  semester: Semester;
  courseId: string;
  component: ControlComponentKey;
}): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>("/admin/control/sheets", dto);
  return res.data;
}

export async function getControlSheet(
  sheetId: string,
): Promise<ControlSheetDetails> {
  const res = await api.get<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}`,
  );
  return res.data;
}

export async function listControlEntries(
  sheetId: string,
  params?: { search?: string },
): Promise<{ entries: ControlRosterRow[]; total: number }> {
  const res = await api.get<{ entries: ControlRosterRow[]; total: number }>(
    `/admin/control/sheets/${sheetId}/entries`,
    { params },
  );
  return res.data;
}

export async function applyControlChanges(
  sheetId: string,
  dto: {
    changes: GradeChangeInput[];
    reason?: string;
    expectedSchemeVersion?: number;
  },
): Promise<ApplyChangesResponse> {
  const res = await api.patch<ApplyChangesResponse>(
    `/admin/control/sheets/${sheetId}/entries`,
    dto,
  );
  return res.data;
}

export async function lockControlSheet(
  sheetId: string,
  reason?: string,
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/lock`,
    { reason },
  );
  return res.data;
}

export async function unlockControlSheet(
  sheetId: string,
  reason: string,
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/unlock`,
    { reason },
  );
  return res.data;
}

export async function listControlAudit(
  sheetId: string,
  params: { page?: number; limit?: number; studentId?: string },
): Promise<PaginatedResponse<ControlAuditRow>> {
  const res = await api.get<PaginatedResponse<ControlAuditRow>>(
    `/admin/control/sheets/${sheetId}/audit`,
    { params },
  );
  return res.data;
}

export async function getGradingScheme(
  courseId: string,
  params: { academicYear: string; semester: Semester },
): Promise<ResolvedGradingScheme> {
  const res = await api.get<ResolvedGradingScheme>(
    `/admin/control/schemes/${courseId}`,
    { params },
  );
  return res.data;
}

export async function updateGradingScheme(
  courseId: string,
  dto: {
    academicYear: string;
    semester: Semester;
    components: Array<
      Pick<ControlSchemeComponent, "key" | "max" | "step" | "enabled">
    >;
    courseworkAttendanceMax?: number;
    force?: boolean;
    reason?: string;
  },
): Promise<ResolvedGradingScheme> {
  const res = await api.put<ResolvedGradingScheme>(
    `/admin/control/schemes/${courseId}`,
    {
      ...dto,
      components: dto.components.map(({ key, max, step, enabled }) => ({
        key,
        max,
        step,
        enabled,
      })),
    },
  );
  return res.data;
}

export async function getControlWorkbook(sheetId: string) {
  const res = await api.get<import("./types").ControlWorkbook>(
    `/admin/control/sheets/${sheetId}/workbook`,
  );
  return res.data;
}
export async function reviewControlSheet(
  sheetId: string,
  dto: {
    action: "SUBMIT" | "APPROVE" | "RETURN" | "REOPEN";
    expectedRevision: number;
    reason: string;
  },
) {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/review`,
    dto,
  );
  return res.data;
}
export async function exportControlSheet(
  sheetId: string,
  mode: "workbook" | "missing" | "exceptions" = "workbook",
  filenameSlug?: string,
) {
  const raw = await api.get(`/admin/control/sheets/${sheetId}/export`, {
    responseType: "blob",
    params: { mode },
  });
  const { downloadFileBlob } = await import("@/lib/export-utils");
  const fileIdentifier = filenameSlug || sheetId;
  await downloadFileBlob(
    raw,
    `control-${fileIdentifier}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export async function previewControlFile(
  sheetId: string,
  file: File,
  batch = 0,
) {
  const body = new FormData();
  body.append("file", file);
  const res = await api.post<import("./types").ControlImportPreview>(
    `/admin/control/sheets/${sheetId}/import/preview`,
    body,
    { params: { batch } },
  );
  return res.data;
}
export async function previewControlRows(
  sheetId: string,
  rows: Record<string, unknown>[],
) {
  const res = await api.post<import("./types").ControlImportPreview>(
    `/admin/control/sheets/${sheetId}/import/rows`,
    { rows },
  );
  return res.data;
}
export async function commitControlImport(sheetId: string, previewId: string) {
  const res = await api.post<ApplyChangesResponse>(
    `/admin/control/sheets/${sheetId}/import/commit`,
    { previewId },
  );
  return res.data;
}

export async function exportControlImportErrors(
  sheetId: string,
  previewId: string,
) {
  const raw = await api.get(
    `/admin/control/sheets/${sheetId}/import/${previewId}/errors`,
    { responseType: "blob" },
  );
  const { downloadFileBlob } = await import("@/lib/export-utils");
  await downloadFileBlob(
    raw,
    "control-import-errors.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
