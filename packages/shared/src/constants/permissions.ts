export const PERMISSIONS = {
  STUDENTS_READ: 'students.read',
  STUDENTS_WRITE: 'students.write',
  STUDENTS_RESET_PASSWORD: 'students.reset_password',
  COURSES_READ: 'courses.read',
  COURSES_WRITE: 'courses.write',
  GRADES_READ: 'grades.read',
  GRADES_WRITE: 'grades.write',
  GRADES_DELETE: 'grades.delete',
  ACADEMIC_EMAILS_READ: 'academic_emails.read',
  ACADEMIC_EMAILS_WRITE: 'academic_emails.write',
  COMPLAINTS_READ: 'complaints.read',
  COMPLAINTS_REPLY: 'complaints.reply',
  COMPLAINTS_WRITE: 'complaints.write',
  COMPLAINTS_MANAGE_SETTINGS: 'complaints.manage_settings',
  EMAILS_READ: 'emails.read',
  EMAILS_SEND: 'emails.send',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_SEND: 'notifications.send',
  FAQS_READ: 'faqs.read',
  FAQS_WRITE: 'faqs.write',
  UPLOADS_IMPORT: 'uploads.import',
  EXAM_SCHEDULES_READ: 'exam_schedules.read',
  EXAM_SCHEDULES_WRITE: 'exam_schedules.write',
  DANGER_ZONE_DELETE_ALL: 'danger_zone.delete_all',
  REGISTRATION_READ: 'registration.read',
  REGISTRATION_WRITE: 'registration.write',
  REGISTRATION_PROXY: 'registration.proxy',
  ADVISING_READ: 'advising.read',
  ADVISING_WRITE: 'advising.write',
  ADVISING_OVERRIDE_PREREQUISITES: 'advising.override_prerequisites',
  ADVISING_OVERRIDE_MAX_HOURS: 'advising.override_max_hours',
  STUDY_PLAN_MANAGE: 'study_plan.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_VALUES: Permission[] = Object.values(PERMISSIONS);

/**
 * Capabilities an administrator may delegate to a staff account.
 * Administrative account lifecycle and danger-zone operations are deliberately
 * excluded and remain protected by the admin role itself.
 */
export const STAFF_ASSIGNABLE_PERMISSIONS = [
  PERMISSIONS.STUDENTS_READ,
  PERMISSIONS.STUDENTS_WRITE,
  PERMISSIONS.STUDENTS_RESET_PASSWORD,
  PERMISSIONS.COURSES_READ,
  PERMISSIONS.COURSES_WRITE,
  PERMISSIONS.GRADES_READ,
  PERMISSIONS.GRADES_WRITE,
  PERMISSIONS.GRADES_DELETE,
  PERMISSIONS.ACADEMIC_EMAILS_READ,
  PERMISSIONS.ACADEMIC_EMAILS_WRITE,
  PERMISSIONS.COMPLAINTS_READ,
  PERMISSIONS.COMPLAINTS_REPLY,
  PERMISSIONS.COMPLAINTS_WRITE,
  PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,
  PERMISSIONS.EMAILS_READ,
  PERMISSIONS.EMAILS_SEND,
  PERMISSIONS.NOTIFICATIONS_READ,
  PERMISSIONS.NOTIFICATIONS_SEND,
  PERMISSIONS.FAQS_READ,
  PERMISSIONS.FAQS_WRITE,
  PERMISSIONS.UPLOADS_IMPORT,
  PERMISSIONS.EXAM_SCHEDULES_READ,
  PERMISSIONS.EXAM_SCHEDULES_WRITE,
  PERMISSIONS.REGISTRATION_READ,
  PERMISSIONS.REGISTRATION_WRITE,
  PERMISSIONS.REGISTRATION_PROXY,
  PERMISSIONS.ADVISING_READ,
  PERMISSIONS.ADVISING_WRITE,
  PERMISSIONS.ADVISING_OVERRIDE_PREREQUISITES,
  PERMISSIONS.ADVISING_OVERRIDE_MAX_HOURS,
  PERMISSIONS.STUDY_PLAN_MANAGE,
] as const satisfies readonly Permission[];

export type StaffAssignablePermission =
  (typeof STAFF_ASSIGNABLE_PERMISSIONS)[number];
