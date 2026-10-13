import api from '@/lib/api';
import {
  downloadFileBlob,
  EXCEL_MIME_TYPE,
  CSV_MIME_TYPE,
} from '@/lib/export-utils';

export type QuestionType = 'mcq' | 'true_false';

export interface QuizQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  correctOptionIndex: number;
  points: number;
  explanation?: string;
}

export interface QuizItem {
  _id: string;
  title: string;
  titleAr?: string;
  description?: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
  creatorId?: string;
  creatorName?: string;
  academicYear?: string;
  semester?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startsAt?: string;
  endsAt?: string;
  open_at?: string;
  close_at?: string;
  isPublished: boolean;
  allowReview: boolean;
  allowResume?: boolean;
  questions?: QuizQuestion[];
  submissionsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizSubmission {
  _id: string;
  quizId: string;
  courseId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  answers?: Array<{
    questionId: string;
    selectedOptionIndex: number;
    isCorrect: boolean;
    pointsAwarded: number;
  }>;
  score: number;
  totalMarks: number;
  percentage: number;
  isPassed: boolean;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
}

export interface StudentQuizViewItem {
  _id: string;
  title: string;
  titleAr?: string;
  description?: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
  creatorName?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  questionsCount: number;
  startsAt?: string;
  endsAt?: string;
  allowResume?: boolean;
  allowReview?: boolean;
  isOpen: boolean;
  isEnded: boolean;
  isSubmitted: boolean;
  attemptStatus?: 'in_progress' | 'submitted' | 'terminated_by_exit' | 'timed_out';
  submission?: {
    score: number;
    totalMarks: number;
    percentage: number;
    isPassed: boolean;
    submittedAt: string;
    durationSeconds: number;
  };
}

export interface TakeQuizResponse {
  _id: string;
  title: string;
  titleAr?: string;
  description?: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startsAt?: string;
  endsAt?: string;
  allowResume?: boolean;
  questions: Array<{
    id: string;
    text: string;
    type: QuestionType;
    options: string[];
    points: number;
  }>;
}

export interface StartQuizAttemptResponse {
  quiz: TakeQuizResponse;
  attemptId: string;
  startedAt: string;
  expiresAt: string;
  remainingSeconds: number;
  allowResume: boolean;
  draftAnswers: Array<{
    questionId: string;
    selectedOptionIndex: number;
  }>;
  isResumed: boolean;
}

export interface SubmitQuizPayload {
  startedAt?: string;
  answers: Array<{
    questionId: string;
    selectedOptionIndex: number;
  }>;
}

export interface SubmitQuizResult {
  message: string;
  score: number;
  totalMarks: number;
  percentage: number;
  isPassed: boolean;
  submittedAt: string;
  answers?: Array<{
    questionId: string;
    selectedOptionIndex: number;
    isCorrect: boolean;
    pointsAwarded: number;
  }>;
}

export interface ParseQuestionsResult {
  questions: QuizQuestion[];
  errors: string[];
  totalRows: number;
  validCount: number;
}

// ─── Admin / Staff API Calls ─────────────────────────────────────────

export async function listQuizzes(params?: {
  page?: number;
  limit?: number;
  search?: string;
  courseId?: string;
  isPublished?: boolean;
}) {
  const res = await api.get<{
    items: QuizItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>('/admin/quizzes', { params });
  return res.data;
}

export async function getQuiz(id: string) {
  const res = await api.get<QuizItem>(`/admin/quizzes/${id}`);
  return res.data;
}

export async function createQuiz(payload: Partial<QuizItem>) {
  const res = await api.post<QuizItem>('/admin/quizzes', payload);
  return res.data;
}

export async function updateQuiz(id: string, payload: Partial<QuizItem>) {
  const res = await api.patch<QuizItem>(`/admin/quizzes/${id}`, payload);
  return res.data;
}

export async function deleteQuiz(id: string) {
  const res = await api.delete<{ message: string }>(`/admin/quizzes/${id}`);
  return res.data;
}

export async function getQuizSubmissions(quizId: string) {
  const res = await api.get<QuizSubmission[]>(`/admin/quizzes/${quizId}/submissions`);
  return res.data;
}

export async function parseQuestionsExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<ParseQuestionsResult>(
    '/admin/quizzes/parse-questions-file',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return res.data;
}

export async function downloadQuestionsTemplate(
  format: 'xlsx' | 'csv' = 'xlsx',
) {
  const isCsv = format === 'csv';
  const raw = await api.get('/admin/quizzes/questions-template', {
    params: { format },
    responseType: 'blob',
  });

  const mimeType = isCsv ? CSV_MIME_TYPE : EXCEL_MIME_TYPE;
  const filename = isCsv
    ? 'quiz-questions-template.csv'
    : 'quiz-questions-template.xlsx';

  downloadFileBlob(raw, filename, mimeType);
}

// ─── Student API Calls ───────────────────────────────────────────────

export async function getStudentQuizzes() {
  const res = await api.get<StudentQuizViewItem[]>('/students/me/quizzes');
  return res.data;
}

export async function getQuizForTaking(quizId: string) {
  const res = await api.get<TakeQuizResponse>(`/students/me/quizzes/${quizId}/take`);
  return res.data;
}

export async function startQuizAttempt(quizId: string) {
  const res = await api.post<StartQuizAttemptResponse>(
    `/students/me/quizzes/${quizId}/start`,
  );
  return res.data;
}

export async function saveQuizDraft(
  quizId: string,
  answers: Array<{ questionId: string; selectedOptionIndex: number }>,
) {
  const res = await api.post<{ success: boolean; savedAt?: string }>(
    `/students/me/quizzes/${quizId}/save-draft`,
    { answers },
  );
  return res.data;
}

export interface ExitQuizAttemptResult {
  status: 'in_progress' | 'terminated_by_exit';
  message?: string;
  exitCount?: number;
  allowResume?: boolean;
  submission?: SubmitQuizResult;
}

export async function recordQuizExit(
  quizId: string,
  answers?: Array<{ questionId: string; selectedOptionIndex: number }>,
  reason?: string,
) {
  const res = await api.post<ExitQuizAttemptResult>(
    `/students/me/quizzes/${quizId}/exit`,
    { answers, reason },
  );
  return res.data;
}

export async function submitQuiz(quizId: string, payload: SubmitQuizPayload) {
  const res = await api.post<SubmitQuizResult>(
    `/students/me/quizzes/${quizId}/submit`,
    payload,
  );
  return res.data;
}

export interface QuizReviewQuestion {
  id: string;
  index: number;
  text: string;
  type: QuestionType;
  options: string[];
  correctOptionIndex: number;
  points: number;
  explanation?: string | null;
  studentSelectedOptionIndex: number;
  isAnswered: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface QuizReviewResponse {
  quiz: {
    id: string;
    title: string;
    titleAr?: string;
    courseCode: string;
    courseName: string;
    courseNameAr?: string;
    courseNameEn?: string;
    totalMarks: number;
    passingMarks: number;
    endsAt?: string;
  };
  submission: {
    score: number;
    totalMarks: number;
    percentage: number;
    isPassed: boolean;
    submittedAt: string;
    durationSeconds: number;
  };
  questions: QuizReviewQuestion[];
}

export async function getQuizReview(quizId: string) {
  const res = await api.get<QuizReviewResponse>(
    `/students/me/quizzes/${quizId}/review`,
  );
  return res.data;
}

