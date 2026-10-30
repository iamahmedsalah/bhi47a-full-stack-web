import type { QuizReleaseMode } from '@student-portal/shared';

export type ReleaseStatus = 'hidden' | 'scheduled' | 'available' | 'waiting';
export interface ReleaseView {
  isPublished: boolean;
  endsAt?: string;
  isEnded?: boolean;
  allowReview: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  resultsAvailable?: boolean;
  reviewAvailable?: boolean;
  publishResults?: boolean;
}

export interface ReleaseDeadline {
  endsAt?: string;
  isEnded?: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  allowReview?: boolean;
  publishResults?: boolean;
}

export function releaseStatus(quiz: ReleaseView, kind: 'results' | 'review'): ReleaseStatus {
  if (!quiz.isPublished) return 'hidden';
  if (kind === 'results') {
    if (quiz.resultsAvailable) return 'available';
    return quiz.resultsReleaseMode === 'after_close' && !quiz.isEnded ? 'scheduled' : 'hidden';
  }
  if (quiz.reviewAvailable) return 'available';
  if (quiz.reviewReleaseMode !== 'after_close' && quiz.allowReview === false) return 'hidden';
  if (quiz.endsAt && !quiz.isEnded) return 'scheduled';
  return !quiz.resultsAvailable ? 'waiting' : 'hidden';
}

/** One deadline per page; server-relative time avoids depending on the device clock. */
export function nextQuizReleaseDelay(
  quizzes: ReleaseDeadline[],
  serverNow: number,
  random = Math.random(),
): number | undefined {
  const deadlines = quizzes
    .filter((quiz) => quiz.resultsReleaseMode === 'after_close' || quiz.reviewReleaseMode === 'after_close' || (quiz.allowReview && quiz.publishResults))
    .map((quiz) => ({ deadline: Date.parse(quiz.endsAt ?? ''), isEnded: quiz.isEnded }))
    .filter(({ deadline, isEnded }) => Number.isFinite(deadline) && (deadline > serverNow || isEnded === false))
    .map(({ deadline }) => Math.max(0, deadline - serverNow));
  if (!deadlines.length) return undefined;
  return Math.min(2_147_000_000, Math.max(50, Math.min(...deadlines) + Math.floor(Math.max(0, Math.min(1, random)) * 5000)));
}
