import api, { type PaginatedResponse } from "@/lib/api";
import { queryOptions } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";

import type {
  ControlComponentKey,
  ControlSchemeComponent,
  Semester,
} from "@student-portal/shared";
import type {
  ApplyChangesResponse,
  ControlAuditRow,
  ControlBulkLockResult,
  ControlCapabilities,
  ControlCheckpoint,
  ControlCourseSummary,
  ControlPartialCandidatesResponse,
  ControlPetition,
  ControlPetitionStatus,
  ControlPetitionsSummary,
  ControlRosterRow,
  ControlSheetDetails,
  ControlWorkflowHistory,
  GradeChangeInput,
  ResolvedGradingScheme,
} from "./types";
import type { GradeStatus } from "@student-portal/shared";

export type ControlTransferProgress = (percent: number | null) => void;
const transferProgress =
  (report?: ControlTransferProgress) => (event: AxiosProgressEvent) => {
    report?.(
      event.total && event.total > 0
        ? Math.min(100, Math.floor((event.loaded / event.total) * 100))
        : null,
    );
  };

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
  workflowHistory: (sheetId: string) =>
    [...controlKeys.all, "workflow-history", sheetId] as const,
  petitions: (params?: Record<string, unknown>) =>
    [...controlKeys.all, "petitions", params ?? {}] as const,
  petitionsSummary: (params?: Record<string, unknown>) =>
    [...controlKeys.all, "petitions-summary", params ?? {}] as const,
  petition: (id: string) => [...controlKeys.all, "petition", id] as const,
  partialCandidates: (sheetId: string, includeExcused: boolean) =>
    [...controlKeys.all, "partial-candidates", sheetId, includeExcused] as const,
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
  reason?: string,
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/unlock`,
    { reason },
  );
  return res.data;
}

export async function getControlPartialCandidates(
  sheetId: string,
  includeExcused = false,
): Promise<ControlPartialCandidatesResponse> {
  const res = await api.get<ControlPartialCandidatesResponse>(
    `/admin/control/sheets/${sheetId}/partial/candidates`,
    { params: { includeExcused } },
  );
  return res.data;
}

export async function openControlPartialEntry(
  sheetId: string,
  dto: {
    studentIds: string[];
    includeExcused?: boolean;
    reason?: string;
    studentReasons?: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/partial/open`,
    dto,
  );
  return res.data;
}

export async function submitControlPartialEntry(
  sheetId: string,
  dto: { expectedPartialRevision: number; reason?: string },
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/partial/submit`,
    dto,
  );
  return res.data;
}

export async function returnControlPartialEntry(
  sheetId: string,
  dto: { expectedPartialRevision: number; reason: string },
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/partial/return`,
    dto,
  );
  return res.data;
}

export async function approveControlPartialEntry(
  sheetId: string,
  dto: {
    expectedPartialRevision: number;
    reason?: string;
    attemptReviewDigest?: string;
    keepPreviousStudentIds?: string[];
  },
): Promise<ControlSheetDetails> {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/partial/approve`,
    dto,
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

export async function getControlWorkflowHistory(
  sheetId: string,
): Promise<ControlWorkflowHistory> {
  const res = await api.get<ControlWorkflowHistory>(
    `/admin/control/sheets/${sheetId}/workflow-history`,
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

export async function getControlWorkbook(sheetId: string, signal?: AbortSignal) {
  const res = await api.get<import("./types").ControlWorkbook>(
    `/admin/control/sheets/${sheetId}/workbook`,
    { signal },
  );
  return res.data;
}

export function controlWorkbookOptions(sheetId: string, principalId?: string) {
  return queryOptions({
    queryKey: [...controlKeys.sheet(sheetId), "workbook", principalId] as const,
    queryFn: ({ signal }) => getControlWorkbook(sheetId, signal),
    staleTime: 15_000,
  });
}

export async function getControlCheckpoint(
  sheetId: string,
  signal: AbortSignal,
) {
  const res = await api.get<ControlCheckpoint | null>(
    `/admin/control/sheets/${sheetId}/checkpoint`,
    { signal, timeout: 5000 },
  );
  return res.data;
}

export async function saveControlCheckpoint(
  sheetId: string,
  principalId: string,
  checkpoint: ControlCheckpoint,
) {
  await api.put(
    `/admin/control/sheets/${sheetId}/checkpoint`,
    { ...checkpoint, expectedActorId: principalId },
    {
      adapter: "fetch",
      fetchOptions: { keepalive: true },
      timeout: 5000,
    },
  );
}
export async function reviewControlSheet(
  sheetId: string,
  dto: {
    action: "SUBMIT" | "SUBMIT_APPROVAL" | "APPROVE" | "RETURN" | "REOPEN";
    expectedRevision: number;
    allowMissing?: boolean;
    reason?: string;
    attemptReviewDigest?: string;
    keepPreviousStudentIds?: string[];
  },
) {
  const res = await api.post<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/review`,
    dto,
  );
  return res.data;
}

