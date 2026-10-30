import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuizDto, UpdateQuizDto } from './dto/quiz.dto';
import {
  getQuizReleaseState,
  type QuizReleaseSettings,
} from './quiz-release.policy';

const closing = Date.parse('2026-10-30T21:50:00Z');
const quiz: QuizReleaseSettings = {
  isPublished: true,
  endsAt: new Date(closing),
  publishResults: false,
  allowReview: false,
};

describe('quiz release policy', () => {
  it('compares absolute instants identically for Cairo and UTC representations', () => {
    const automatic = { ...quiz, resultsReleaseMode: 'after_close' as const };
    const instant = Date.parse('2026-07-15T09:00:00Z');
    for (const endsAt of [
      '2026-07-15T09:00:00Z',
      '2026-07-15T12:00:00+03:00',
    ]) {
      expect(
        getQuizReleaseState({ ...automatic, endsAt }, instant - 1)
          .resultsAvailable,
      ).toBe(false);
      expect(
        getQuizReleaseState({ ...automatic, endsAt }, instant).resultsAvailable,
      ).toBe(true);
    }
  });
  it.each([
    ['manual', 'manual', false, false],
    ['after_close', 'manual', true, false],
    ['manual', 'after_close', false, false],
    ['after_close', 'after_close', true, true],
  ] as const)(
    '%s marks / %s review at the global closing boundary',
    (resultsReleaseMode, reviewReleaseMode, marks, review) => {
      const settings = { ...quiz, resultsReleaseMode, reviewReleaseMode };
      expect(getQuizReleaseState(settings, closing - 1)).toMatchObject({
        resultsAvailable: false,
        reviewAvailable: false,
        isEnded: false,
      });
      for (const now of [closing, closing + 1]) {
        expect(getQuizReleaseState(settings, now)).toMatchObject({
          resultsAvailable: marks,
          reviewAvailable: review,
          isEnded: true,
        });
      }
    },
  );
  it('waits for manual marks publication before opening automatic review', () => {
    const settings = { ...quiz, reviewReleaseMode: 'after_close' as const };
    expect(getQuizReleaseState(settings, closing).reviewAvailable).toBe(false);
    expect(
      getQuizReleaseState({ ...settings, publishResults: true }, closing)
        .reviewAvailable,
    ).toBe(true);
  });
  it('retains legacy manual marks and review, while never revealing review early', () => {
    const legacy = { ...quiz, publishResults: true, allowReview: true };
    expect(getQuizReleaseState(legacy, closing - 1)).toMatchObject({
      resultsAvailable: true,
      reviewAvailable: false,
    });
    expect(getQuizReleaseState(legacy, closing)).toMatchObject({
      resultsAvailable: true,
      reviewAvailable: true,
    });
    expect(
      getQuizReleaseState({ ...legacy, endsAt: undefined }, closing)
        .reviewAvailable,
    ).toBe(true);
  });
  it('fails closed for missing deadlines, unpublished quizzes and malformed deadlines', () => {
    const scheduled = {
      ...quiz,
      resultsReleaseMode: 'after_close' as const,
      reviewReleaseMode: 'after_close' as const,
    };
    for (const changes of [
      { endsAt: undefined },
      { endsAt: 'invalid' },
      { isPublished: false },
    ]) {
      expect(
        getQuizReleaseState({ ...scheduled, ...changes }, closing + 1),
      ).toMatchObject({ resultsAvailable: false, reviewAvailable: false });
    }
  });
  it('follows an edited closing time without any job, saved publication flag, or worker', () => {
    const scheduled = {
      ...quiz,
      resultsReleaseMode: 'after_close' as const,
      reviewReleaseMode: 'after_close' as const,
    };
    expect(getQuizReleaseState(scheduled, closing).reviewAvailable).toBe(true);
    expect(
      getQuizReleaseState(
        { ...scheduled, endsAt: new Date(closing + 60000) },
        closing,
      ),
    ).toMatchObject({ resultsAvailable: false, reviewAvailable: false });
    expect(
      getQuizReleaseState(
        { ...scheduled, resultsReleaseMode: 'manual', publishResults: false },
        closing,
      ).reviewAvailable,
    ).toBe(false);
  });
  it.each([CreateQuizDto, UpdateQuizDto])(
    'rejects invalid release modes in %p',
    async (Dto) => {
      const errors = await validate(
        plainToInstance(Dto, {
          resultsReleaseMode: 'immediate',
          reviewReleaseMode: 'timer',
        }),
      );
      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['resultsReleaseMode', 'reviewReleaseMode']),
      );
    },
  );
});
