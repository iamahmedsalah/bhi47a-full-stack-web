import {
  attemptQuestions,
  selectAttemptQuestions,
  validateRandomization,
} from './quiz-randomization.policy';
import type { QuizQuestion } from './schemas/quiz.schema';

function bank(count: number): QuizQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i}`,
    text: `Question ${i}`,
    type: i % 2 ? 'mcq' : 'true_false',
    options: ['A', 'B'],
    correctOptionIndex: 0,
    points: 2,
  }));
}

describe('randomized quiz policy', () => {
  it.each([10, 20, 50])(
    'requires three bank questions per displayed question (%i)',
    (count) => {
      const settings = {
        randomizeQuestions: true,
        mcqCount: count / 2,
        trueFalseCount: count / 2,
        questions: bank(count * 3),
      };
      expect(validateRandomization(settings)).toBe(count * 2);
      expect(() =>
        validateRandomization({ ...settings, questions: bank(count * 3 - 1) }),
      ).toThrow('at least');
    },
  );

  it('selects exact type quotas without duplicates and shuffles per attempt', () => {
    const quiz = {
      randomizeQuestions: true,
      mcqCount: 5,
      trueFalseCount: 5,
      questions: bank(30),
    };
    const selected = selectAttemptQuestions(quiz)!;
    expect(selected).toHaveLength(10);
    expect(selected.filter((q) => q.type === 'mcq')).toHaveLength(5);
    expect(selected.filter((q) => q.type === 'true_false')).toHaveLength(5);
    expect(new Set(selected.map((q) => q.id)).size).toBe(10);
    expect(
      new Set(
        Array.from({ length: 5 }, () =>
          JSON.stringify(selectAttemptQuestions(quiz)!.map((q) => q.id)),
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(quiz.questions).toEqual(bank(30));
  });

  it('supports a single question type and rejects invalid quotas', () => {
    const quiz = {
      randomizeQuestions: true,
      mcqCount: 10,
      trueFalseCount: 0,
      questions: bank(30),
    };
    expect(selectAttemptQuestions(quiz)!.every((q) => q.type === 'mcq')).toBe(
      true,
    );
    for (const mcqCount of [-1, 0.5, 51])
      expect(() => validateRandomization({ ...quiz, mcqCount })).toThrow();
    expect(() => validateRandomization({ ...quiz, mcqCount: 0 })).toThrow();
    expect(() =>
      validateRandomization({
        ...quiz,
        mcqCount: 20,
        questions: bank(60).map((q) => ({ ...q, type: 'true_false' })),
      }),
    ).toThrow('Not enough');
  });

  it('rejects duplicate IDs and unequal points within a selected type', () => {
    const quiz = {
      randomizeQuestions: true,
      mcqCount: 5,
      trueFalseCount: 5,
      questions: bank(30),
    };
    expect(() =>
      validateRandomization({
        ...quiz,
        questions: quiz.questions.map((q) => ({ ...q, id: 'same' })),
      }),
    ).toThrow('unique');
    quiz.questions[0].points = 5;
    expect(() => validateRandomization(quiz)).toThrow('equal points');
  });

  it('uses the saved questions even when the bank changes and preserves legacy attempts', () => {
    const saved = bank(10);
    expect(
      attemptQuestions({ questions: bank(60) }, { assignedQuestions: saved }),
    ).toBe(saved);
    const quiz = { questions: bank(4), randomizeQuestions: false };
    expect(selectAttemptQuestions(quiz)).toBeUndefined();
    expect(attemptQuestions(quiz)).toBe(quiz.questions);
    expect(validateRandomization(quiz)).toBe(8);
  });
});
