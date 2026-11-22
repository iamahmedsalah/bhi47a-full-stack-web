import { PERMISSIONS, type Permission } from "@student-portal/shared";

export interface ControlPermissionSubgroup {
  key: string;
  titleAr: string;
  titleEn: string;
  permissions: readonly Permission[];
}

export interface ControlRolePreset {
  key: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  permissions: readonly Permission[];
}

export const CONTROL_PERMISSION_SUBGROUPS: readonly ControlPermissionSubgroup[] = [
  {
    key: "access_and_scope",
    titleAr: "١. الدخول والعرض والنطاق",
    titleEn: "1. Access, View & Course Scope",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SCOPE_ALL,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
    ],
  },
  {
    key: "entry_and_files",
    titleAr: "٢. الرصد والإدخال وملفات الإكسل",
    titleEn: "2. Grade Entry, States & Excel",
    permissions: [
      PERMISSIONS.CONTROL_SHEETS_CREATE,
      PERMISSIONS.CONTROL_GRADES_ENTER,
      PERMISSIONS.CONTROL_SHEETS_SUBMIT,
      PERMISSIONS.CONTROL_STATES_MANAGE,
      PERMISSIONS.CONTROL_IMPORT,
      PERMISSIONS.CONTROL_EXPORT,
    ],
  },
  {
    key: "review_and_rules",
    titleAr: "٣. المراجعة والرأفة وضبط الدرجات",
    titleEn: "3. Review, Grace Marks & Schemes",
    permissions: [
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
      PERMISSIONS.CONTROL_GRADES_GRACE,
      PERMISSIONS.CONTROL_SCHEMES_MANAGE,
    ],
  },
  {
    key: "approval_and_locks",
    titleAr: "٤. الاعتماد وقفل الكنترول",
    titleEn: "4. Approval & Control Locking",
    permissions: [
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
      PERMISSIONS.CONTROL_FINAL_APPROVE,
      PERMISSIONS.CONTROL_SHEETS_LOCK,
      PERMISSIONS.CONTROL_SHEETS_UNLOCK,
    ],
  },
  {
    key: "petitions_and_emergency",
    titleAr: "٥. الالتماسات وإجراءات الطوارئ العليا",
    titleEn: "5. Grade Petitions & Emergency Reset",
    permissions: [
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
      PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      PERMISSIONS.CONTROL_SHEETS_REOPEN,
      PERMISSIONS.CONTROL_GRADES_EDIT_PUBLISHED,
    ],
  },
] as const;

export const CONTROL_ROLE_PRESETS: readonly ControlRolePreset[] = [
  {
    key: "doctor_entry",
    labelAr: "مسؤول رصد (دكتور / معيد)",
    labelEn: "Grade Entry (Doctor / TA)",
    descriptionAr: "فتح الكشف ورصد الدرجات وإرسالها للمراجعة لمقرراته فقط",
    descriptionEn: "Open sheet, enter grades, and submit for review on assigned courses",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SHEETS_CREATE,
      PERMISSIONS.CONTROL_GRADES_ENTER,
      PERMISSIONS.CONTROL_SHEETS_SUBMIT,
      PERMISSIONS.CONTROL_IMPORT,
      PERMISSIONS.CONTROL_EXPORT,
    ],
  },
  {
    key: "control_reviewer",
    labelAr: "مراجع كنترول",
    labelEn: "Control Reviewer",
    descriptionAr: "مراجعة الكشوف وتصحيحها أو إرجاعها ورفعها للاعتماد بدون اعتماد نهائي",
    descriptionEn: "Review sheets, correct during review, return or forward for approval",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SCOPE_ALL,
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
      PERMISSIONS.CONTROL_STATES_MANAGE,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
      PERMISSIONS.CONTROL_EXPORT,
    ],
  },
  {
    key: "control_head",
    labelAr: "رئيس الكنترول",
    labelEn: "Control Head",
    descriptionAr:
      "مراجعة واعتماد الميدتيرم وأعمال السنة، الرأفة، قفل الكنترول، وتقديم طلبات الالتماس (بدون إعادة فتح أو فك قفل)",
    descriptionEn:
      "Approve midterm/coursework, apply grace marks, lock sheets, and submit petitions (no reopen or unlock)",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SHEETS_CREATE,
      PERMISSIONS.CONTROL_SCOPE_ALL,
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
      PERMISSIONS.CONTROL_STATES_MANAGE,
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
      PERMISSIONS.CONTROL_GRADES_GRACE,
      PERMISSIONS.CONTROL_SCHEMES_MANAGE,
      PERMISSIONS.CONTROL_SHEETS_LOCK,
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
      PERMISSIONS.CONTROL_EXPORT,
    ],
  },
  {
    key: "dean_approver",
    labelAr: "عميد / اعتماد نهائي والتماسات",
    labelEn: "Dean / Final & Petition Approver",
    descriptionAr: "اعتماد النتيجة النهائية (الفاينل) والبت في طلبات التماس تعديل الدرجات",
    descriptionEn: "Approve final official results and decide student grade petitions",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SCOPE_ALL,
      PERMISSIONS.CONTROL_FINAL_APPROVE,
      PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
      PERMISSIONS.CONTROL_EXPORT,
    ],
  },
] as const;