export type ControlGraceMode = "initial" | "new_only" | "adjust" | "reset";

export interface GraceStatus {
  revision: number;
  locked: boolean;
  workflowState: ControlSheetDetails["sheet"]["workflowState"];
  activeGrace: {
    operationId: string;
    amount: number;
    actorId: string;
    appliedAt: string;
    changed: number;
    capped: number;
    totalGraced?: number;
    updatedAt?: string;
  } | null;
  gracedCount: number;
  eligibleNewCount: number;
  manuallyModifiedCount: number;
  legacyGrace: boolean;
}

export interface GracePreview {
  mode?: ControlGraceMode;
  digest: string;
  revision: number;
  amount: number;
  max: number;
  counts: {
    registered: number;
    changed: number;
    capped: number;
    atMaximum: number;
    absentOrBanned: number;
    held: number;
    unentered: number;
    other: number;
  };
  modeStats?: {
    alreadyGraced: number;
    manuallyModified: number;
    excludedNew: number;
    totalGracedAfter: number;
  };
  passRate?: {
    threshold: number;
    total: number;
    presentCount?: number;
    bannedCount?: number;
    absentCount?: number;
    rosterTotal?: number;
    passedBefore: number;
    passedAfter: number;
    ratioBefore: number;
    ratioAfter: number;
  };
  sample: Array<{
    studentCode: string;
    originalGrade?: number;
    before: number;
    added: number;
    after: number;
  }>;
}

export async function updateControlPassThreshold(
  sheetId: string,
  passThreshold: number,
) {
  const res = await api.patch<ControlSheetDetails>(
    `/admin/control/sheets/${sheetId}/pass-threshold`,
    { passThreshold },
  );
  return res.data;
}

export async function getControlGraceStatus(sheetId: string) {
  const res = await api.get<GraceStatus>(
    `/admin/control/sheets/${sheetId}/grace/status`,
  );
  return res.data;
}

export async function previewControlGrace(
  sheetId: string,
  amount: number,
  expectedRevision: number,
  options?: { mode?: ControlGraceMode; includeNewStudents?: boolean },
) {
  const res = await api.post<GracePreview>(
    `/admin/control/sheets/${sheetId}/grace/preview`,
    {
      amount,
      expectedRevision,
      ...(options?.mode ? { mode: options.mode } : {}),
      ...(options?.includeNewStudents !== undefined
        ? { includeNewStudents: options.includeNewStudents }
        : {}),
    },
  );
  return res.data;
}

