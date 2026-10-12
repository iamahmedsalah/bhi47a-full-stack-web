'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Award,
  Calendar,
  Clock,
  Play,
  HelpCircle,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Check,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  getStudentQuizzes,
  getQuizForTaking,
  submitQuiz,
  type StudentQuizViewItem,
  type TakeQuizResponse,
  type SubmitQuizResult,
} from '@/features/quizzes/api';

/* ─── Existing Excel Uploaded Grades Interfaces ─────────── */
interface QuizEntry {
  quizNumber: number;
  title: string;
  grade: number;
  maxGrade: number;
  status: 'present' | 'absent' | 'banned';
  date?: string;
}

interface CourseQuiz {
  _id: string;
  courseName: string;
  courseCode: string;
  academicYear: string;
  semester: string;
  quizzes: QuizEntry[];
  totalGrade: number;
  maxTotalGrade: number;
  percentage: number;
}

/* ─── Quiz Taking Modal ─────────────────────────────────── */
interface TakeQuizModalProps {
  quizId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
  onSubmitted: () => void;
}

interface QuizQuestionsListProps {
  questions: Array<{
    id: string;
    text: string;
    type?: string;
    options: string[];
    points?: number;
  }>;
  selectedAnswers: Record<string, number>;
  onSelectOption: (questionId: string, optIndex: number) => void;
  isAr: boolean;
}

