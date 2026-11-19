import type {
  ControlComponentKey,
  ControlSchemeComponent,
  GradeStatus,
  Semester,
} from "@student-portal/shared";

export interface ControlCapabilities {
  canSubmit: boolean;
  canReview: boolean;
  canApprove?: boolean;
  canApproveFinal?: boolean;
  canImport: boolean;
  canExport: boolean;
  canAccess: boolean;
  canView: boolean;
  canCreateSheets: boolean;
  canEnter: boolean;
  canEditReview: boolean;
  canGrace?: boolean;
  canEditPublished: boolean;
  canManageStates: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canManageSchemes: boolean;
  canViewAudit: boolean;
  scopeAll: boolean;
}

export interface ControlCourseSummaryComponent {
  key: ControlComponentKey;
  sheetId: string | null;
  slug?: string | null;
  locked: boolean;
  entered: number;
  published: number;
  workflowState?: ControlSheetDetails["sheet"]["workflowState"];
  releaseActive?: boolean;
}

export interface ControlCourseSummary {
  courseId: string;
  code: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  level?: string | null;
  rosterCount: number;
  components: ControlCourseSummaryComponent[];
}

export interface ControlSheetDetails {
  sheet: {
    id: string;
    slug?: string;
    academicYear: string;
    semester: Semester;
    component: ControlComponentKey;
    workflowState:
      "DRAFT" | "IN_REVIEW" | "PENDING_APPROVAL" | "RETURNED" | "APPROVED";
    revision: number;
    reviewReason: string | null;
    grace?: {
      amount: number;
      changed: number;
      capped: number;
      appliedAt: string;
    } | null;
    locked: boolean;
    lockedAt: string | null;
    lockReason: string | null;
    lockedByName: string | null;
  };
  course: {
    id: string;
    code: string;
    name: string;
    nameAr: string | null;
    nameEn: string | null;
  };
  rules: {
    key: ControlComponentKey;
    nameAr: string;
    nameEn: string;
    max: number;
    step: number;
  };
  capabilities: {
    canGrace?: boolean;
    canSubmit: boolean;
    canReview: boolean;
    canApprove?: boolean;
    canApproveFinal?: boolean;
    canImport: boolean;
    canExport: boolean;
    canEdit: boolean;
    canEditReview?: boolean;
    canEditPublished: boolean;
    canManageStates: boolean;
    canLock: boolean;
    canUnlock: boolean;
    canManageSchemes: boolean;
    canViewAudit: boolean;
  };
}

export interface ControlEntry {
  carriedFrom?: { academicYear: string; semester: string };
  studentId: string;
  score: number | null;
  status: string | null;
  rev: number;
  isPublished: boolean | null;
  updatedAt: string | null;
}

export interface ControlRosterRow extends ControlEntry {
  studentCode: string;
  name: string;
  nameAr: string | null;
  notRegistered: boolean;
}

export interface GradeChangeInput {
  studentId: string;
  attendanceMark?: number;
  quizzesMark?: number;
  score?: number | null;
  status?: GradeStatus;
  expectedRev: number;
  opId: string;
  reason?: string;
}

export type ChangeResultCode = "ok" | "invalid" | "conflict" | "forbidden";

export interface ChangeResult {
  opId: string;
  studentId: string;
  result: ChangeResultCode;
  code?: string;
  message?: string;
  duplicate?: boolean;
  entry?: ControlEntry | null;
  current?: ControlEntry | null;
}

export interface ApplyChangesResponse {
  results: ChangeResult[];
  summary: {
    ok: number;
    invalid: number;
    conflict: number;
    forbidden: number;
  };
}

export interface ResolvedGradingScheme {
  courseId: string;
  academicYear: string;
  semester: Semester;
  version: number;
  courseworkAttendanceMax: number;
  courseworkQuizzesMax: number;
  frozenAt: string | null;
  components: ControlSchemeComponent[];
}

export interface ControlAuditRow {
  id: string;
  action:
    | "CREATE"
    | "UPDATE"
    | "CLEAR"
    | "LOCK"
    | "UNLOCK"
    | "SCHEME_CHANGE"
    | "SUBMIT"
    | "SUBMIT_APPROVAL"
    | "APPROVE"
    | "RETURN"
    | "REOPEN"
    | "PUBLISH"
    | "HIDE";
  source: "GRID" | "XLSX" | "SYSTEM";
  component: string;
  oldValue: {
    decision?: "keep_previous" | "accept_new";
    previousYear?: string;
    previousPercentage?: number | null;
    currentPercentage?: number | null;
    workflowState?: string;
    attendanceMark?: number | null;
    quizzesMark?: number | null;
    score?: number | null;
    status?: string | null;
    isPublished?: boolean | null;
    rev?: number | null;
  } | null;
  newValue: {
    decision?: "keep_previous" | "accept_new";
    previousYear?: string;
    previousPercentage?: number | null;
    currentPercentage?: number | null;
    workflowState?: string;
    attendanceMark?: number | null;
    quizzesMark?: number | null;
    score?: number | null;
    status?: string | null;
    isPublished?: boolean | null;
    rev?: number | null;
  } | null;
  reason: string | null;
  at: string;
  actorName: string | null;
  studentCode: string | null;
  studentName: string | null;
}

export interface WorkbookEntry extends ControlEntry {
  attendanceMark: number | null;
  quizzesMark: number | null;
}
export interface WorkbookRow extends ControlRosterRow {
  tuition?: { isBlocked: boolean; status: "paid" | "unpaid" | "exempt" | null };
  components: Partial<Record<ControlComponentKey, WorkbookEntry>>;
  result: { total: number | null; totalMax: number; complete: boolean };
}
export interface ControlWorkbook {
  revision: number;
  componentStates?: Partial<
    Record<ControlComponentKey, ControlSheetDetails["sheet"]["workflowState"]>
  >;
  scheme: ResolvedGradingScheme;
  rows: WorkbookRow[];
}
export interface ControlImportPreview {
  rules?: { component: ControlComponentKey; max: number; step: number };
  batchIndex?: number;
  totalBatches?: number;
  totalRows?: number;
  previewId: string;
  valid: number;
  skipped?: number;
  errors: string[];
  changes: GradeChangeInput[];
  reviewRows?: Array<{
    sourceRow: number;
    studentId: string;
    studentCode: string;
    name: string;
    nameAr: string;
    examStatus?: string;
    before: number | null;
    after: string | number | null;
    status: "valid" | "invalid" | "unchanged";
    issues: string[];
  }>;
}
