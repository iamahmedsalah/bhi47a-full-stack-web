export const GRADE_STATUSES = {
  PRESENT: 'present',
  ABSENT: 'absent',
  BANNED: 'banned',
  /** Absent with an accepted excuse: deferred, neither zero nor fail. */
  EXCUSED: 'excused',
  /** Result withheld from display (financial/administrative reasons). */
  WITHHELD: 'withheld',
  /** Deferred / incomplete until the student completes the component. */
  INCOMPLETE: 'incomplete',
} as const;

export type GradeStatus = (typeof GRADE_STATUSES)[keyof typeof GRADE_STATUSES];

export const GRADE_STATUS_VALUES: GradeStatus[] = Object.values(GRADE_STATUSES);
