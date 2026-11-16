import { createHash } from 'node:crypto';
import {
  DEFAULT_RESULT_POLICY,
  evaluateOfficialResult,
  type ResultPolicy,
} from './official-result.util';

export interface AttemptMark {
  id: string;
  component: 'coursework' | 'midterm' | 'final';
  grade: number;
  maxGrade: number;
  status: string;
  rev: number;
  attendanceMark?: number;
  quizzesMark?: number;
}
export interface CourseAttempt {
  academicYear: string;
  semester: string;
  marks: AttemptMark[];
  policy?: ResultPolicy;
}
export const attemptOrder = (scope: {
  academicYear: string;
  semester: string;
}) =>
  `${scope.academicYear}|${({ first: 1, second: 2, summer: 3 } as Record<string, number>)[scope.semester] ?? 0}`;
export const attemptFingerprint = (attempt: CourseAttempt) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        attempt.academicYear,
        attempt.semester,
        attempt.policy
          ? [
              attempt.policy.passPercentage,
              attempt.policy.finalMinimumPercentage,
            ]
          : null,
        [...attempt.marks]
          .sort((a, b) => a.component.localeCompare(b.component))
          .map((m) => [
            m.id,
            m.component,
            m.grade,
            m.maxGrade,
            m.status,
            m.rev,
            m.attendanceMark,
            m.quizzesMark,
          ]),
      ]),
    )
    .digest('hex');

export function summarizeAttempt(attempt: CourseAttempt) {
  const keys = ['coursework', 'midterm', 'final'] as const;
  const marks = new Map(attempt.marks.map((mark) => [mark.component, mark]));
  const result = evaluateOfficialResult(
    keys.map((key) => ({
      key,
      nameAr: key,
      nameEn: key,
      max: marks.get(key)?.maxGrade ?? 0,
      step: 0.01,
      enabled: true,
    })),
    Object.fromEntries(
      attempt.marks.map((mark) => [
        mark.component,
        { status: mark.status, score: mark.grade },
      ]),
    ),
    attempt.policy ?? DEFAULT_RESULT_POLICY,
  );
  return { ...attempt, fingerprint: attemptFingerprint(attempt), result };
}
export function compareAttempts(
  previous: CourseAttempt,
  current: CourseAttempt,
) {
  const old = summarizeAttempt(previous),
    next = summarizeAttempt(current);
  const canAcceptNew =
    next.result.official &&
    (!old.result.official ||
      (next.result.percentage ?? -1) > (old.result.percentage ?? -1));
  return {
    previous: old,
    current: next,
    canAcceptNew,
    recommendation: canAcceptNew
      ? ('accept_new' as const)
      : ('keep_previous' as const),
    fingerprint: createHash('sha256')
      .update(`${old.fingerprint}|${next.fingerprint}`)
      .digest('hex'),
  };
}
