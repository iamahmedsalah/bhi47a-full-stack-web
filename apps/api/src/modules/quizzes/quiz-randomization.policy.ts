import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { Quiz, QuizQuestion } from './schemas/quiz.schema';

type Settings = Pick<
  Quiz,
  'questions' | 'randomizeQuestions' | 'mcqCount' | 'trueFalseCount'
>;

export function validateRandomization(quiz: Settings): number {
  const questions = quiz.questions ?? [];
  if (!quiz.randomizeQuestions)
    return questions.reduce((sum, q) => sum + q.points, 0);
  const counts = {
    mcq: quiz.mcqCount ?? 0,
    true_false: quiz.trueFalseCount ?? 0,
  };
  const count = counts.mcq + counts.true_false;
  if (
    !Object.values(counts).every((n) => Number.isInteger(n) && n >= 0) ||
    count < 1 ||
    count > 50
  ) {
    throw new BadRequestException(
      'Select between 1 and 50 questions / اختر من 1 إلى 50 سؤالاً',
    );
  }
  const minimum = count * 3;
  if (questions.length < minimum) {
    throw new BadRequestException(
      `Question bank requires at least ${minimum} questions / بنك الأسئلة يتطلب ${minimum} سؤالاً على الأقل`,
    );
  }
  if (new Set(questions.map((q) => q.id)).size !== questions.length) {
    throw new BadRequestException(
      'Question IDs must be unique / معرفات الأسئلة يجب أن تكون فريدة',
    );
  }
  let marks = 0;
  for (const type of ['mcq', 'true_false'] as const) {
    const pool = questions.filter((q) => q.type === type);
    if (counts[type] > pool.length) {
      throw new BadRequestException(
        'Not enough questions of the selected type / عدد الأسئلة غير كافٍ للنوع المحدد',
      );
    }
    // Equal marks within each type keep all randomized versions equally weighted.
    if (counts[type] && pool.some((q) => q.points !== pool[0].points)) {
      throw new BadRequestException(
        'Use equal points within each question type / استخدم نفس الدرجة لجميع أسئلة النوع الواحد',
      );
    }
    marks += counts[type] * (pool[0]?.points ?? 0);
  }
  return marks;
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectAttemptQuestions(
  quiz: Settings,
): QuizQuestion[] | undefined {
  if (!quiz.randomizeQuestions) return undefined;
  validateRandomization(quiz);
  return shuffled([
    ...shuffled(quiz.questions.filter((q) => q.type === 'mcq')).slice(
      0,
      quiz.mcqCount ?? 0,
    ),
    ...shuffled(quiz.questions.filter((q) => q.type === 'true_false')).slice(
      0,
      quiz.trueFalseCount ?? 0,
    ),
  ]);
}

export function attemptQuestions(
  quiz: Pick<Quiz, 'questions'>,
  attempt?: { assignedQuestions?: QuizQuestion[] },
): QuizQuestion[] {
  return attempt?.assignedQuestions?.length
    ? attempt.assignedQuestions
    : (quiz.questions ?? []);
}