export async function applyControlGrace(
  sheetId: string,
  preview: GracePreview,
  operationId: string,
  options?: { mode?: ControlGraceMode; includeNewStudents?: boolean },
) {
  const mode = options?.mode ?? preview.mode;
  const res = await api.post(`/admin/control/sheets/${sheetId}/grace`, {
    amount: preview.amount,
    expectedRevision: preview.revision,
    digest: preview.digest,
    operationId,
    ...(mode ? { mode } : {}),
    ...(options?.includeNewStudents !== undefined
      ? { includeNewStudents: options.includeNewStudents }
      : {}),
  });
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

export async function downloadControlTemplate(
  sheetId: string,
  component: ControlComponentKey,
  courseCode: string,
  mode: "workbook" | "missing" | "exceptions" = "workbook",
  onProgress?: ControlTransferProgress,
) {
  const raw = await api.get(`/admin/control/sheets/${sheetId}/template`, {
    responseType: "blob",
    params: { component, mode },
    onDownloadProgress: transferProgress(onProgress),
  });
  const { downloadFileBlob } = await import("@/lib/export-utils");
  await downloadFileBlob(
    raw,
    `control-${courseCode.replace(/[^a-zA-Z0-9_-]/g, "-") || sheetId}-${component}-${mode}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  onProgress?.(100);
}

export async function downloadControlReport(
  sheetId: string,
  params: {
    type: "course" | "round-table";
    academicYear: string;
    semester: string;
    level?: string;
  },
  courseCode: string,
  onProgress?: ControlTransferProgress,
) {
  const raw = await api.get(`/admin/control/sheets/${sheetId}/report`, {
    responseType: "blob",
    params,
    onDownloadProgress: transferProgress(onProgress),
  });
  const { downloadFileBlob } = await import("@/lib/export-utils");
  await downloadFileBlob(
    raw,
    `control-${params.type === "course" ? `${courseCode.replace(/[^a-zA-Z0-9_-]/g, "-") || sheetId}-course` : "round-table"}-${params.academicYear}-${params.semester}${params.level ? `-${params.level}` : ""}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  onProgress?.(100);
}
export async function previewControlFile(
  sheetId: string,
  file: File,
  onProgress?: ControlTransferProgress,
) {
  const body = new FormData();
  body.append("file", file);
  const res = await api.post<
    import("./types").ControlImportPreview & { remainingBatchIds: string[] }
  >(
    `/admin/control/sheets/${sheetId}/import/preview`,
    body,
    { onUploadProgress: transferProgress(onProgress) },
  );
  return res.data;
}
export async function previewControlFileBatch(sheetId: string, batchId: string) {
  const res = await api.post<import("./types").ControlImportPreview>(
    `/admin/control/sheets/${sheetId}/import/batches/${batchId}/preview`,
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

export interface AttemptView {
  academicYear: string;
  semester: string;
  fingerprint: string;
  marks: Array<{
    id: string;
    component: string;
    grade: number;
    maxGrade: number;
    status: string;
  }>;
  result: {
    official: boolean;
    incomplete: boolean;
    percentage: number | null;
    letterGrade: string | null;
    total: number | null;
    totalMax: number;
  };
}
export interface AttemptComparison {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr?: string;
  previous: AttemptView;
  current: AttemptView;
  canAcceptNew: boolean;
  recommendation: "keep_previous" | "accept_new";
  fingerprint: string;
}
export interface AttemptPreview {
  semester: string;
  carriedTotal: number;
  carried: Array<{
    studentId: string;
    studentCode: string;
    academicYear: string;
    semester: string;
    fingerprint: string;
  }>;
  digest: string;
  total: number;
  page: number;
  limit: number;
  comparisons: AttemptComparison[];
  icTotal: number;
  icSources: Array<{
    studentId: string;
    studentCode: string;
    name: string;
    nameAr?: string;
    alreadyCarried?: boolean;
    source: AttemptView;
  }>;
}
export async function getControlAttempts(sheetId: string, page = 1) {
  const response = await api.get<AttemptPreview>(
    `/admin/control/sheets/${sheetId}/attempts`,
    { params: { page } },
  );
  return response.data;
}
export async function carryIcGrades(
  sheetId: string,
  sourceFinalId: string,
  fingerprint: string,
) {
  const response = await api.post(`/admin/control/sheets/${sheetId}/carry-ic`, {
    sourceFinalId,
    fingerprint,
  });
  return response.data;
}

export async function undoIcCarry(
  sheetId: string,
  studentId: string,
  fingerprint: string,
) {
  const response = await api.post(
    `/admin/control/sheets/${sheetId}/undo-carry-ic`,
    { studentId, fingerprint },
  );
  return response.data;
}

export async function bulkLockControlSheets(dto: {
  academicYear: string;
  semester: Semester;
  courseIds: string[];
  components: ControlComponentKey[];
  reason?: string;
}): Promise<ControlBulkLockResult> {
  const res = await api.post<ControlBulkLockResult>(
    "/admin/control/sheets/bulk-lock",
    dto,
  );
  return res.data;
}

export async function bulkUnlockControlSheets(dto: {
  academicYear: string;
  semester: Semester;
  courseIds: string[];
  components: ControlComponentKey[];
  reason?: string;
}): Promise<ControlBulkLockResult> {
  const res = await api.post<ControlBulkLockResult>(
    "/admin/control/sheets/bulk-unlock",
    dto,
  );
  return res.data;
}

export async function createControlPetition(dto: {
  sheetId: string;
  reason: string;
  items: Array<{
    studentId: string;
    proposedScore?: number | null;
    proposedStatus?: GradeStatus;
    proposedAttendanceMark?: number | null;
    proposedQuizzesMark?: number | null;
    studentReason?: string;
  }>;
}): Promise<ControlPetition> {
  const res = await api.post<ControlPetition>("/admin/control/petitions", dto);
  return res.data;
}

export async function getControlPetitionsSummary(params?: {
  academicYear?: string;
  semester?: Semester;
  sheetId?: string;
}): Promise<ControlPetitionsSummary> {
  const res = await api.get<ControlPetitionsSummary>(
    "/admin/control/petitions/summary",
    { params },
  );
  return res.data;
}

export async function listControlPetitions(params?: {
  academicYear?: string;
  semester?: Semester;
  component?: ControlComponentKey;
  status?: ControlPetitionStatus;
  courseId?: string;
  sheetId?: string;
  mine?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<ControlPetition>> {
  const res = await api.get<PaginatedResponse<ControlPetition>>(
    "/admin/control/petitions",
    { params },
  );
  return res.data;
}

export async function getControlPetition(id: string): Promise<ControlPetition> {
  const res = await api.get<ControlPetition>(`/admin/control/petitions/${id}`);
  return res.data;
}

export async function decideControlPetition(
  id: string,
  dto: {
    items: Array<{
      studentId: string;
      decision: "APPROVED" | "REJECTED";
      decisionNote?: string;
    }>;
    reviewNote?: string;
  },
): Promise<ControlPetition> {
  const res = await api.post<ControlPetition>(
    `/admin/control/petitions/${id}/decide`,
    dto,
  );
  return res.data;
}

export async function markControlPetitionSeen(
  id: string,
): Promise<ControlPetition> {
  const res = await api.post<ControlPetition>(
    `/admin/control/petitions/${id}/mark-seen`,
  );
  return res.data;
}
