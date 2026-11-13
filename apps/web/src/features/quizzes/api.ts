import api from '@/lib/api';
import type { ApiEnvelope } from '@/lib/api';
import type { QuizReleaseMode } from '@student-portal/shared';
import {
  downloadFileBlob,
  EXCEL_MIME_TYPE,
  CSV_MIME_TYPE,
} from '@/lib/export-utils';

export type QuestionType = 'mcq' | 'true_false';

export interface QuizQuestion {
  _id?: string;
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  correctOptionIndex: number;
  points: number;
  explanation?: string;
}

export interface QuizItem {
  randomizeQuestions?: boolean;
  mcqCount?: number;
  trueFalseCount?: number;
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
  publishResults?: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  resultsAvailable?: boolean;
  reviewAvailable?: boolean;
  isEnded?: boolean;
  allowReview: boolean;
  allowResume?: boolean;
  questions?: QuizQuestion[];
  submissionsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizSubmission {
  assignedQuestions?: QuizQuestion[];
  _id: string;
  quizId: string;
  courseId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentNameAr?: string;
  studentNameEn?: string;
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
  publishResults?: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  canReview?: boolean;
  isOpen: boolean;
  isEnded: boolean;
  isSubmitted: boolean;
  attemptStatus?: 'in_progress' | 'submitted' | 'terminated_by_exit' | 'timed_out';
  submission?: {
    score?: number;
    totalMarks: number;
    percentage?: number;
    isPassed?: boolean;
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
  score?: number;
  totalMarks: number;
  percentage?: number;
  isPassed?: boolean;
  publishResults?: boolean;
  canReview?: boolean;
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
  type QuizPage = {
    items: QuizItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  const res = await api.get<QuizPage, ApiEnvelope<QuizPage>>('/admin/quizzes', { params });
  return { ...res.data, quizzes: res.data.items, serverTime: res.timestamp, receivedAt: performance.now() };
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

export async function exportQuizAnalysis(quizId: string, quizTitle: string) {
  const raw = await api.get(`/admin/quizzes/${quizId}/export-analysis`, {
    responseType: 'blob',
  });
  const safeTitle = quizTitle.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `quiz-analysis-${safeTitle}.xlsx`;
  downloadFileBlob(raw, filename, EXCEL_MIME_TYPE);
}

// ─── Student API Calls ───────────────────────────────────────────────

export async function getStudentQuizzes() {
  return (await getStudentQuizzesWithTiming()).quizzes;
}

export async function getStudentQuizzesWithTiming() {
  const res = await api.get<StudentQuizViewItem[], ApiEnvelope<StudentQuizViewItem[]>>('/students/me/quizzes');
  return { quizzes: res.data, serverTime: res.timestamp, receivedAt: performance.now() };
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
  status: 'in_progress' | 'terminated_by_exit' | 'warning';
  message?: string;
  exitCount?: number;
  maxAllowedExits?: number;
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

export interface QuizCourseOption { _id: string; code: string; name: string; nameAr?: string }

export async function getQuizCourseOptions(role?: string): Promise<QuizCourseOption[]> {
  if (role === 'staff') {
    const res = await api.get<QuizCourseOption[]>('/staff/me/assigned-courses');
    return res.data;
  }
  const courses: QuizCourseOption[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await api.get<{ items: QuizCourseOption[]; totalPages: number }>('/admin/courses', {
      params: { page, limit: 100, isActive: true },
    });
    courses.push(...res.data.items);
    totalPages = res.data.totalPages;
    page++;
  } while (page <= totalPages);
  return courses;
}
