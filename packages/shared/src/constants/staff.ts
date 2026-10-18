export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  TEACHING_ASSISTANT: 'teaching_assistant',
  ADMINISTRATIVE: 'administrative',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];

export const STAFF_TYPE_VALUES: StaffType[] = Object.values(STAFF_TYPES);
