export const GRADE_STATUSES = {
  PRESENT: 'present',
  ABSENT: 'absent',
  BANNED: 'banned',
} as const;

export type GradeStatus = (typeof GRADE_STATUSES)[keyof typeof GRADE_STATUSES];

export const GRADE_STATUS_VALUES: GradeStatus[] = Object.values(GRADE_STATUSES);
