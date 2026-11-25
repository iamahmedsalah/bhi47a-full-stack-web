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
  canReopen?: boolean;
  canCreatePetitions?: boolean;
  canApprovePetitions?: boolean;
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

export interface ControlPassRateSummary {
  passed: number;
  total: number;
  presentCount: number;
  bannedCount: number;
  ratio: number;
  threshold: number;
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
  passRate?: ControlPassRateSummary | null;
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

export interface ControlSheetPartialCycle {
  cycleId: string;
  phase: "EDITING" | "PENDING_APPROVAL" | "RETURNED";
  revision: number;
  allowedStudentIds: string[];
  studentReasons?: Record<string, string>;
  openReason?: string;
  openedBy: string;
  openedAt: string;
  submittedBy?: string;
  submittedAt?: string;
  submissionDigest?: string;
  returnReason?: string;
  returnedBy?: string;
  returnedAt?: string;
}

export interface ControlPartialCandidate {
  studentId: string;
  studentCode: string;
  name: string;
  nameAr: string | null;
  currentStatus: string | null;
  reasonKind: "unentered" | "excused" | "incomplete";
  tuitionBlocked: boolean;
  tuitionStatus: string | null;
}

export interface ControlPartialCandidatesResponse {
  sheetId: string;
  revision: number;
  component: ControlComponentKey;
  candidates: ControlPartialCandidate[];
}

export interface ControlSheetDetails {
  sheet: {
    id: string;
    slug?: string;
    academicYear: string;
    semester: Semester;
    component: ControlComponentKey;
    workflowState:
      | "DRAFT"
      | "IN_REVIEW"
      | "PENDING_APPROVAL"
      | "RETURNED"
      | "APPROVED"
      | "PARTIAL_OPEN";
    revision: number;
    reviewReason: string | null;
    partialCycle?: ControlSheetPartialCycle | null;
    grace?: {
      amount: number;
      changed: number;
      capped: number;
      appliedAt: string;
      totalGraced?: number;
      updatedAt?: string;
    } | null;
    passThreshold?: number;
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
    passThreshold?: number;
  };
  capabilities: {
    canGrace?: boolean;
    canManagePassThreshold?: boolean;
    canSubmit: boolean;
    canReview: boolean;
    canReopen?: boolean;
    canOpenPartial?: boolean;
    canSubmitPartial?: boolean;
    canReturnPartial?: boolean;
    canApprovePartial?: boolean;
    canCreatePetitions?: boolean;
    canApprovePetitions?: boolean;
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
  isApproved?: boolean;
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

export interface ControlWorkflowActor {
  id: string;
  name: string | null;
  nameAr: string | null;
  role: string | null;
  staffType: string | null;
  titlePrefix: string | null;
}

export interface ControlWorkflowStage {
  key: "DRAFT" | "IN_REVIEW" | "PENDING_APPROVAL" | "APPROVED";
  status: "completed" | "active" | "returned" | "pending";
  actor: ControlWorkflowActor | null;
  at: string | null;
  note: string | null;
}

export interface ControlWorkflowEvent {
  id: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  actor: ControlWorkflowActor | null;
  reason: string | null;
  at: string;
}

export interface ControlWorkflowHistory {
  sheetId: string;
  slug: string | null;
  courseCode: string;
  courseName: string;
  courseNameAr: string | null;
  courseNameEn: string | null;
  component: ControlComponentKey;
  academicYear: string;
  semester: Semester;
  workflowState: ControlSheetDetails["sheet"]["workflowState"];
  locked: boolean;
  lockedBy: ControlWorkflowActor | null;
  lockedAt: string | null;
  lockReason: string | null;
  reviewReason: string | null;
  stages: ControlWorkflowStage[];
  events: ControlWorkflowEvent[];
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
    | "HIDE"
    | "GRACE"
    | "PETITION_APPROVE"
    | "PETITION_REJECT"
    | "PARTIAL_OPEN"
    | "PARTIAL_SUBMIT"
    | "PARTIAL_RETURN"
    | "PARTIAL_APPROVE"
    | "PARTIAL_CLOSE";
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
  grace?: {
    originalGrade: number;
    appliedAmount: number;
    actualAdded: number;
    appliedRev: number;
  } | null;
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
export interface ControlCheckpoint {
  studentId: string | null;
  field: "raw" | "attendance" | "quizzes";
  sort: "code" | "name" | "mark";
  descending: boolean;
  filter: "all" | "absent";
  onlyMissing: boolean;
  search: string;
}

export interface ControlBulkLockResult {
  locked: boolean;
  affected: number;
  createdAndLocked: number;
  alreadyInState: number;
  skippedDisabled: number;
}

export type ControlPetitionStatus =
  | "PENDING"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED";

export type ControlPetitionItemDecision = "PENDING" | "APPROVED" | "REJECTED";

export interface ControlPetitionItem {
  studentId: string;
  studentCode: string;
  studentName: string;
  studentNameAr: string | null;
  currentScore: number | null;
  currentStatus: GradeStatus | null;
  currentAttendanceMark: number | null;
  currentQuizzesMark: number | null;
  baselineRev: number;
  proposedScore: number | null;
  proposedStatus: GradeStatus;
  proposedAttendanceMark: number | null;
  proposedQuizzesMark: number | null;
  studentReason: string | null;
  decision: ControlPetitionItemDecision;
  decisionNote: string | null;
  appliedRev: number | null;
  decidedAt: string | null;
  hasRevConflict?: boolean;
}

export interface ControlPetition {
  id: string;
  sheetId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr: string | null;
  courseNameEn: string | null;
  courseLevel: string | null;
  academicYear: string;
  semester: Semester;
  component: ControlComponentKey;
  status: ControlPetitionStatus;
  reason: string;
  requestedBy: ControlWorkflowActor;
  requestedAt: string;
  reviewedBy: ControlWorkflowActor | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  requesterSeenAt: string | null;
  counts: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  items: ControlPetitionItem[];
}

export interface ControlPetitionsSummary {
  pendingForApprovalCount: number;
  unreadDecisionsCount: number;
  sheetPendingCount: number;
}