const QuizQuestionsList = React.memo(function QuizQuestionsList({
  questions,
  selectedAnswers,
  onSelectOption,
  isAr,
}: QuizQuestionsListProps) {
  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pe-1 text-start">
      {questions.map((q, qIndex) => (
        <div
          key={q.id}
          className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {qIndex + 1}
              </span>
              <p className="text-sm font-bold text-foreground leading-snug">
                {q.text}
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground font-mono">
              {q.points} {isAr ? 'درجة' : 'pts'}
            </span>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {q.options.map((opt, optIndex) => {
              const isSelected = selectedAnswers[q.id] === optIndex;
              return (
                <div
                  key={optIndex}
                  onClick={() => onSelectOption(q.id, optIndex)}
                  className={`flex items-center gap-2.5 rounded-squircle border p-3 cursor-pointer text-xs transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-sm'
                      : 'border-border/60 bg-secondary/30 hover:bg-secondary/50 text-foreground'
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-primary bg-primary text-white'
                        : 'border-muted-foreground/60'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

function TakeQuizModal({
  quizId,
  open,
  onOpenChange,
  isAr,
  onSubmitted,
}: TakeQuizModalProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitQuizResult | null>(null);

  const STORAGE_KEY = useMemo(
    () => (quizId ? `student_quiz_attempt_${quizId}` : null),
    [quizId],
  );

  const quizDataQuery = useQuery({
    queryKey: ['take-quiz-data', quizId],
    queryFn: () => getQuizForTaking(quizId!),
    enabled: Boolean(quizId && open),
  });

  const quiz = quizDataQuery.data;

  const selectedAnswersRef = React.useRef(selectedAnswers);
  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  const startTimeRef = React.useRef(startTime);
  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  // Load existing in-progress attempt or initialize new timer
  useEffect(() => {
    if (!quiz || !open || submissionResult || !STORAGE_KEY) return;

    let initialStart = new Date();
    let initialAnswers: Record<string, number> = {};
    const totalDurationSeconds = (quiz.durationMinutes || 15) * 60;
    let initialRemaining = totalDurationSeconds;

    if (typeof window !== 'undefined') {
      try {
        const rawSaved = localStorage.getItem(STORAGE_KEY);
        if (rawSaved) {
          const parsed = JSON.parse(rawSaved);
          if (parsed.startedAt) {
            const parsedStart = new Date(parsed.startedAt);
            const elapsed = Math.max(0, Math.floor((Date.now() - parsedStart.getTime()) / 1000));
            let rem = Math.max(0, totalDurationSeconds - elapsed);

            // Cap remaining time with quiz endsAt if closer
            if (quiz.endsAt) {
              const remToEnd = Math.floor((new Date(quiz.endsAt).getTime() - Date.now()) / 1000);
              rem = Math.min(rem, Math.max(0, remToEnd));
            }

            initialStart = parsedStart;
            initialRemaining = rem;
            if (parsed.selectedAnswers && typeof parsed.selectedAnswers === 'object') {
              initialAnswers = parsed.selectedAnswers;
            }

            if (rem > 0 && Object.keys(initialAnswers).length > 0) {
              toast.info(
                isAr
                  ? 'تمت استعادة إجاباتك السابقة والوقت المتبقي للاختبار بنجاح'
                  : 'Resumed quiz: previously selected answers and remaining time have been restored',
              );
            }
          }
        } else {
          // First attempt initiation
          if (quiz.endsAt) {
            const remToEnd = Math.floor((new Date(quiz.endsAt).getTime() - Date.now()) / 1000);
            initialRemaining = Math.min(totalDurationSeconds, Math.max(0, remToEnd));
          }
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              quizId,
              startedAt: initialStart.toISOString(),
              selectedAnswers: {},
            }),
          );
        }
      } catch {
        // Ignore localStorage error
      }
    }

    setStartTime(initialStart);
    setSecondsRemaining(initialRemaining);
    setSelectedAnswers(initialAnswers);
  }, [quiz, open, submissionResult, STORAGE_KEY, isAr, quizId]);

  const handleSelectOption = React.useCallback(
    (questionId: string, optIndex: number) => {
      setSelectedAnswers((prev) => {
        const next = { ...prev, [questionId]: optIndex };
        if (typeof window !== 'undefined' && STORAGE_KEY) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                ...parsed,
                quizId,
                startedAt:
                  parsed.startedAt ||
                  (startTimeRef.current
                    ? startTimeRef.current.toISOString()
                    : new Date().toISOString()),
                selectedAnswers: next,
              }),
            );
          } catch {
            // Ignore storage quota
          }
        }
        return next;
      });
    },
    [STORAGE_KEY, quizId],
  );

  const performSubmit = async () => {
    if (!quiz || !quizId) return;
    setIsSubmitting(true);
    try {
      const currentAnswers = selectedAnswersRef.current;
      const currentStart = startTimeRef.current;

      const answersPayload = (quiz.questions || []).map((q) => ({
        questionId: q.id,
        selectedOptionIndex:
          currentAnswers[q.id] !== undefined ? currentAnswers[q.id] : -1,
      }));

      const res = await submitQuiz(quizId, {
        startedAt: currentStart
          ? currentStart.toISOString()
          : new Date().toISOString(),
        answers: answersPayload,
      });

      if (typeof window !== 'undefined' && STORAGE_KEY) {
        localStorage.removeItem(STORAGE_KEY);
      }

      setSubmissionResult(res);
      toast.success(
        isAr
          ? 'تم تسليم الاختبار وتصحيحه بنجاح'
          : 'Quiz submitted and graded successfully',
      );
      onSubmitted();
    } catch (err: any) {
      const backendMsg = err?.response?.data?.message;
      let errorMsg = getApiErrorMessage(
        err,
        isAr ? 'فشل تسليم الاختبار' : 'Failed to submit quiz',
      );
      if (backendMsg === 'لقد قمت بتسليم هذا الاختبار مسبقاً' && !isAr) {
        errorMsg = 'You have already submitted this quiz';
      }
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (!quiz || isSubmitting || submissionResult) return;
    toast.warning(
      isAr
        ? 'انتهى الوقت المحدد للاختبار! جاري تسليم الإجابات تلقائياً...'
        : 'Quiz time is up! Auto-submitting answers...',
    );
    await performSubmit();
  };

  // Stable countdown timer: avoid rebuilding interval and thrashing modal every second
  const handleAutoSubmitRef = React.useRef(handleAutoSubmit);
  useEffect(() => {
    handleAutoSubmitRef.current = handleAutoSubmit;
  });

  useEffect(() => {
    if (!open || submissionResult) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, submissionResult]);

  useEffect(() => {
    if (!open || submissionResult) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [open, submissionResult]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const questionsCount = quiz?.questions?.length || 0;
  const answeredCount = Object.keys(selectedAnswers).length;
  const isTimeCritical = secondsRemaining < 120; // under 2 minutes

  const handleClose = async () => {
    if (submissionResult) {
      setSubmissionResult(null);
      onOpenChange(false);
      return;
    }
    const msg = isAr
      ? '⚠️ تحذير: هذا الاختبار بنظام الدخول لمرة واحدة فقط. إغلاق هذه النافذة أو مغادرتها سيؤدي فوراً إلى إنهاء الاختبار وتسليمه تلقائياً بما قمت بحله. هل تريد الاستمرار في المغادرة والتسليم الآن؟'
      : '⚠️ Warning: Single-entry quiz. Closing or leaving this window now will immediately finish and auto-submit your attempt with your current answers. Are you sure you want to leave and submit?';
    if (!confirm(msg)) {
      return;
    }
    await performSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 p-6">
        {quizDataQuery.isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              {isAr ? 'جاري تحميل أسئلة الاختبار...' : 'Loading quiz questions...'}
            </p>
          </div>
        ) : quizDataQuery.isError ? (
          <div className="space-y-4 py-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-danger" />
            <p className="text-sm font-semibold text-danger">
              {getApiErrorMessage(quizDataQuery.error)}
            </p>
            <Button variant="secondary" onClick={handleClose} className="rounded-squircle">
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        ) : submissionResult ? (
          /* ─── Result Celebration Card ─── */
          <div className="space-y-6 py-4 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-teal-500/25 border border-primary/30 shadow-lg">
              {submissionResult.isPassed ? (
                <Award className="h-10 w-10 text-primary" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-amber-400" />
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-extrabold text-foreground">
                {submissionResult.isPassed
                  ? isAr ? 'أحسنت! تم اجتياز الاختبار بنجاح' : 'Great Job! Quiz Passed'
                  : isAr ? 'تم الانتهاء من الاختبار' : 'Quiz Completed'}
              </h2>
              <p className="text-xs text-muted-foreground">{quiz?.title}</p>
            </div>

            <div className="mx-auto max-w-sm rounded-2xl border border-border/80 bg-secondary/30 p-5 shadow-inner space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isAr ? 'الدرجة المحصلة:' : 'Score:'}</span>
                <span className="font-mono text-xl font-extrabold text-foreground">
                  <span className="text-primary">{submissionResult.score}</span> / {submissionResult.totalMarks}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isAr ? 'النسبة المئوية:' : 'Percentage:'}</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded-full text-xs ${
                    submissionResult.isPassed
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {submissionResult.percentage}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isAr ? 'النتيجة:' : 'Standing:'}</span>
                <span
                  className={`font-bold text-xs ${
                    submissionResult.isPassed ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {submissionResult.isPassed ? (isAr ? 'ناجح' : 'Passed') : (isAr ? 'راسب' : 'Failed')}
                </span>
              </div>
            </div>

            <Button
              onClick={handleClose}
              className="bg-primary px-8 text-white hover:bg-primary-hover rounded-squircle font-semibold"
            >
              {isAr ? 'تم ومغادرة' : 'Done & Exit'}
            </Button>
          </div>
        ) : (
          /* ─── Active Quiz Taking ─── */
          <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
            {/* Header with Title and Countdown */}
            <DialogHeader className="border-b border-border/80 pb-3 text-start">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    {quiz?.title}
                  </DialogTitle>
                  <p className="text-xs text-primary font-mono mt-0.5">
                    {quiz?.courseCode} - {isAr ? (quiz?.courseNameAr || quiz?.courseName) : (quiz?.courseNameEn || quiz?.courseName)}
                  </p>
                  {quiz?.endsAt && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mt-1">
                      <Clock className="h-3 w-3 text-rose-400 shrink-0" />
                      <span>{isAr ? 'موعد إغلاق الاختبار:' : 'Closes at:'}</span>
                      <span className="font-semibold text-foreground">
                        {new Date(quiz.endsAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
                          timeZone: 'Africa/Cairo',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {/* Floating Timer Badge */}
                  <div
                    className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 font-mono text-sm font-bold border ${
                      isTimeCritical
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 animate-pulse'
                        : 'bg-primary/15 border-primary/30 text-primary'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    <span>{formatTimer(secondsRemaining)}</span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                    <Check className="h-2.5 w-2.5" />
                    <span>{isAr ? 'يتم الحفظ تلقائياً' : 'Auto-saved'}</span>
                  </span>
                </div>
              </div>

              {/* Progress info */}
              <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
                <span>
                  {isAr
                    ? `تمت الإجابة على ${answeredCount} من ${questionsCount} سؤال`
                    : `Answered ${answeredCount} of ${questionsCount}`}
                </span>
                <span className="font-mono font-bold text-foreground">
                  {Math.round((answeredCount / (questionsCount || 1)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.round((answeredCount / (questionsCount || 1)) * 100)}%`,
                  }}
                />
              </div>
            </DialogHeader>

            {/* Single-Entry Warning Banner */}
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="font-semibold leading-relaxed">
                {isAr
                  ? 'تنبيه مشدد: هذا الاختبار ذو دخول لمرة واحدة فقط. أي خروج أو إغلاق للنافذة سيؤدي فوراً إلى إنهاء الاختبار وتسليمه تلقائياً بما قمت بحله.'
                  : 'Important notice: Single-entry quiz. Leaving or closing this window will immediately finish and auto-submit your quiz with current answers.'}
              </span>
            </div>

            {/* Questions List (Memoized against timer ticks) */}
            <QuizQuestionsList
              questions={quiz?.questions || []}
              selectedAnswers={selectedAnswers}
              onSelectOption={handleSelectOption}
              isAr={isAr}
            />

            <DialogFooter className="border-t border-border/80 pt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {answeredCount < questionsCount && (
                  <span className="text-amber-400">
                    {isAr
                      ? `تنبيه: متبقي ${questionsCount - answeredCount} سؤال دون إجابة`
                      : `Warning: ${questionsCount - answeredCount} unanswered`}
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleClose}
                  className="rounded-squircle text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  size="sm"
                  disabled={isSubmitting}
                  onClick={performSubmit}
                  className="bg-primary text-white hover:bg-primary-hover rounded-squircle font-semibold text-xs gap-1.5"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isAr ? 'تسليم الاختبار الآن' : 'Submit Quiz Now'}</span>
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Quiz Start Instructions Dialog ───────────────────── */
interface QuizStartInstructionDialogProps {
  quiz: StudentQuizViewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmStart: () => void;
  isAr: boolean;
}

function QuizStartInstructionDialog({
  quiz,
  open,
  onOpenChange,
  onConfirmStart,
  isAr,
}: QuizStartInstructionDialogProps) {
  if (!quiz) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg rounded-2xl border border-white/10 p-6 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader className="text-start space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {isAr ? 'تعليمات وتأكيد دخول الاختبار الإلكتروني' : 'Online Quiz Instructions & Confirmation'}
              </DialogTitle>
              <p className="text-xs text-primary font-mono mt-0.5">
                {quiz.courseCode} - {isAr ? (quiz.courseNameAr || quiz.courseName) : (quiz.courseNameEn || quiz.courseName)}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Quiz details summary */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3 text-center">
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground block">{isAr ? 'المدة' : 'Duration'}</span>
            <span className="font-mono text-xs font-bold text-foreground">
              {quiz.durationMinutes} {isAr ? 'دقيقة' : 'mins'}
            </span>
          </div>
          <div className="space-y-0.5 border-x border-border/70">
            <span className="text-[10px] text-muted-foreground block">{isAr ? 'الأسئلة' : 'Questions'}</span>
            <span className="font-mono text-xs font-bold text-foreground">
              {quiz.questionsCount} {isAr ? 'سؤال' : 'questions'}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground block">{isAr ? 'الدرجة' : 'Total Marks'}</span>
            <span className="font-mono text-xs font-bold text-primary">
              {quiz.totalMarks} {isAr ? 'درجة' : 'marks'}
            </span>
          </div>
        </div>

        {/* Warning & Instructions rules */}
        <div className="space-y-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-200/90">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{isAr ? 'يرجى قراءة التعليمات بعناية قبل البدء:' : 'Please review instructions carefully:'}</span>
          </div>
          <ul className="space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
            <li>
              <strong>{isAr ? 'دخول لمرة واحدة فقط:' : 'Single entry only:'}</strong>{' '}
              {isAr
                ? 'الاختبار متاح للدخول لمرة واحدة فقط دون إمكانية الخروج والعودة لاحقاً.'
                : 'You have only one attempt. Rejoining after leaving is not permitted.'}
            </li>
            <li>
              <strong>{isAr ? 'تسليم تلقائي فوري عند المغادرة:' : 'Auto-submit on leave:'}</strong>{' '}
              {isAr
                ? 'أي إغلاق للنافذة، أو مغادرة للمتصفح، أو تبديل الصفحة سيؤدي فوراً إلى إنهاء الاختبار وتسليمه تلقائياً بما قمت بحله.'
                : 'Closing the window or navigating away will immediately finalize and submit your current answers.'}
            </li>
            <li>
              <strong>{isAr ? 'العداد الزمني:' : 'Timer countdown:'}</strong>{' '}
              {isAr
                ? 'سيبدأ احتساب وقت الاختبار التنازلي فور الضغط على زر البدء.'
                : 'Countdown timer begins immediately upon entering the quiz.'}
            </li>
          </ul>
        </div>

        <DialogFooter className="rtl:sm:justify-start gap-2 pt-2 border-t border-border/70">
          <Button
            type="button"
            onClick={onConfirmStart}
            className="rounded-squircle bg-primary hover:bg-primary-hover text-white font-bold text-xs gap-1.5 px-5"
          >
            <Play className="h-3.5 w-3.5 fill-white" />
            <span>{isAr ? 'أوافق وأبدأ الاختبار الآن' : 'I Understand & Start Quiz'}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle text-xs"
          >
            {isAr ? 'إلغاء وتراجع' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Student Quizzes Page ────────────────────────── */
export default function StudentQuizzesPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const isEnglish = !isAr;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'online' | 'history'>('online');
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [takingQuizId, setTakingQuizId] = useState<string | null>(null);
  const [confirmStartQuiz, setConfirmStartQuiz] = useState<StudentQuizViewItem | null>(null);

  // 1. Fetch Online Quizzes from Quizzes module
  const onlineQuizzesQuery = useQuery({
    queryKey: ['student-online-quizzes'],
    queryFn: () => getStudentQuizzes(),
  });

  // 2. Fetch past uploaded excel quiz scores
  const historyQuery = useQuery({
    queryKey: ['student-quizzes-history'],
    queryFn: async () => {
      const res = await api.get<CourseQuiz[]>('/students/me/course-quizzes');
      return res.data;
    },
  });

  const onlineQuizzes = onlineQuizzesQuery.data || [];
  const historyItems = historyQuery.data || [];

  const toggleExpand = (courseId: string) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  };

  const totalQuizScore = historyItems.reduce((acc, curr) => acc + curr.totalGrade, 0);
  const totalMaxScore = historyItems.reduce((acc, curr) => acc + curr.maxTotalGrade, 0);
  const overallPercentage =
    totalMaxScore > 0 ? Math.round((totalQuizScore / totalMaxScore) * 100) : 0;
  const totalCourses = historyItems.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileText className="h-6 w-6 text-primary" />
          <span>{t('quizzes')}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'Take your online course quizzes and inspect your continuous evaluation records'
            : 'خُض الاختبارات الإلكترونية المتاحة لمقرراتك الدراسية وتابع تقييمات الأعمال الفصلية'}
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex border-b border-border/80 gap-3 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('online')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'online'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <HelpCircle className="h-4 w-4" />
          <span>{isAr ? 'الاختبارات الإلكترونية النشطة' : 'Active Online Quizzes'}</span>
          {onlineQuizzes.filter((q) => q.isOpen && !q.isSubmitted).length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[11px] font-bold text-primary">
              {onlineQuizzes.filter((q) => q.isOpen && !q.isSubmitted).length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>{isAr ? 'سجل درجات الكويزات والأعمال' : 'Quiz Grades History'}</span>
        </button>
      </div>

      {/* ─── TAB 1: Online Quizzes ─── */}
      {activeTab === 'online' && (
        <div className="space-y-4">
          {onlineQuizzesQuery.isLoading ? (
            <LoadingState title={tCommon('loading')} />
          ) : onlineQuizzesQuery.isError ? (
            <ErrorState
              description={getApiErrorMessage(onlineQuizzesQuery.error)}
              error={onlineQuizzesQuery.error}
              onRetry={() => onlineQuizzesQuery.refetch()}
            />
          ) : onlineQuizzes.length === 0 ? (
            <Card className="p-8 text-center bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)]">
              <EmptyState
                title={isAr ? 'لا توجد اختبارات إلكترونية معلنة حالياً' : 'No Online Quizzes Available'}
                description={
                  isAr
                    ? 'لم يقم دكاترة مقرراتك الدراسية المسجلة بنشر أي اختبارات قصيرة في الوقت الحالي.'
                    : 'Your course professors have not published any online quizzes at this moment.'
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {onlineQuizzes.map((quiz) => {
                const canTake = quiz.isOpen && !quiz.isSubmitted;
                return (
                  <motion.div
                    key={quiz._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-full shadow-[var(--shadow-glow)] hover:border-primary/40 transition-all rounded-2xl relative overflow-hidden group">
                      <div className="space-y-3">
                        {/* Course & Status Pill */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-squircle">
                            {quiz.courseCode}
                          </span>

                          {quiz.isSubmitted ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{isAr ? 'تم التسليم' : 'Submitted'}</span>
                            </span>
                          ) : quiz.isOpen ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-bold text-teal-400">
                              <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                              <span>{isAr ? 'متاح الآن' : 'Open Now'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-muted/30 bg-muted/10 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                              <span>{isAr ? 'غير متاح' : 'Closed'}</span>
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors">
                            {quiz.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isAr ? (quiz.courseNameAr || quiz.courseName) : (quiz.courseNameEn || quiz.courseName)}
                          </p>
                          {quiz.description && (
                            <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                              {quiz.description}
                            </p>
                          )}
                        </div>

                        {/* Schedule Open/Close Info */}
                        {(quiz.startsAt || quiz.endsAt) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {quiz.startsAt && !quiz.isOpen && !quiz.isEnded && (
                              <span className="inline-flex items-center gap-1.5 rounded-squircle bg-secondary/50 border border-border/70 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{isAr ? 'يفتح:' : 'Opens:'}</span>
                                <span className="font-semibold text-foreground">
                                  {new Date(quiz.startsAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
                                    timeZone: 'Africa/Cairo',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </span>
                            )}

                            {quiz.endsAt && (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-[11px] font-mono ${
                                  quiz.isEnded
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                }`}
                              >
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>{isAr ? 'موعد الإغلاق:' : 'Closes:'}</span>
                                <span className="font-semibold">
                                  {new Date(quiz.endsAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
                                    timeZone: 'Africa/Cairo',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <span>{quiz.durationMinutes} {isAr ? 'دقيقة' : 'mins'}</span>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <HelpCircle className="h-3.5 w-3.5 text-primary" />
                            <span>{quiz.questionsCount} {isAr ? 'أسئلة' : 'questions'}</span>
                          </span>
                          <span className="flex items-center gap-1 font-mono font-bold text-foreground">
                            <Award className="h-3.5 w-3.5 text-primary" />
                            <span>{quiz.totalMarks} {isAr ? 'درجة' : 'marks'}</span>
                          </span>
                        </div>
                      </div>

                      {/* Bottom Action / Score Info */}
                      <div className="pt-4 border-t border-border/70 mt-4 flex items-center justify-between">
                        {quiz.isSubmitted && quiz.submission ? (
                          <div className="flex items-center justify-between w-full">
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-muted-foreground block">
                                {isAr ? 'درجتك في الاختبار:' : 'Your Score:'}
                              </span>
                              <span className="font-mono text-base font-black text-primary">
                                {quiz.submission.score} / {quiz.submission.totalMarks}
                              </span>
                            </div>
                            <span
                              className={`font-mono text-xs font-bold px-2.5 py-1 rounded-full ${
                                quiz.submission.isPassed
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {quiz.submission.percentage}% ({quiz.submission.isPassed ? (isAr ? 'ناجح' : 'Pass') : (isAr ? 'راسب' : 'Fail')})
                            </span>
                          </div>
                        ) : canTake ? (
                          <Button
                            onClick={() => setConfirmStartQuiz(quiz)}
                            className="w-full bg-primary font-bold text-white hover:bg-primary-hover rounded-squircle gap-2 shadow-lg shadow-primary/20"
                          >
                            <Play className="h-4 w-4 fill-white" />
                            <span>{isAr ? 'ابدأ الاختبار الآن' : 'Start Quiz Now'}</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic w-full text-center">
                            {quiz.isEnded
                              ? isAr ? 'انتهت فترة الاختبار' : 'Quiz time has ended'
                              : isAr ? 'سيبدأ الاختبار قريباً' : 'Starting soon'}
                          </span>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Uploaded Quiz History ─── */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {historyQuery.isLoading ? (
            <LoadingState title={tCommon('loading')} />
          ) : historyQuery.isError ? (
            <ErrorState
              description={getApiErrorMessage(historyQuery.error)}
              error={historyQuery.error}
              onRetry={() => historyQuery.refetch()}
            />
          ) : historyItems.length === 0 ? (
            <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)]">
              <EmptyState
                title={isEnglish ? 'No quiz records found' : 'لا توجد سجلات اختبارات'}
                description={
                  isEnglish
                    ? 'Your quiz and class assignment grades have not been uploaded by the administration yet.'
                    : 'لم يتم رفع درجات الكويزات أو التكليفات العملية الخاصة بك من قبل الإدارة بعد.'
                }
              />
            </Card>
          ) : (
            <>
              {/* Summary widgets */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        {isEnglish ? 'Overall Performance' : 'معدل الأداء العام'}
                      </span>
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-foreground">{overallPercentage}%</span>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
                  <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        {isEnglish ? 'Total Points Earned' : 'مجموع الدرجات'}
                      </span>
                      <Award className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <span className="text-2xl font-black font-mono text-foreground">{totalQuizScore} / {totalMaxScore}</span>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
                  <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        {isEnglish ? 'Graded Courses' : 'المواد المقيمة'}
                      </span>
                      <FileText className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <span className="text-2xl font-black font-mono text-foreground">{totalCourses}</span>
                  </Card>
                </motion.div>
              </div>

              {/* Course Quiz List */}
              <div className="space-y-4">
                {historyItems.map((course, idx) => {
                  const isExpanded = !!expandedCourses[course._id];
                  return (
                    <motion.div
                      key={course._id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.04 }}
                    >
                      <Card className="bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 overflow-hidden p-0">
                        <div
                          onClick={() => toggleExpand(course._id)}
                          className="flex cursor-pointer items-center justify-between p-4 hover:bg-secondary/40 transition-all select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                              <FileText className="h-5.5 w-5.5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-foreground leading-snug">{course.courseName}</h3>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{course.courseCode}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-end">
                              <span className="text-sm font-bold text-foreground block font-mono">
                                {course.totalGrade} / {course.maxTotalGrade}
                              </span>
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                ({course.percentage}%)
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-border bg-secondary/15 p-5 space-y-4">
                                {course.quizzes.length === 0 ? (
                                  <p className="text-center text-xs text-muted-foreground py-4">
                                    {isEnglish
                                      ? 'No individual quizzes graded for this course yet.'
                                      : 'لا توجد كويزات فردية مسجلة لهذه المادة بعد.'}
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-start text-xs">
                                      <thead>
                                        <tr className="border-b border-border/80 text-muted-foreground font-bold pb-2 text-start">
                                          <th className="pb-3 text-start">{isEnglish ? 'Quiz Title' : 'اسم الاختبار'}</th>
                                          <th className="pb-3 text-center">{isEnglish ? 'Status' : 'الحضور'}</th>
                                          <th className="pb-3 text-center">{isEnglish ? 'Grade' : 'الدرجة'}</th>
                                          <th className="pb-3 text-end">{isEnglish ? 'Date' : 'التاريخ'}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/60">
                                        {course.quizzes.map((quiz, index) => (
                                          <tr key={index} className="text-foreground hover:bg-secondary/25 transition-colors">
                                            <td className="py-3 text-start font-bold text-foreground">{quiz.title}</td>
                                            <td className="py-3 text-center">
                                              <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                  quiz.status === 'present'
                                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                                }`}
                                              >
                                                {isEnglish
                                                  ? quiz.status
                                                  : quiz.status === 'present'
                                                    ? 'حاضر'
                                                    : 'غائب'}
                                              </span>
                                            </td>
                                            <td className="py-3 text-center font-mono font-bold text-foreground">
                                              {quiz.status === 'present' ? `${quiz.grade} / ${quiz.maxGrade}` : '—'}
                                            </td>
                                            <td className="py-3 text-end text-muted-foreground font-mono inline-flex items-center gap-1 mt-1 justify-end">
                                              <Calendar className="w-3 h-3 text-muted-foreground" />
                                              {quiz.date
                                                ? new Date(quiz.date).toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG')
                                                : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Quiz Start Instructions Dialog */}
      <QuizStartInstructionDialog
        quiz={confirmStartQuiz}
        open={Boolean(confirmStartQuiz)}
        onOpenChange={(op) => !op && setConfirmStartQuiz(null)}
        onConfirmStart={() => {
          if (confirmStartQuiz) {
            setTakingQuizId(confirmStartQuiz._id);
            setConfirmStartQuiz(null);
          }
        }}
        isAr={isAr}
      />

      {/* Taking Quiz Interactive Modal */}
      <TakeQuizModal
        quizId={takingQuizId}
        open={Boolean(takingQuizId)}
        onOpenChange={(open) => {
          if (!open) {
            setTakingQuizId(null);
          }
        }}
        isAr={isAr}
        onSubmitted={() => {
          void queryClient.invalidateQueries({ queryKey: ['student-online-quizzes'] });
        }}
      />
    </div>
  );
}
