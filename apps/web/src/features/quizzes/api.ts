import api from '@/lib/api';

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
  isPublished: boolean;
  allowReview: boolean;
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
  isOpen: boolean;
  isEnded: boolean;
  isSubmitted: boolean;
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
  questions: Array<{
    id: string;
    text: string;
    type: QuestionType;
    options: string[];
    points: number;
  }>;
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

// ─── Student API Calls ───────────────────────────────────────────────

export async function getStudentQuizzes() {
  const res = await api.get<StudentQuizViewItem[]>('/students/me/quizzes');
  return res.data;
}

export async function getQuizForTaking(quizId: string) {
  const res = await api.get<TakeQuizResponse>(`/students/me/quizzes/${quizId}/take`);
  return res.data;
}

export async function submitQuiz(quizId: string, payload: SubmitQuizPayload) {
  const res = await api.post<SubmitQuizResult>(
    `/students/me/quizzes/${quizId}/submit`,
    payload,
  );
  return res.data;
}
