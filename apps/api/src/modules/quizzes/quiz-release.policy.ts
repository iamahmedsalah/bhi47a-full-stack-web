import type { QuizReleaseMode } from '@student-portal/shared';

export interface QuizReleaseSettings {
  isPublished: boolean;
  publishResults?: boolean;
  allowReview?: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  endsAt?: Date | string | null;
}

/** Evaluate against server time on every response, never inside a cached manifest. */
export function getQuizReleaseState(
  quiz: QuizReleaseSettings,
  now = Date.now(),
) {
  const endsAt = quiz.endsAt ? new Date(quiz.endsAt).getTime() : NaN;
  const hasDeadline = Number.isFinite(endsAt);
  const isEnded = hasDeadline && now >= endsAt;
  const resultsAvailable =
    Boolean(quiz.isPublished) &&
    (quiz.resultsReleaseMode === 'after_close'
      ? isEnded
      : Boolean(quiz.publishResults));
  const reviewEnabled =
    quiz.reviewReleaseMode === 'after_close'
      ? isEnded
      : quiz.allowReview !== false;
  const reviewAvailable =
    resultsAvailable && reviewEnabled && (!quiz.endsAt || isEnded);
  return { resultsAvailable, reviewAvailable, isEnded };
}
