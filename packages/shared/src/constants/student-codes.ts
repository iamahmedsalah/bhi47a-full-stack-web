export const STUDENT_CODE_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "ASSIGNED",
  "RELEASED",
  "REQUIRES_REVIEW",
] as const;
export type StudentCodeStatus = (typeof STUDENT_CODE_STATUSES)[number];
export type StudentCodeFindingStatus = StudentCodeStatus | "MISSING";
export const STUDENT_CODE_SEQUENCE_MAX = 9999;

/** Institutional format: explicit two-digit intake prefix + sequence 0001..9999. */
export function formatStudentCode(prefix: string, sequence: number): string {
  if (
    !/^\d{2}$/.test(prefix) ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > STUDENT_CODE_SEQUENCE_MAX
  )
    throw new Error("Invalid student code format");
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}
export function parseStudentCode(
  code: string,
  prefix: string,
): number | undefined {
  if (
    !/^\d{2}$/.test(prefix) ||
    !/^\d{6}$/.test(code) ||
    !code.startsWith(prefix)
  )
    return undefined;
  const sequence = Number(code.slice(2));
  return sequence >= 1 && sequence <= STUDENT_CODE_SEQUENCE_MAX
    ? sequence
    : undefined;
}
export type StudentCodeFindingReason =
  | "PREVIOUS_OWNER_MISSING"
  | "MALFORMED_CODE"
  | "OWNER_CONFLICT"
  | "ORPHANED_PROFILE"
  | "ORPHANED_USER"
  | "ALIAS_CONFLICT"
  | "REGISTRY_CONFLICT"
  | "REGISTRY_YEAR_MISMATCH"
  | "UNVERIFIED_GAP"
  | "CONFIRMED_AVAILABLE"
  | "ADMIN_REUSE_APPROVED"
  | "CURRENT_OWNER"
  | "PREVIOUS_OWNER_BLOCKED"
  | "RESERVATION_HELD";
export interface StudentCodeFinding {
  provenance?: { source: string; sourceFile?: string; rowNumber?: number; verification: string };
  studentCode: string;
  sequence?: number;
  status: StudentCodeFindingStatus;
  reason: StudentCodeFindingReason;
  currentStudentId?: string;
  /** Matching account/profile observed even while registry metadata needs review. */
  observedStudentId?: string;
  studentProfileId?: string;
  studentAcademicYear?: string;
  registryAcademicYear?: string;
  studentName?: string;
  studentNameAr?: string;
  department?: string;
  level?: string;
}
export interface StudentCodeYearItem {
  academicYear: string;
  yearPrefix: string;
  nextSequence: number;
  initializedAt: string;
}
export interface StudentCodeAuditResult {
  academicYear: string;
  yearPrefix: string;
  scannedAt: string;
  fingerprint: string;
  policy: StudentCodeYearItem | null;
  truncated: boolean;
  canInitialize: boolean;
  mappingConflict: boolean;
  reuseEnabled: boolean;
  summary: Record<StudentCodeFindingStatus, number>;
  items: StudentCodeFinding[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface InitializeStudentCodeYearInput {
  academicYear: string;
  yearPrefix: string;
  fingerprint: string;
  reason: string;
  confirmed: true;
}
export interface RecoverStudentCodeInput extends InitializeStudentCodeYearInput {
  neverAssignedConfirmed: true;
}
export interface StudentCodeHistoryResult {
  existingIdentity: boolean;
  assignments: Array<{ studentId: string; studentName?: string; studentNameAr?: string; source: string; observedAt: string; assignedAt?: string; releasedAt?: string }>;
  entry: {
    studentCode: string;
    status: StudentCodeStatus;
    currentStudentId?: string;
  } | null;
  items: Array<{
    _id: string;
    action: string;
    from?: string;
    to: string;
    reason: string;
    at: string;
    actorId: string;
    actorName?: string;
    actorNameAr?: string;
    source?: string;
    details?: { reportedOrigin?: string; sourceFile?: string; batchId?: string; rowNumber?: number; batchIndex?: number; archivedRecords?: Record<string, number>; previousAcademicYear?: string };
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
