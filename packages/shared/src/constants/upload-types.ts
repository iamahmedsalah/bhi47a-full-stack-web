export const UPLOAD_TYPES = {
  STUDENTS: 'students',
  QUIZ_GRADES: 'quiz_grades',
  MIDTERM_GRADES: 'midterm_grades',
  FINAL_GRADES: 'final_grades',
  ATTENDANCE: 'attendance',
  ACADEMIC_EMAILS: 'academic_emails',
  EXAM_SEATS: 'exam_seats',
} as const;

export type UploadType = (typeof UPLOAD_TYPES)[keyof typeof UPLOAD_TYPES];

export const UPLOAD_TYPE_VALUES: UploadType[] = Object.values(UPLOAD_TYPES);
