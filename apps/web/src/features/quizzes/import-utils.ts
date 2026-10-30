import type { QuizQuestion } from './api';

/** Replace the sheet's entire question set, retaining IDs of unchanged questions. */
export function replaceImportedQuestions(current: QuizQuestion[], imported: QuizQuestion[]): QuizQuestion[] {
  const signature = (question: QuizQuestion) => JSON.stringify([question.type, question.text.trim(), question.options]);
  const matches = new Map<string, { questions: QuizQuestion[]; next: number }>();
  for (const question of current) {
    const key = signature(question);
    const bucket = matches.get(key) ?? { questions: [], next: 0 };
    bucket.questions.push(question);
    matches.set(key, bucket);
  }
  return imported.map((question) => {
    const bucket = matches.get(signature(question));
    const existing = bucket?.questions[bucket.next++];
    if (!existing) return question;
    return { ...question, id: existing.id, explanation: question.explanation ?? existing.explanation };
  });
}
