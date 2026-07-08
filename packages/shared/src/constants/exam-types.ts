export const EXAM_TYPES = {
  QUIZ: 'quiz',
  MIDTERM: 'midterm',
  FINAL: 'final',
} as const;

export type ExamType = (typeof EXAM_TYPES)[keyof typeof EXAM_TYPES];

export const EXAM_TYPE_VALUES: ExamType[] = Object.values(EXAM_TYPES);
