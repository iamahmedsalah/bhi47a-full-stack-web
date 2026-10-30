export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  ASSISTANT_LECTURER: 'assistant_lecturer',
  TEACHING_ASSISTANT: 'teaching_assistant',
  ACCOUNTANT: 'accountant',
  ADMINISTRATIVE: 'administrative',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];

export const STAFF_TYPE_VALUES: StaffType[] = Object.values(STAFF_TYPES);
