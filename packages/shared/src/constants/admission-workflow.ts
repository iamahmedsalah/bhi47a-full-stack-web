export const ADMISSION_REQUEST_STATUSES = [
  "PENDING",
  "NEEDS_CORRECTION",
  "WAITLISTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type AdmissionRequestStatus =
  (typeof ADMISSION_REQUEST_STATUSES)[number];
export const OFFICIAL_ENROLLMENT_STATUSES = ["PROVISIONAL", "ENROLLED", "CANCELLED"] as const;
export type OfficialEnrollmentStatus = (typeof OFFICIAL_ENROLLMENT_STATUSES)[number];
export const MINISTRY_STATUSES = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"] as const;
export type MinistryStatus = (typeof MINISTRY_STATUSES)[number];
export type AdmissionType = "COORDINATION" | "TRANSFER";
export const ADMISSION_QUEUES = ["review", "correction", "transfers", "ready", "archive"] as const;
export type AdmissionQueue = (typeof ADMISSION_QUEUES)[number];

export interface MinistryEvidence {
  reference: string;
  decisionDate: string;
  documentId: string;
  notes?: string;
}
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
// Compact receipts avoid ambiguous I/O/0/1. Keep issued legacy receipts valid.
export const ADMISSION_TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ADMISSION_REFERENCE_PATTERN =
  /^ADM-(?:[A-HJ-NP-Z2-9]{12}|[A-F0-9]{24})$/;
export const ADMISSION_TRACKING_SECRET_PATTERN =
  /^(?:[A-HJ-NP-Z2-9]{16}|[A-Za-z0-9_-]{43})$/;
export function normalizeAdmissionReference(value: string): string {
  const reference = value.trim().toUpperCase();
  return /^ADM[-\s]/.test(reference)
    ? `ADM-${reference.slice(3).replace(/[-\s]/g, "")}`
    : reference;
}
export function normalizeAdmissionTrackingSecret(value: string): string {
  const secret = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(secret)) return secret;
  const compact = secret.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-HJ-NP-Z2-9]{16}$/.test(compact) ? compact : secret;
}
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
  ministryStatus?: "PENDING" | "APPROVED";
  ministryEvidence?: MinistryEvidence;
  enrollmentEffectiveDate?: string;
}
export interface AdmissionRequestItem extends AdmissionApplicant {
  _id: string;
  publicReference: string;
  academicYear: string;
  admissionPeriodId: string;
  status: AdmissionRequestStatus;
  revision: number;
  lifecycleEnabled?: boolean;
  ministryStatus?: MinistryStatus;
  officialEnrollmentStatus?: OfficialEnrollmentStatus;
  enrollmentEffectiveDate?: string;
  correctionInstructions?: string;
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
    details?: Record<string, unknown>;
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
  correction?: { instructions: string; revision: number; applicant: AdmissionApplicant };
  ministryStatus?: MinistryStatus;
  officialEnrollmentStatus?: OfficialEnrollmentStatus;
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
