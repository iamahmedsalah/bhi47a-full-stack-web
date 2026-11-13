import { EXAM_TYPE_VALUES, type ExamType } from "./exam-types";

/** Official grade publication does not control instructor-managed quizzes. */
export const CONTROL_RESULT_EXAM_TYPES: ExamType[] = [
  "coursework",
  "midterm",
  "final",
];

export interface GradeVisibilityRule {
  courseCode?: string;
  studentCode?: string;
  examType?: ExamType;
  isVisible: boolean;
}

export interface GradeVisibilitySettings {
  gradesLevelBasis?: "student" | "course";
  gradesSystemOpen?: boolean;
  gradesOpenAt?: string | null;
  gradesCloseAt?: string | null;
  gradesPublishedLevels?: string[];
  gradesPublishedExamTypes?: ExamType[];
  gradesVisibilityRules?: GradeVisibilityRule[];
}

/** Visibility never publishes drafts or bypasses approval: apply to released rows only. */
export function isReleasedGradeVisible(
  settings: GradeVisibilitySettings,
  student: { level: string; studentCode?: string },
  grade: { courseCode: string; examType: string; academicLevel?: string },
  now = Date.now(),
): boolean {
  if (settings.gradesSystemOpen === false) return false;
  if (settings.gradesOpenAt && now < Date.parse(settings.gradesOpenAt))
    return false;
  if (settings.gradesCloseAt && now >= Date.parse(settings.gradesCloseAt))
    return false;
  if (
    !(settings.gradesPublishedLevels ?? ["1", "2", "3", "4"]).includes(
      settings.gradesLevelBasis !== "student"
        ? (grade.academicLevel ?? student.level)
        : student.level,
    )
  )
    return false;
  let visible = (
    settings.gradesPublishedExamTypes ?? EXAM_TYPE_VALUES
  ).includes(grade.examType as ExamType);
  for (const rule of settings.gradesVisibilityRules ?? []) {
    if (
      rule.courseCode &&
      rule.courseCode.toUpperCase() !== grade.courseCode.toUpperCase()
    )
      continue;
    if (rule.studentCode && rule.studentCode !== student.studentCode) continue;
    if (rule.examType && rule.examType !== grade.examType) continue;
    visible = rule.isVisible;
  }
  return visible;
}
