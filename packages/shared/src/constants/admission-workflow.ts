export const ADMISSION_REQUEST_STATUSES = [
  "PENDING",
  "WAITLISTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type AdmissionRequestStatus =
  (typeof ADMISSION_REQUEST_STATUSES)[number];
/** Earlier unapproved cancellations are presented as the single rejection outcome. */
export function admissionApplicantStatus(
  status: AdmissionRequestStatus,
  hasStudent: boolean,
): AdmissionRequestStatus {
  return status === "CANCELLED" && !hasStudent ? "REJECTED" : status;
}
export const ADMISSION_REJECTION_REASONS = [
  "INELIGIBLE",
  "CAPACITY",
  "INVALID_INFORMATION",
  "OTHER",
] as const;
export const ADMISSION_MOBILE = /^01[0125]\d{8}$/;
export function isAdmissionNationalId(
  value: string,
  now = new Date(),
): boolean {
  if (!/^[23]\d{13}$/.test(value)) return false;
  const year = (value[0] === "2" ? 1900 : 2000) + Number(value.slice(1, 3));
  const month = Number(value.slice(3, 5)),
    day = Number(value.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date < now
  );
}
export function canTransitionAdmission(
  from: AdmissionRequestStatus,
  to: AdmissionRequestStatus,
): boolean {
  return (
    (from === "PENDING" &&
      ["WAITLISTED", "REJECTED", "APPROVED", "CANCELLED"].includes(to)) ||
    (from === "WAITLISTED" &&
      ["PENDING", "REJECTED", "APPROVED", "CANCELLED"].includes(to))
  );
}
export interface AdmissionGuardian {
  name: string;
  phone: string;
  relationship: string;
}
export interface AdmissionApplicant {
  fullName: string;
  fullNameAr?: string;
  address: string;
  phone: string;
  guardians: AdmissionGuardian[];
  studentType: "NEW" | "TRANSFER";
  previousInstitution?: string;
  previousFaculty?: string;
  transferNotes?: string;
}
export interface AdmissionApproval {
  revision: number;
  level: "1" | "2" | "3" | "4";
  semester: "1" | "2";
  department: string;
  groupId?: string;
  passedCourses: string[];
  confirmed: true;
}
export interface AdmissionRequestItem extends AdmissionApplicant {
  _id: string;
  publicReference: string;
  academicYear: string;
  admissionPeriodId: string;
  status: AdmissionRequestStatus;
  revision: number;
  nationalIdMasked: string;
  nationalId?: string;
  studentId?: string;
  studentCode?: string;
  level?: string;
  department?: string;
  semester?: string;
  groupId?: string;
  passedCourses?: string[];
  submittedAt: string;
  waitlistedAt?: string;
  waitlistPosition?: number;
  rejection?: { reasonCode: string; explanation?: string };
  notes?: string;
  duplicateReviewRequired?: boolean;
  history: Array<{
    actorId?: string;
    action: string;
    at: string;
    reason?: string;
    revision: number;
  }>;
}
export interface AdmissionAccessItem {
  effectiveStatus?: string;
  canOpen?: boolean;
  periodOpensAt?: string;
  periodClosesAt?: string;
  pinConfigurationIssue?: boolean;
  _id: string;
  admissionPeriodId: string;
  academicYear: string;
  label: string;
  method: "PIN" | "QR" | "BOTH";
  expiresAt: string;
  maxRegistrations: number;
  usedCount: number;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
}
export interface AdmissionAccessSecret extends AdmissionAccessItem {
  pin?: string;
  token?: string;
}
export interface AdmissionGroupItem {
  _id: string;
  name: string;
  nameAr?: string;
  academicYear: string;
  level: string;
  department: string;
  capacity: number;
  enrolled: number;
  isEnabled: boolean;
  revision: number;
}
export interface AdmissionReceipt {
  publicReference: string;
  secret: string;
}
export interface AdmissionStatus {
  publicReference: string;
  status: AdmissionRequestStatus;
  studentCode?: string;
  rejection?: { reasonCode: string; explanation?: string };
  waitlistPosition?: number;
}
export interface AdmissionPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface AdmissionImportRow {
  row: number;
  requestId?: string;
  revision?: number;
  action?: string;
  input?: Record<string, unknown>;
  state: "VALID" | "INVALID" | "APPLIED" | "FAILED" | "SKIPPED";
  error?: string;
}
export interface AdmissionImportBatch {
  _id: string;
  status: "PREVIEWED" | "APPLYING" | "APPLIED";
  expiresAt: string;
  rows: AdmissionImportRow[];
  mode: "valid-rows-only";
}
