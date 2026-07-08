export const ENROLLMENT_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  GRADUATED: 'graduated',
  SUSPENDED: 'suspended',
} as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[keyof typeof ENROLLMENT_STATUSES];

export const ENROLLMENT_STATUS_VALUES: EnrollmentStatus[] = Object.values(ENROLLMENT_STATUSES);
