export const ATTENDANCE_SESSION_TYPES = {
  LECTURE: 'lecture',
  SECTION: 'section',
  LAB: 'lab',
} as const;

export type AttendanceSessionType =
  (typeof ATTENDANCE_SESSION_TYPES)[keyof typeof ATTENDANCE_SESSION_TYPES];

export const ATTENDANCE_SESSION_TYPE_VALUES: AttendanceSessionType[] =
  Object.values(ATTENDANCE_SESSION_TYPES);

export const ATTENDANCE_SESSION_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const;

export type AttendanceSessionStatus =
  (typeof ATTENDANCE_SESSION_STATUSES)[keyof typeof ATTENDANCE_SESSION_STATUSES];

export const ATTENDANCE_SESSION_STATUS_VALUES: AttendanceSessionStatus[] =
  Object.values(ATTENDANCE_SESSION_STATUSES);

export const ATTENDANCE_RECORD_STATUSES = {
  PRESENT: 'present',
  LATE: 'late',
  EXCUSED: 'excused',
  ABSENT: 'absent',
} as const;

export type AttendanceRecordStatus =
  (typeof ATTENDANCE_RECORD_STATUSES)[keyof typeof ATTENDANCE_RECORD_STATUSES];

export const ATTENDANCE_RECORD_STATUS_VALUES: AttendanceRecordStatus[] =
  Object.values(ATTENDANCE_RECORD_STATUSES);

export const ATTENDANCE_METHODS = {
  QR: 'qr',
  MANUAL: 'manual',
} as const;

export type AttendanceMethod =
  (typeof ATTENDANCE_METHODS)[keyof typeof ATTENDANCE_METHODS];

export const ATTENDANCE_METHOD_VALUES: AttendanceMethod[] =
  Object.values(ATTENDANCE_METHODS);

export const STAFF_ACADEMIC_POSITIONS = {
  DOCTOR: 'doctor',
  INSTRUCTOR: 'instructor',
} as const;

export type StaffAcademicPosition =
  (typeof STAFF_ACADEMIC_POSITIONS)[keyof typeof STAFF_ACADEMIC_POSITIONS];

export const STAFF_ACADEMIC_POSITION_VALUES: StaffAcademicPosition[] =
  Object.values(STAFF_ACADEMIC_POSITIONS);

export const ATTENDANCE_CONFIG_DEFAULTS = {
  SESSION_DURATION_MINUTES: 15,
  QR_ROTATION_SECONDS: 25,
  LATE_AFTER_MINUTES: 10,
  QR_TOLERANCE_SECONDS: 5,
} as const;