export const STAFF_PERMISSION_GROUPS: ReadonlyArray<{
  key: string;
  permissions: readonly Permission[];
}> = [
  {
    key: "students",
    permissions: [
      PERMISSIONS.STUDENTS_READ,
      PERMISSIONS.STUDENTS_WRITE,
      PERMISSIONS.STUDENTS_RESET_PASSWORD,
      PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID,
      PERMISSIONS.STUDENTS_VIEW_PHONE,
      PERMISSIONS.STUDENTS_EXPORT,
      PERMISSIONS.STUDENTS_MANAGE_STATUS,
    ],
  },
  {
    key: "courses",
    permissions: [
      PERMISSIONS.COURSES_READ,
      PERMISSIONS.COURSES_WRITE,
      PERMISSIONS.COURSES_STUDENT_ENROLLMENT_MANAGE,
    ],
  },
  {
    key: "grades",
    permissions: [
      PERMISSIONS.GRADES_READ,
      PERMISSIONS.GRADES_WRITE,
      PERMISSIONS.GRADES_PUBLISH,
      PERMISSIONS.GRADES_HISTORICAL_PUBLISH,
      PERMISSIONS.GRADES_VISIBILITY_MANAGE,
      PERMISSIONS.GRADES_DELETE,
      PERMISSIONS.GRADES_EXPORT,
    ],
  },
  {
    key: "academicEmails",
    permissions: [
      PERMISSIONS.ACADEMIC_EMAILS_READ,
      PERMISSIONS.ACADEMIC_EMAILS_WRITE,
    ],
  },
  {
    key: "complaints",
    permissions: [
      PERMISSIONS.COMPLAINTS_READ,
      PERMISSIONS.COMPLAINTS_REPLY,
      PERMISSIONS.COMPLAINTS_WRITE,
      PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,
    ],
  },
  {
    key: "communications",
    permissions: [
      PERMISSIONS.EMAILS_READ,
      PERMISSIONS.EMAILS_SEND,
      PERMISSIONS.NOTIFICATIONS_READ,
      PERMISSIONS.NOTIFICATIONS_SEND,
    ],
  },
  {
    key: "faqs",
    permissions: [PERMISSIONS.FAQS_READ, PERMISSIONS.FAQS_WRITE],
  },
  {
    key: "uploads",
    permissions: [PERMISSIONS.UPLOADS_IMPORT],
  },
  {
    key: "exams",
    permissions: [
      PERMISSIONS.EXAM_SCHEDULES_READ,
      PERMISSIONS.EXAM_SCHEDULES_WRITE,
    ],
  },
  {
    key: "quizzes",
    permissions: [
      PERMISSIONS.QUIZZES_READ,
      PERMISSIONS.QUIZZES_WRITE,
      PERMISSIONS.QUIZZES_SUBMISSIONS_READ,
    ],
  },
  {
    key: "attendance",
    permissions: [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_WRITE,
      PERMISSIONS.ATTENDANCE_DELETE,
      PERMISSIONS.ATTENDANCE_SESSION_CREATE,
      PERMISSIONS.ATTENDANCE_SESSION_CLOSE,
      PERMISSIONS.ATTENDANCE_MANUAL_MARK,
      PERMISSIONS.ATTENDANCE_REPORTS,
    ],
  },
  {
    key: "registration",
    permissions: [
      PERMISSIONS.REGISTRATION_READ,
      PERMISSIONS.REGISTRATION_WRITE,
      PERMISSIONS.REGISTRATION_PROXY,
    ],
  },
  {
    key: "admissions",
    permissions: [
      PERMISSIONS.ADMISSIONS_PERIODS_READ,
      PERMISSIONS.ADMISSIONS_PERIODS_MANAGE,
      PERMISSIONS.ADMISSIONS_REQUESTS_READ,
      PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE,
      PERMISSIONS.ADMISSIONS_REQUESTS_APPROVE,
      PERMISSIONS.ADMISSIONS_REQUESTS_REJECT,
      PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST,
      PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL,
      PERMISSIONS.ADMISSIONS_ACADEMIC_MANAGE,
      PERMISSIONS.ADMISSIONS_GROUPS_MANAGE,
      PERMISSIONS.ADMISSIONS_ACCESS_MANAGE,
      PERMISSIONS.ADMISSIONS_EXPORT,
      PERMISSIONS.ADMISSIONS_IMPORT,
    ],
  },
  {
    key: "studentCodes",
    permissions: [
      PERMISSIONS.STUDENT_CODES_READ,
      PERMISSIONS.STUDENT_CODES_MANAGE,
      PERMISSIONS.STUDENT_CODES_RECOVER,
      PERMISSIONS.STUDENT_CODES_DELETE_STUDENT,
      PERMISSIONS.STUDENT_CODES_EXPORT,
    ],
  },
  {
    key: "advising",
    permissions: [
      PERMISSIONS.ADVISING_READ,
      PERMISSIONS.ADVISING_WRITE,
      PERMISSIONS.ADVISING_OVERRIDE_PREREQUISITES,
      PERMISSIONS.ADVISING_OVERRIDE_MAX_HOURS,
      PERMISSIONS.STUDY_PLAN_MANAGE,
    ],
  },
  {
    key: "courseSchedules",
    permissions: [
      PERMISSIONS.COURSE_SCHEDULES_READ,
      PERMISSIONS.COURSE_SCHEDULES_WRITE,
    ],
  },
  {
    key: "tuition",
    permissions: [
      PERMISSIONS.TUITION_READ,
      PERMISSIONS.TUITION_WRITE,
      PERMISSIONS.TUITION_AUDIT_READ,
      PERMISSIONS.TUITION_EXPORT_ADVANCED,
    ],
  },
  {
    key: "courseMaterials",
    permissions: [
      PERMISSIONS.COURSE_MATERIALS_READ,
      PERMISSIONS.COURSE_MATERIALS_WRITE,
      PERMISSIONS.COURSE_MATERIALS_DELETE,
    ],
  },
  {
    key: "staffManagement",
    permissions: [PERMISSIONS.STAFF_READ, PERMISSIONS.STAFF_CREATE_ACADEMIC],
  },
  {
    key: "analytics",
    permissions: [PERMISSIONS.ANALYTICS_READ, PERMISSIONS.ANALYTICS_EXPORT],
  },
  {
    key: "control",
    permissions: [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SCOPE_ALL,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
      PERMISSIONS.CONTROL_SHEETS_CREATE,
      PERMISSIONS.CONTROL_GRADES_ENTER,
      PERMISSIONS.CONTROL_SHEETS_SUBMIT,
      PERMISSIONS.CONTROL_STATES_MANAGE,
      PERMISSIONS.CONTROL_IMPORT,
      PERMISSIONS.CONTROL_EXPORT,
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
      PERMISSIONS.CONTROL_GRADES_GRACE,
      PERMISSIONS.CONTROL_SCHEMES_MANAGE,
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
      PERMISSIONS.CONTROL_FINAL_APPROVE,
      PERMISSIONS.CONTROL_SHEETS_LOCK,
      PERMISSIONS.CONTROL_SHEETS_UNLOCK,
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
      PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      PERMISSIONS.CONTROL_SHEETS_REOPEN,
      PERMISSIONS.CONTROL_GRADES_EDIT_PUBLISHED,
    ],
  },
];
