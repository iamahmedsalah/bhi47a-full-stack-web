/** Intake configuration is separate from enrolled students' course registration. */
export const ADMISSION_PERIOD_STATUSES = [
  "disabled",
  "scheduled",
  "open",
  "closed",
] as const;
export type AdmissionPeriodStatus = (typeof ADMISSION_PERIOD_STATUSES)[number];

export interface AdmissionPeriodInput {
  code: string;
  academicYear: string;
  name: string;
  nameAr?: string;
  opensAt: string;
  closesAt: string;
  isEnabled?: boolean;
  lifecycleEnabled?: boolean;
}

export interface AdmissionPeriodItem extends AdmissionPeriodInput {
  _id: string;
  isEnabled: boolean;
  revision: number;
  status: AdmissionPeriodStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type AdmissionPeriodUpdate = Partial<
  Omit<AdmissionPeriodInput, "code" | "academicYear">
> & {
  revision: number;
};

export function isAdmissionAcademicYear(value: string): boolean {
  if (!/^\d{4}-\d{4}$/.test(value)) return false;
  const [start, end] = value.split("-").map(Number);
  return start >= 1000 && end <= 9999 && end === start + 1;
}
/** The institute's intake prefix follows the END year, never the server calendar. */
export function admissionYearPrefix(academicYear: string): string {
  if (!isAdmissionAcademicYear(academicYear))
    throw new Error("Invalid academic year");
  return academicYear.slice(-2);
}

export function admissionPeriodStatus(
  period: {
    isEnabled: boolean;
    opensAt: Date | string;
    closesAt: Date | string;
  },
  now = Date.now(),
): AdmissionPeriodStatus {
  if (!period.isEnabled) return "disabled";
  const opens = new Date(period.opensAt).getTime();
  const closes = new Date(period.closesAt).getTime();
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens)
    return "disabled";
  if (now >= closes) return "closed";
  return now >= opens ? "open" : "scheduled";
}
