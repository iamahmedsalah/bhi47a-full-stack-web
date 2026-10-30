import assert from 'node:assert/strict';
import test from 'node:test';
import { nextQuizReleaseDelay, releaseStatus } from '../src/features/quizzes/release-utils.ts';

const now = Date.parse('2026-10-30T21:00:00Z');
test('one page timer picks the nearest release and staggers it by zero to five seconds', () => {
  const quizzes = [20_000, 10_000, 40_000].map((ms) => ({ endsAt: new Date(now + ms).toISOString(), resultsReleaseMode: 'after_close' }));
  assert.equal(nextQuizReleaseDelay(quizzes, now, 0), 10_000);
  assert.equal(nextQuizReleaseDelay(quizzes, now, 1), 15_000);
  assert.equal(nextQuizReleaseDelay([], now), undefined);
  assert.equal(nextQuizReleaseDelay([{ endsAt: 'invalid', resultsReleaseMode: 'after_close' }], now), undefined);
});
test('handles a response crossing the deadline, then stops refreshing an already closed quiz', () => {
  const quiz = { endsAt: new Date(now).toISOString(), resultsReleaseMode: 'after_close' };
  assert.equal(nextQuizReleaseDelay([{ ...quiz, isEnded: false }], now + 1, 0), 50);
  assert.equal(nextQuizReleaseDelay([{ ...quiz, isEnded: true }], now + 1), undefined);
});
test('scheduled review shows waiting for marks after closing and distinguishes hidden and available states', () => {
  const quiz = { isPublished: true, allowReview: false, isEnded: false, resultsReleaseMode: 'after_close', reviewReleaseMode: 'after_close' };
  assert.equal(releaseStatus(quiz, 'results'), 'scheduled');
  assert.equal(releaseStatus({ ...quiz, isEnded: true }, 'review'), 'waiting');
  assert.equal(releaseStatus({ ...quiz, reviewAvailable: true }, 'review'), 'available');
  assert.equal(releaseStatus({ ...quiz, reviewReleaseMode: 'manual' }, 'review'), 'hidden');
  assert.equal(releaseStatus({ ...quiz, isPublished: false }, 'results'), 'hidden');
  assert.equal(releaseStatus({ ...quiz, allowReview: undefined, reviewReleaseMode: 'manual', endsAt: new Date(now + 10000).toISOString() }, 'review'), 'scheduled');
});
