export const QUIZ_RELEASE_MODES = ['manual', 'after_close'] as const;
export type QuizReleaseMode = (typeof QUIZ_RELEASE_MODES)[number];
