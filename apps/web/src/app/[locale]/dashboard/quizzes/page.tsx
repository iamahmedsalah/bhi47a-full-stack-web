'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { useQuizReleaseRefresh } from '@/features/quizzes/use-quiz-release-refresh';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { FileText, ChevronDown, ChevronUp, CheckCircle2, XCircle, Award, Calendar, Clock, Play, HelpCircle, AlertTriangle, RotateCcw, Check, Loader2, ShieldAlert, Eye, Lightbulb, AlertCircle, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getStudentQuizzesWithTiming, startQuizAttempt, saveQuizDraft, recordQuizExit, submitQuiz, getQuizReview, type StudentQuizViewItem, type SubmitQuizResult } from '@/features/quizzes/api';

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

interface QuizQuestionItemProps {
  question: {
    id: string;
    text: string;
    type?: string;
    options: string[];
    points?: number;
  };
  qIndex: number;
  selectedOptionIndex: number | undefined;
  onSelectOption: (questionId: string, optIndex: number) => void;
  isAr: boolean;
}

const QuizQuestionItem = React.memo(function QuizQuestionItem({
  question,
  qIndex,
  selectedOptionIndex,
  onSelectOption,
  isAr,
}: QuizQuestionItemProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {qIndex + 1}
          </span>
          <p className="text-sm font-bold text-foreground leading-snug">
            {question.text}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground font-mono">
          {question.points} {isAr ? 'درجة' : 'pts'}
        </span>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {(question.options || []).map((opt, optIndex) => {
          const isSelected = selectedOptionIndex === optIndex;
          return (
            <div
              key={optIndex}
              onClick={() => onSelectOption(question.id, optIndex)}
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
  );
});

const QuizQuestionsList = React.memo(function QuizQuestionsList({
  questions,
  selectedAnswers,
  onSelectOption,
  isAr,
}: QuizQuestionsListProps) {
  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pe-1 text-start">
      {questions.map((q, qIndex) => (
        <QuizQuestionItem
          key={q.id}
          question={q}
          qIndex={qIndex}
          selectedOptionIndex={selectedAnswers[q.id]}
          onSelectOption={onSelectOption}
          isAr={isAr}
        />
      ))}
    </div>
  );
});

// Centralized 1-second ticker listeners to eliminate N intervals across cards
const globalTimerListeners = new Set<() => void>();
let globalTimerInterval: NodeJS.Timeout | null = null;

function subscribeToGlobalTimer(callback: () => void) {
  globalTimerListeners.add(callback);
  if (!globalTimerInterval) {
    globalTimerInterval = setInterval(() => {
      globalTimerListeners.forEach((cb) => cb());
    }, 1000);
  }
  return () => {
    globalTimerListeners.delete(callback);
    if (globalTimerListeners.size === 0 && globalTimerInterval) {
      clearInterval(globalTimerInterval);
      globalTimerInterval = null;
    }
  };
}

function useGlobalSecondsTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    return subscribeToGlobalTimer(() => {
      setNow(Date.now());
    });
  }, []);
  return now;
}

const LiveCountdown = React.memo(function LiveCountdown({
  targetDate,
  isAr,
}: {
  targetDate: string;
  isAr: boolean;
}) {
  const now = useGlobalSecondsTicker();
  const diff = Math.max(
    0,
    Math.floor((new Date(targetDate).getTime() - now) / 1000),
  );

  if (diff <= 0) {
    return (
      <span className="text-xs text-teal-400 font-bold">
        {isAr ? 'يفتح الآن!' : 'Opening now!'}
      </span>
    );
  }

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-squircle">
      <Clock className="h-3.5 w-3.5 animate-spin" />
      <span>{isAr ? 'يبدأ خلال:' : 'Opens in:'}</span>
      <span>
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
});

interface QuizTimerBadgeProps {
  initialSeconds: number;
  onTimeUp: () => void;
  isAr: boolean;
}

const QuizTimerBadge = React.memo(function QuizTimerBadge({
  initialSeconds,
  onTimeUp,
  isAr,
}: QuizTimerBadgeProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const onTimeUpRef = React.useRef(onTimeUp);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  const [prevInitial, setPrevInitial] = useState(initialSeconds);
  if (initialSeconds !== prevInitial) {
    setPrevInitial(initialSeconds);
    setSecondsRemaining(initialSeconds);
  }

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeUpRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const isTimeCritical = secondsRemaining < 120;

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <div
        className={`flex items-center gap-1.5 rounded-squircle px-3 py-1.5 font-mono text-sm font-bold border transition-colors ${
          isTimeCritical
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 animate-pulse'
            : 'bg-primary/15 border-primary/30 text-primary'
        }`}
      >
        <Clock className="h-4 w-4" />
        <span>{`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`}</span>
      </div>

      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
        <Check className="h-2.5 w-2.5" />
        <span>{isAr ? 'يتم الحفظ تلقائياً' : 'Auto-saved'}</span>
      </span>
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
  const queryClient = useQueryClient();
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitQuizResult | null>(null);
  const [terminatedByExit, setTerminatedByExit] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const attemptQuery = useQuery({
    queryKey: ['start-quiz-attempt', quizId],
    queryFn: () => startQuizAttempt(quizId!),
    enabled: Boolean(quizId && open && !submissionResult),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const attemptData = attemptQuery.data;
  const quiz = attemptData?.quiz;
  const allowResume = (attemptData?.allowResume ?? attemptData?.quiz?.allowResume) !== false;

  const selectedAnswersRef = React.useRef(selectedAnswers);
  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  // Load server attempt data and restore draft answers if resumed
  const [previousAttemptInputs, setpreviousAttemptInputs] = useState<unknown[] | null>(null);
  if (!previousAttemptInputs || previousAttemptInputs.some((value,i) => !Object.is(value, [attemptData, open, submissionResult, isAr][i]))) {
    setpreviousAttemptInputs([attemptData, open, submissionResult, isAr]);
    (() => {
    if (!attemptData || !open || submissionResult) return;

    const initialAnswers: Record<string, number> = {};
    if (Array.isArray(attemptData.draftAnswers)) {
      attemptData.draftAnswers.forEach((ans) => {
        if (
          ans &&
          typeof ans.questionId === 'string' &&
          typeof ans.selectedOptionIndex === 'number' &&
          ans.selectedOptionIndex >= 0
        ) {
          initialAnswers[ans.questionId] = ans.selectedOptionIndex;
        }
      });
    }
    setSelectedAnswers(initialAnswers);

    setTerminatedByExit(false);

    })();
  }
  useEffect(() => {
    if (!attemptData || !open || submissionResult) return;
    if (attemptData.isResumed) {
      toast.info(
        isAr
          ? 'تم استئناف جلسة الاختبار واسترجاع الإجابات السابقة والوقت المتبقي خادمياً'
          : 'Resumed quiz: previously saved answers and remaining time restored',
      );
    }

  }, [attemptData, open, submissionResult, isAr]);

  const draftSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedHashRef = React.useRef<string>('');

  useEffect(() => {
    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectOption = React.useCallback(
    (questionId: string, optIndex: number) => {
      setSelectedAnswers((prev) => {
        if (prev[questionId] === optIndex) return prev;
        const next = { ...prev, [questionId]: optIndex };
        selectedAnswersRef.current = next;
        return next;
      });

      if (!quizId) return;

      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }

      draftSaveTimeoutRef.current = setTimeout(() => {
        const current = selectedAnswersRef.current;
        const answersPayload = Object.entries(current)
          .filter(([, idx]) => typeof idx === 'number' && idx >= 0)
          .map(([qId, idx]) => ({
            questionId: qId,
            selectedOptionIndex: idx,
          }));

        const hash = JSON.stringify(answersPayload);
        if (hash === lastSavedHashRef.current) return;
        lastSavedHashRef.current = hash;

        if (answersPayload.length > 0) {
          saveQuizDraft(quizId, answersPayload).catch(() => {});
        }
      }, 1000);
    },
    [quizId],
  );

  const performSubmit = async () => {
    if (!quiz || !quizId) return;
    setIsSubmitting(true);
    try {
      const currentAnswers = selectedAnswersRef.current;
      const answersPayload = (quiz.questions || []).map((q) => ({
        questionId: q.id,
        selectedOptionIndex:
          currentAnswers[q.id] !== undefined ? currentAnswers[q.id] : -1,
      }));

      const res = await submitQuiz(quizId, {
        startedAt: attemptData?.startedAt,
        answers: answersPayload,
      });

      setSubmissionResult(res);
      toast.success(
        isAr
          ? 'تم تسليم الاختبار وتصحيحه بنجاح'
          : 'Quiz submitted and graded successfully',
      );
      onSubmitted();
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تسليم الاختبار' : 'Failed to submit quiz',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (!quiz || isSubmitting || submissionResult || terminatedByExit) return;
    toast.warning(
      isAr
        ? 'انتهى الوقت المحدد للاختبار! جاري تسليم الإجابات تلقائياً...'
        : 'Quiz time is up! Auto-submitting answers...',
    );
    await performSubmit();
  };

  const handleAutoSubmitRef = React.useRef(handleAutoSubmit);
  useEffect(() => {
    handleAutoSubmitRef.current = handleAutoSubmit;
  });

  const hiddenGraceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const warningStrikeCountRef = React.useRef<number>(0);
  const mountCooldownRef = React.useRef<number>(0);

  // Reset strike counts and cooldown when quiz opens
  useEffect(() => {
    if (open) {
      mountCooldownRef.current = Date.now();
      warningStrikeCountRef.current = 0;
    }
  }, [open]);

  // Anti-Cheat: Visibility change, pagehide, and beforeunload
  useEffect(() => {
    if (!open || submissionResult || terminatedByExit || !quizId) return;

    const handleVisibilityChange = () => {
      // Ignore during initial 8s cooldown window to allow mobile browser UI, virtual keyboard, and viewport to settle
      if (mountCooldownRef.current > 0 && Date.now() - mountCooldownRef.current < 8000) return;

      if (document.visibilityState === 'hidden') {
        const currentAnswers = selectedAnswersRef.current;
        const answersPayload = Object.entries(currentAnswers)
          .filter(([, idx]) => typeof idx === 'number' && idx >= 0)
          .map(([qId, idx]) => ({
            questionId: qId,
            selectedOptionIndex: idx,
          }));

        if (!allowResume) {
          // Grace period: allow 6.0s for accidental notification dismissal / virtual keyboard / touch gesture
          if (hiddenGraceTimerRef.current) {
            clearTimeout(hiddenGraceTimerRef.current);
          }
          hiddenGraceTimerRef.current = setTimeout(async () => {
            if (document.visibilityState !== 'hidden') return;
            try {
              const res = await recordQuizExit(quizId, answersPayload, 'visibilitychange');
              if (res.status === 'terminated_by_exit') {
                setTerminatedByExit(true);
                if (res.submission) {
                  setSubmissionResult({ ...res.submission, message: '', submittedAt: res.submission.submittedAt || new Date().toISOString() });
                }
                toast.error(
                  isAr
                    ? 'تم إنهاء الاختبار وتسليمه تلقائياً لتكرار مغادرة شاشة الاختبار (الوضع المشدد)'
                    : 'Quiz auto-submitted and terminated due to repeated window departures (Strict Anti-Cheat)',
                );
              } else {
                warningStrikeCountRef.current += 1;
                toast.warning(
                  isAr
                    ? '⚠️ تحذير مكافحة الغش: تم رصد مغادرة شاشة الاختبار! يرجى البقاء داخل نافذة الاختبار، حيث سيتم إنهاء الاختبار وتسليمه فوراً عند تكرار المغادرة.'
                    : '⚠️ Anti-Cheat Warning: Window departure detected! Please remain in the quiz window. Leaving again will auto-submit and terminate your exam.',
                  { duration: 8000 },
                );
              }
            } catch {
              // Handled
            }
          }, 6000);
        } else {
          // Flexible Resume Mode: Silently persist draft answers without warning or termination
          void recordQuizExit(quizId, answersPayload, 'visibilitychange');
        }
      } else if (document.visibilityState === 'visible') {
        // User returned within grace period -> cancel any pending termination
        if (hiddenGraceTimerRef.current) {
          clearTimeout(hiddenGraceTimerRef.current);
          hiddenGraceTimerRef.current = null;
        }
      }
    };

    const handlePageHide = () => {
      if (mountCooldownRef.current > 0 && Date.now() - mountCooldownRef.current < 8000) return;
      if (hiddenGraceTimerRef.current) {
        clearTimeout(hiddenGraceTimerRef.current);
      }
      const currentAnswers = selectedAnswersRef.current;
      const answersPayload = Object.entries(currentAnswers)
        .filter(([, idx]) => typeof idx === 'number' && idx >= 0)
        .map(([qId, idx]) => ({
          questionId: qId,
          selectedOptionIndex: idx,
        }));

      if (!allowResume && warningStrikeCountRef.current >= 2) {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          try {
            const blob = new Blob(
              [JSON.stringify({ answers: answersPayload, reason: 'force_terminate' })],
              { type: 'application/json' },
            );
            navigator.sendBeacon(`/api/quizzes/${quizId}/exit`, blob);
            return;
          } catch {
            // Fallback
          }
        }
        void recordQuizExit(quizId, answersPayload, 'force_terminate');
      } else {
        void recordQuizExit(quizId, answersPayload, 'pagehide');
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!allowResume) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (hiddenGraceTimerRef.current) {
        clearTimeout(hiddenGraceTimerRef.current);
        hiddenGraceTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [open, submissionResult, terminatedByExit, quizId, allowResume, quiz, isAr]);

  const questionsCount = quiz?.questions?.length || 0;
  const answeredCount = useMemo(() => {
    return Object.values(selectedAnswers).filter(
      (idx) => typeof idx === 'number' && idx >= 0,
    ).length;
  }, [selectedAnswers]);

  const handleClose = async () => {
    if (
      submissionResult ||
      terminatedByExit ||
      attemptQuery.isError ||
      !attemptData?.quiz
    ) {
      setSubmissionResult(null);
      setTerminatedByExit(false);
      queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });
      onOpenChange(false);
      onSubmitted();
      return;
    }

    // In Flexible Mode (الوضع المرن): No danger modal is needed!
    // Student can freely close the modal or exit.
    // Draft answers are saved and attempt stays in progress so they can resume anytime before time runs out.
    if (allowResume) {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }

      const currentAnswers = selectedAnswersRef.current;
      const answersPayload = Object.entries(currentAnswers)
        .filter(([, idx]) => typeof idx === 'number' && idx >= 0)
        .map(([qId, idx]) => ({
          questionId: qId,
          selectedOptionIndex: idx,
        }));

      if (quizId && answersPayload.length > 0) {
        try {
          await saveQuizDraft(quizId, answersPayload);
        } catch {
          // Handled
        }
      }

      queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });

      toast.info(
        isAr
          ? 'تم حفظ إجاباتك كمسودة، يمكنك استئناف الاختبار لاحقاً.'
          : 'Your answers have been saved as a draft. You can resume later.',
      );
      setSubmissionResult(null);
      setTerminatedByExit(false);
      setSelectedAnswers({});
      onOpenChange(false);
      onSubmitted();
      return;
    }

    // Strict Mode: show danger warning before closing and auto-submitting
    setShowExitConfirm(true);
  };

  const handleConfirmExit = async () => {
    setShowExitConfirm(false);
    try {
      await performSubmit();
    } finally {
      queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });
      setSubmissionResult(null);
      setTerminatedByExit(false);
      onOpenChange(false);
      onSubmitted();
    }
  };

  return (
    <>
      {/* Exit Confirmation Dialog - strictly rendered for Strict Mode (!allowResume) */}
      {!allowResume && (
        <ConfirmDialog
          open={showExitConfirm}
          onOpenChange={setShowExitConfirm}
          title={isAr ? 'تأكيد مغادرة الاختبار والتسليم الفوري' : 'Confirm Quiz Exit & Submission'}
          description={
            isAr
              ? 'تحذير أمني: هذا الاختبار يخضع للرقابة المشددة. إغلاق هذه النافذة أو مغادرتها سيؤدي فوراً إلى إنهاء محاولتك وتسليم إجاباتك الحالية تلقائياً ولن تتمكن من العودة للاختبار مجدداً. هل أنت متأكد من رغبتك في المغادرة والتسليم الآن؟'
              : 'Security Warning: This quiz is under strict anti-cheat monitoring. Leaving or closing this window will immediately terminate your attempt and submit your current answers. You will not be able to re-enter. Are you sure you want to exit and submit now?'
          }
          confirmLabel={isAr ? 'نعم، تسليم وخروج نهائي' : 'Yes, Submit & Exit'}
          cancelLabel={isAr ? 'تراجع واستكمال الاختبار' : 'Cancel & Return to Quiz'}
          destructive
          onConfirm={handleConfirmExit}
        />
      )}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          onInteractOutside={(e) => {
            if (
              !submissionResult &&
              !terminatedByExit &&
              !attemptQuery.isError &&
              attemptData?.quiz &&
              !allowResume
            ) {
              e.preventDefault();
              setShowExitConfirm(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (
              !submissionResult &&
              !terminatedByExit &&
              !attemptQuery.isError &&
              attemptData?.quiz &&
              !allowResume
            ) {
              e.preventDefault();
              setShowExitConfirm(true);
            }
          }}
          className="glass max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 p-6"
        >
        {submissionResult ? (
          /* ─── Result Celebration Card ─── */
          <div className="space-y-6 py-4 text-center">
            {submissionResult.publishResults === false || submissionResult.score === undefined ? (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-extrabold text-foreground">
                    {isAr ? 'تم تسليم الاختبار بنجاح!' : 'Quiz Submitted Successfully!'}
                  </h2>
                  <p className="text-xs text-muted-foreground">{quiz?.title}</p>
                </div>

                <div className="mx-auto max-w-sm rounded-2xl border border-border/80 bg-secondary/30 p-5 shadow-inner space-y-2 text-start">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>{isAr ? 'حالة النتيجة والدرجات' : 'Results & Scores Status'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? 'تم تسجيل وحفظ جميع إجاباتك بنجاح في النظام. سيتم إعلان وإظهار نتيجتك ودرجاتك فور اعتمادها ونشرها من قبل أستاذ المقرر.'
                      : 'All your answers were recorded and saved in the system. Your results and scores will be visible once reviewed and published by your instructor.'}
                  </p>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}

            <Button
              onClick={() => {
                queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });
                setSubmissionResult(null);
                setTerminatedByExit(false);
                onOpenChange(false);
                onSubmitted();
              }}
              className="bg-primary px-8 text-white hover:bg-primary-hover rounded-squircle font-semibold"
            >
              {isAr ? 'تم ومغادرة' : 'Done & Exit'}
            </Button>
          </div>
        ) : attemptQuery.isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              {isAr ? 'جاري تحميل أسئلة الاختبار...' : 'Loading quiz questions...'}
            </p>
          </div>
        ) : attemptQuery.isError ? (
          <div className="space-y-4 py-8 text-center" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                {!allowResume
                  ? (isAr ? 'تم إنهاء المحاولة وإغلاق الاختبار' : 'Attempt Terminated & Quiz Closed')
                  : (isAr ? 'تعذر فتح الاختبار' : 'Unable to Open Quiz')}
              </h3>
              <p className="text-xs text-rose-400 font-semibold max-w-md mx-auto">
                {getApiErrorMessage(attemptQuery.error)}
              </p>
              {!allowResume && (
                <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
                  {isAr
                    ? 'النمط المشدد ضد الغش يمنع إعادة الدخول أو الاستئناف بعد مغادرة الصفحة أو تحديثها.'
                    : 'Strict anti-cheat mode prevents re-entering or resuming after leaving or refreshing the page.'}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });
                onOpenChange(false);
                onSubmitted();
              }}
              className="rounded-squircle px-8 font-bold"
            >
              {isAr ? 'فهمت ذلك، إغلاق' : 'Got it, Close'}
            </Button>
          </div>
        ) : terminatedByExit ? (
          <div className="space-y-4 py-8 text-center" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                {isAr ? 'تم إنهاء الاختبار وتسليمه تلقائياً' : 'Quiz Terminated & Auto-Submitted'}
              </h3>
              <p className="text-xs text-rose-400 font-semibold max-w-md mx-auto">
                {isAr
                  ? 'تم تسجيل مغادرة الصفحة أو تبديل التبويب أثناء تفعيل الوضع المشدد ضد الغش.'
                  : 'Tab switch or window exit was detected under strict anti-cheat monitoring.'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
                {isAr
                  ? 'تم حفظ وتسليم إجاباتك الحالية تلقائياً ولا يمكن إعادة فتح الاختبار.'
                  : 'Your answers were automatically saved and submitted. You cannot re-enter.'}
              </p>
            </div>
            <Button
              onClick={() => {
                queryClient.removeQueries({ queryKey: ['start-quiz-attempt', quizId] });
                setSubmissionResult(null);
                setTerminatedByExit(false);
                onOpenChange(false);
                onSubmitted();
              }}
              className="rounded-squircle px-8 font-bold bg-primary text-white"
            >
              {isAr ? 'إغلاق ومغادرة' : 'Close & Leave'}
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

                {attemptData && typeof attemptData.remainingSeconds === 'number' && attemptData.remainingSeconds > 0 && (
                  <QuizTimerBadge
                    initialSeconds={attemptData.remainingSeconds}
                    onTimeUp={handleAutoSubmit}
                    isAr={isAr}
                  />
                )}
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

            {/* Mode Banner: Strict vs Flexible */}
            {!allowResume ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="font-semibold leading-relaxed">
                  {isAr
                    ? 'تنبيه مشدد: هذا الاختبار ذو دخول لمرة واحدة فقط. أي خروج أو إغلاق للنافذة سيؤدي فوراً إلى إنهاء الاختبار وتسليمه تلقائياً بما قمت بحله.'
                    : 'Important notice: Single-entry quiz. Leaving or closing this window will immediately finish and auto-submit your quiz with current answers.'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
                <span className="font-semibold leading-relaxed">
                  {isAr
                    ? 'الوضع المرن مفعّل: يتم حفظ إجاباتك تلقائياً كمسودة، ويمكنك إغلاق النافذة واستئناف الاختبار في أي وقت قبل انتهاء موعده.'
                    : 'Flexible mode active: Answers are auto-saved as drafts, and you can close this window and resume anytime before the deadline.'}
                </span>
              </div>
            )}

            {/* Questions List (Memoized against timer ticks) */}
            <QuizQuestionsList
              questions={quiz?.questions || []}
              selectedAnswers={selectedAnswers}
              onSelectOption={handleSelectOption}
              isAr={isAr}
            />

            <DialogFooter className="border-t border-border/80 pt-3 flex items-center justify-end rtl:sm:justify-start gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClose}
                className="rounded-squircle text-xs"
              >
                {allowResume
                  ? (isAr ? 'حفظ وخروج مؤقت' : 'Save & Exit')
                  : (isAr ? 'إلغاء وخروج' : 'Cancel & Exit')}
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
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
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
        <div
          className={`space-y-2.5 rounded-xl border p-3.5 text-xs ${
            quiz.allowResume !== false
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200/90'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-200/90'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {quiz.allowResume !== false ? (
              <>
                <RotateCcw className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="text-cyan-300">
                  {isAr ? 'نمط الاختبار المرن (إمكانية الاستئناف وحفظ المسودة):' : 'Flexible Resume Mode (Session Recovery Active):'}
                </span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 text-amber-300 shrink-0" />
                <span className="text-amber-300">
                  {isAr ? 'نمط الاختبار الصارم (دخول لمرة واحدة ومكافحة الغش):' : 'Strict Anti-Cheat Mode (Single Entry Only):'}
                </span>
              </>
            )}
          </div>
          <ul className="space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
            {quiz.allowResume !== false ? (
              <>
                <li>
                  <strong>{isAr ? 'استئناف المحاولة عند الانقطاع:' : 'Resume on Disconnect:'}</strong>{' '}
                  {isAr
                    ? 'في حال انقطاع الإنترنت أو إعادة تحميل الصفحة، يمكنك الدخول مجدداً واستئناف الحل داخل نافذة الاختبار.'
                    : 'If disconnected or the window reloads, you can re-enter and continue within the remaining time window.'}
                </li>
                <li>
                  <strong>{isAr ? 'حفظ تلقائي دوري للإجابات:' : 'Continuous Draft Autosave:'}</strong>{' '}
                  {isAr
                    ? 'يقوم النظام بحفظ إجاباتك كمسودة على الخادم بشكل دوري حتى لا تفقد إجاباتك السابقة.'
                    : 'Your answers are continuously autosaved on the server as drafts.'}
                </li>
                <li>
                  <strong>{isAr ? 'احتساب الوقت مركزياً على الخادم:' : 'Server-Enforced Timer:'}</strong>{' '}
                  {isAr
                    ? 'الوقت المتبقي يُحسب مركزياً من الخادم منذ بدء المحاولة ولا يتوقف عند انقطاع الاتصال.'
                    : 'Remaining time is calculated on the server and does not pause during disconnections.'}
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong>{isAr ? 'دخول لمرة واحدة فقط:' : 'Single Entry Only:'}</strong>{' '}
                  {isAr
                    ? 'الاختبار متاح للدخول لمرة واحدة فقط دون إمكانية الخروج والعودة لاحقاً.'
                    : 'You have only one attempt. Rejoining after leaving is strictly prohibited.'}
                </li>
                <li>
                  <strong>{isAr ? 'تسليم فوري وإنهاء عند المغادرة:' : 'Auto-Submit on Exit / Tab-Switch:'}</strong>{' '}
                  {isAr
                    ? 'أي خروج من وضع ملء الشاشة أو تغيير التبويب أو إغلاق المتصفح سيؤدي فوراً لإنهاء المحاولة وتسليمها وحظر العودة.'
                    : 'Exiting full screen, switching tabs, or closing/reloading the browser will immediately finalize your answers and lock your attempt.'}
                </li>
                <li>
                  <strong>{isAr ? 'العداد الزمني التنازلي:' : 'Timer Countdown:'}</strong>{' '}
                  {isAr
                    ? 'سيبدأ احتساب وقت الاختبار التنازلي فور الضغط على زر البدء.'
                    : 'Countdown timer begins immediately upon entering the quiz.'}
                </li>
              </>
            )}
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

/* ─── Quiz Review Modal (After Quiz Window Ends) ───────── */
interface QuizReviewModalProps {
  quizId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
}

function QuizReviewModal({
  quizId,
  open,
  onOpenChange,
  isAr,
}: QuizReviewModalProps) {
  const reviewQuery = useQuery({
    queryKey: ['student-quiz-review', quizId],
    queryFn: () => getQuizReview(quizId!),
    enabled: open && Boolean(quizId),
    retry: false,
  });

  const review = reviewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="glass max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 p-5 sm:p-6"
      >
        {reviewQuery.isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'جاري تحميل نموذج الإجابة والمراجعة...'
                : 'Loading quiz review & answer key...'}
            </p>
          </div>
        ) : reviewQuery.isError ? (
          <div className="space-y-4 py-8 text-center" dir={isAr ? 'rtl' : 'ltr'}>
            <AlertCircle className="mx-auto h-12 w-12 text-amber-400" />
            <p className="text-sm font-semibold text-rose-400">
              {getApiErrorMessage(reviewQuery.error)}
            </p>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="rounded-squircle px-6 font-bold"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        ) : review ? (
          <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
            {/* Header */}
            <DialogHeader className="border-b border-border/80 pb-4 text-start space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    {review.quiz.title}
                  </DialogTitle>
                  <p className="text-xs text-primary font-mono mt-0.5">
                    {review.quiz.courseCode} -{' '}
                    {isAr
                      ? review.quiz.courseNameAr || review.quiz.courseName
                      : review.quiz.courseNameEn || review.quiz.courseName}
                  </p>
                </div>
                {/* Result Pill */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-mono text-xs font-bold px-3 py-1 rounded-full border',
                      review.submission.isPassed
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                    )}
                  >
                    {review.submission.score} / {review.submission.totalMarks} (
                    {review.submission.percentage}%) -{' '}
                    {review.submission.isPassed
                      ? isAr
                        ? 'ناجح'
                        : 'Passed'
                      : isAr
                        ? 'راسب'
                        : 'Failed'}
                  </span>
                </div>
              </div>
            </DialogHeader>

            {/* Questions Review List */}
            <div className="space-y-4">
              {review.questions.map((q) => {
                return (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-border/80 bg-secondary/20 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold font-mono text-primary">
                          {q.index}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          ({q.points} {isAr ? 'درجة' : 'marks'})
                        </span>
                      </div>

                      {q.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>
                            {isAr
                              ? `إجابة صحيحة (+${q.pointsAwarded})`
                              : `Correct (+${q.pointsAwarded})`}
                          </span>
                        </span>
                      ) : q.studentSelectedOptionIndex === -1 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>{isAr ? 'لم تتم الإجابة' : 'Unanswered'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>{isAr ? 'إجابة خاطئة (0)' : 'Incorrect (0)'}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-foreground leading-relaxed">
                      {q.text}
                    </p>

                    {/* Options */}
                    <div className="space-y-2 pt-1">
                      {(q.options || []).map((opt, optIdx) => {
                        const isCorrectOption = optIdx === q.correctOptionIndex;
                        const isStudentChoice =
                          optIdx === q.studentSelectedOptionIndex;

                        let borderBgClasses =
                          'border-border/70 bg-card/40 text-muted-foreground';
                        if (isCorrectOption) {
                          borderBgClasses =
                            'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 font-semibold';
                        } else if (isStudentChoice && !q.isCorrect) {
                          borderBgClasses =
                            'border-rose-500/50 bg-rose-500/10 text-rose-200 font-semibold';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border text-xs sm:text-sm transition-all',
                              borderBgClasses,
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={cn(
                                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-mono border',
                                  isCorrectOption
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : isStudentChoice
                                      ? 'border-rose-500 bg-rose-500 text-white'
                                      : 'border-border text-muted-foreground',
                                )}
                              >
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="truncate">{opt}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCorrectOption && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-squircle">
                                  <Check className="h-3 w-3" />
                                  <span>{isAr ? 'الإجابة النموذجية' : 'Correct'}</span>
                                </span>
                              )}
                              {isStudentChoice && (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-squircle',
                                    isCorrectOption
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-rose-500/20 text-rose-300',
                                  )}
                                >
                                  <span>{isAr ? 'إجابتك' : 'Your Choice'}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 p-3 text-xs text-teal-200/90 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-teal-300">
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span>{isAr ? 'الشرح والتوضيح:' : 'Explanation:'}</span>
                        </div>
                        <p className="leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="rounded-squircle px-6 font-bold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Student Quiz Result Modal Component ─────────────────── */
interface StudentQuizResultModalProps {
  quiz: StudentQuizViewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenReview: (quizId: string) => void;
  isAr: boolean;
}

function StudentQuizResultModal({
  quiz,
  open,
  onOpenChange,
  onOpenReview,
  isAr,
}: StudentQuizResultModalProps) {
  if (!quiz) return null;
  const sub = quiz.submission;
  const canReview = quiz.canReview === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-card border border-border/80 shadow-2xl rounded-2xl" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader className="space-y-2 text-start">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Award className="h-5 w-5" />
            <DialogTitle className="text-base font-extrabold text-foreground">
              {isAr ? 'نتيجة الاختبار وتقرير الأداء' : 'Quiz Result & Performance'}
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {quiz.title} • {isAr ? (quiz.courseNameAr || quiz.courseName) : (quiz.courseNameEn || quiz.courseName)}
          </p>
        </DialogHeader>

        {sub && typeof sub.score === 'number' ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5 text-center">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? 'الدرجة المحصلة' : 'Score'}
                </span>
                <div className="mt-1 text-2xl font-black font-mono text-primary">
                  {sub.score}{' '}
                  <span className="text-xs font-normal text-muted-foreground">/ {sub.totalMarks}</span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5 text-center">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? 'النسبة المئوية' : 'Percentage'}
                </span>
                <div className="mt-1 text-2xl font-black font-mono text-foreground">
                  {sub.percentage}%
                </div>
              </div>
            </div>

            <div
              className={cn(
                'rounded-xl border p-3.5 text-center flex items-center justify-between px-4',
                sub.isPassed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
              )}
            >
              <span className="text-xs font-bold">
                {isAr ? 'التقييم العام:' : 'Result Status:'}
              </span>
              <span className="text-sm font-extrabold">
                {sub.isPassed ? (isAr ? 'ناجح (اجتياز بنجاح)' : 'Passed') : (isAr ? 'راسب' : 'Failed')}
              </span>
            </div>

            <div className="text-[11px] text-muted-foreground font-mono space-y-1 pt-1 border-t border-border/60">
              {sub.submittedAt && (
                <div className="flex items-center justify-between">
                  <span>{isAr ? 'تاريخ التسليم:' : 'Submitted At:'}</span>
                  <span>
                    {new Date(sub.submittedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
                      timeZone: 'Africa/Cairo',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              {sub.durationSeconds > 0 && (
                <div className="flex items-center justify-between">
                  <span>{isAr ? 'مدة الإجابة:' : 'Duration:'}</span>
                  <span>
                    {Math.floor(sub.durationSeconds / 60)} {isAr ? 'دقيقة' : 'm'}{' '}
                    {sub.durationSeconds % 60} {isAr ? 'ثانية' : 's'}
                  </span>
                </div>
              )}
            </div>

            {canReview && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onOpenReview(quiz._id);
                }}
                className="w-full rounded-squircle gap-2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs h-9"
              >
                <ListChecks className="h-4 w-4" />
                <span>{isAr ? 'مراجعة الأسئلة والإجابات النموذجية' : 'Review Questions & Model Answers'}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="py-6 text-center space-y-2">
            <Clock className="h-8 w-8 text-amber-400 mx-auto" />
            <p className="text-sm font-bold text-foreground">
              {isAr ? 'النتيجة قيد الإعلان والاعتماد' : 'Results Pending Release'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {isAr
                ? 'لم يقم أستاذ المقرر بإعلان نتائج الاختبار بعد. ستظهر النتيجة تلقائياً هنا بمجرد اعتمادها.'
                : 'The course instructor has not published results yet. They will appear here once released.'}
            </p>
          </div>
        )}

        <DialogFooter className="sm:justify-start rtl:sm:justify-start">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle px-6 text-xs font-semibold"
          >
            {isAr ? 'إغلاق' : 'Close'}
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
  const [reviewQuizId, setReviewQuizId] = useState<string | null>(null);
  const [resultModalQuizId, setResultModalQuizId] = useState<string | null>(null);
  const tRelease = useTranslations('quizRelease');

  // 1. Fetch Online Quizzes from Quizzes module
  const onlineQuizzesQuery = useQuery({
    queryKey: ['student-online-quizzes'],
    queryFn: () => getStudentQuizzesWithTiming(),
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  // 2. Fetch past uploaded excel quiz scores
  const historyQuery = useQuery({
    queryKey: ['student-quizzes-history'],
    queryFn: async () => {
      const res = await api.get<CourseQuiz[]>('/students/me/course-quizzes');
      return res.data;
    },
  });

  useQuizReleaseRefresh(onlineQuizzesQuery.data, onlineQuizzesQuery.refetch);
  const onlineQuizzes = useMemo(() => onlineQuizzesQuery.data?.quizzes || [], [onlineQuizzesQuery.data?.quizzes]);
  const resultModalQuiz = onlineQuizzes.find((quiz) => quiz._id === resultModalQuizId) ?? null;
  const historyItems = useMemo(() => historyQuery.data || [], [historyQuery.data]);

  // Close a revoked review before rendering another frame with stale answers.
  if (reviewQuizId && onlineQuizzesQuery.data && !onlineQuizzes.some((quiz) => quiz._id === reviewQuizId && quiz.canReview)) {
    setReviewQuizId(null);
  }
  useEffect(() => {
    if (!onlineQuizzesQuery.data) return;
    const allowed = onlineQuizzesQuery.data.quizzes;
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] === 'student-quiz-review' && !allowed.some((quiz) => quiz._id === query.queryKey[1] && quiz.canReview),
    });
  }, [onlineQuizzesQuery.data, queryClient]);

  const toggleExpand = (courseId: string) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  };

  const combinedCourses = useMemo(() => {
    const coursesMap: Record<
      string,
      {
        courseId: string;
        courseCode: string;
        courseName: string;
        uploadedQuizzes: QuizEntry[];
        onlineQuizzes: StudentQuizViewItem[];
        totalGrade: number;
        maxTotalGrade: number;
      }
    > = {};

    for (const c of historyItems) {
      coursesMap[c.courseCode] = {
        courseId: c._id,
        courseCode: c.courseCode,
        courseName: c.courseName,
        uploadedQuizzes: c.quizzes || [],
        onlineQuizzes: [],
        totalGrade: c.totalGrade,
        maxTotalGrade: c.maxTotalGrade,
      };
    }

    for (const q of onlineQuizzes) {
      if (!q.isSubmitted && q.attemptStatus !== 'terminated_by_exit') continue;
      const code = q.courseCode;
      if (!coursesMap[code]) {
        coursesMap[code] = {
          courseId: q.courseId,
          courseCode: q.courseCode,
          courseName: isAr
            ? q.courseNameAr || q.courseName
            : q.courseNameEn || q.courseName,
          uploadedQuizzes: [],
          onlineQuizzes: [],
          totalGrade: 0,
          maxTotalGrade: 0,
        };
      }
      coursesMap[code].onlineQuizzes.push(q);
      if (q.submission && q.publishResults && typeof q.submission.score === 'number') {
        coursesMap[code].totalGrade += q.submission.score;
        coursesMap[code].maxTotalGrade += q.submission.totalMarks;
      }
    }

    return Object.values(coursesMap);
  }, [historyItems, onlineQuizzes, isAr]);

  const { allTotalGrade, allMaxTotalGrade, combinedOverallPct, totalCompletedQuizzes } =
    useMemo(() => {
      const allTotal = combinedCourses.reduce((acc, c) => acc + c.totalGrade, 0);
      const allMax = combinedCourses.reduce((acc, c) => acc + c.maxTotalGrade, 0);
      const overallPct =
        allMax > 0 ? Math.round((allTotal / allMax) * 100) : 0;
      const completed = combinedCourses.reduce(
        (acc, c) => acc + c.uploadedQuizzes.length + c.onlineQuizzes.length,
        0,
      );
      return {
        allTotalGrade: allTotal,
        allMaxTotalGrade: allMax,
        combinedOverallPct: overallPct,
        totalCompletedQuizzes: completed,
      };
    }, [combinedCourses]);

  const activeOpenQuizzesCount = useMemo(() => {
    return onlineQuizzes.filter((q) => q.isOpen && !q.isSubmitted).length;
  }, [onlineQuizzes]);

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
          {activeOpenQuizzesCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[11px] font-bold text-primary">
              {activeOpenQuizzesCount}
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
                const isStrictLocked = quiz.attemptStatus === 'in_progress' && quiz.allowResume === false;
                const isTerminated = quiz.attemptStatus === 'terminated_by_exit' || isStrictLocked;
                const isInProgress = quiz.attemptStatus === 'in_progress';
                const canTake = quiz.isOpen && !quiz.isSubmitted && !isTerminated && (!isInProgress || quiz.allowResume !== false);

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
                            <span className="inline-flex items-center gap-1 rounded-squircle border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{isAr ? 'تم التسليم' : 'Submitted'}</span>
                            </span>
                          ) : isTerminated ? (
                            <span className="inline-flex items-center gap-1 rounded-squircle border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-400">
                              <AlertTriangle className="h-3 w-3" />
                              <span>{isAr ? 'ملغى (خروج)' : 'Terminated'}</span>
                            </span>
                          ) : isInProgress && quiz.allowResume !== false ? (
                            <span className="inline-flex items-center gap-1.5 rounded-squircle border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-bold text-cyan-400">
                              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                              <span>{isAr ? 'جارٍ وقابل للاستئناف' : 'In Progress (Resumable)'}</span>
                            </span>
                          ) : quiz.isOpen ? (
                            <span className="inline-flex items-center gap-1.5 rounded-squircle border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-bold text-teal-400">
                              <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                              <span>{isAr ? 'متاح الآن' : 'Open Now'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-squircle border border-muted/30 bg-muted/10 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
                              <div className="flex items-center gap-2">
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
                                <LiveCountdown targetDate={quiz.startsAt} isAr={isAr} />
                              </div>
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

                      {quiz.endsAt && ((quiz.resultsReleaseMode === 'after_close' && !quiz.publishResults) || (quiz.reviewReleaseMode === 'after_close' && !quiz.canReview)) && (
                        <p className="text-xs text-muted-foreground" data-testid="quiz-release-schedule">
                          {quiz.isEnded && !quiz.publishResults && quiz.reviewReleaseMode === 'after_close'
                            ? tRelease('waiting')
                            : tRelease('scheduledAt', { time: new Date(quiz.endsAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }) })}
                        </p>
                      )}

                      {/* Bottom Action / Score Info */}
                      <div className="pt-4 border-t border-border/70 mt-4 flex flex-col gap-3">
                        {quiz.isSubmitted ? (
                          !quiz.publishResults || typeof quiz.submission?.score !== 'number' ? (
                            <div className="flex flex-col gap-2 rounded-squircle bg-secondary/35 border border-border/70 p-3 text-start">
                              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                                <span>{isAr ? 'تم استلام الإجابات بنجاح' : 'Answers Received Successfully'}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {isAr
                                  ? 'بانتظار إعلان ونشر النتيجة والدرجات من أستاذ المقرر. سيتاح زر الاطلاع على النتيجة هنا فور اعتمادها.'
                                  : 'Awaiting results release from course instructor. The view result button will be available once announced.'}
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2.5 w-full">
                              <Button
                                onClick={() => setResultModalQuizId(quiz._id)}
                                className="w-full rounded-squircle gap-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs h-9 shadow-md shadow-teal-600/20"
                              >
                                <Eye className="h-4 w-4" />
                                <span>{isAr ? 'عرض نتيجة ودرجة الاختبار' : 'See Quiz Result'}</span>
                              </Button>

                              {(quiz.allowReview !== false || quiz.reviewReleaseMode === 'after_close') && (
                                quiz.canReview === true ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setReviewQuizId(quiz._id)}
                                    className="w-full rounded-squircle gap-2 border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs h-8"
                                  >
                                    <ListChecks className="h-3.5 w-3.5" />
                                    <span>
                                      {isAr
                                        ? 'مراجعة الأسئلة والإجابات النموذجية'
                                        : 'Review Questions & Answers'}
                                    </span>
                                  </Button>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5 rounded-squircle bg-amber-500/10 border border-amber-500/20 py-1 px-2 text-[10px] text-amber-300 font-medium">
                                    <Clock className="h-3 w-3 shrink-0" />
                                    <span>
                                      {isAr
                                        ? 'تتاح مراجعة الأسئلة بعد انتهاء موعد الاختبار'
                                        : 'Review unlocks after quiz deadline'}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )
                        ) : isTerminated ? (
                          <>
                            <div className="flex flex-col items-center justify-center w-full py-1 text-center space-y-1">
                              <span className="inline-flex items-center gap-1.5 rounded-squircle border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تم إنهاء المحاولة لمغادرة الصفحة' : 'Attempt Terminated on Window Exit'}</span>
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {isAr ? 'النمط الصارم يمنع إعادة الدخول بعد الخروج' : 'Strict mode locked after tab switch / exit'}
                              </span>
                            </div>

                            {/* Review Button if completed/ended */}
                            {quiz.canReview === true && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setReviewQuizId(quiz._id)}
                                className="w-full rounded-squircle gap-2 border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>
                                  {isAr
                                    ? 'مراجعة الأسئلة والإجابات النموذجية'
                                    : 'Review Questions & Answers'}
                                </span>
                              </Button>
                            )}
                          </>
                        ) : canTake ? (
                          <Button
                            onClick={() => setConfirmStartQuiz(quiz)}
                            className={`w-full font-bold text-white rounded-squircle gap-2 shadow-lg ${
                              isInProgress && quiz.allowResume !== false
                                ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20'
                                : 'bg-primary hover:bg-primary-hover shadow-primary/20'
                            }`}
                          >
                            {isInProgress && quiz.allowResume !== false ? (
                              <>
                                <RotateCcw className="h-4 w-4" />
                                <span>{isAr ? 'استئناف الاختبار الجاري' : 'Resume Quiz in Progress'}</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 fill-white" />
                                <span>{isAr ? 'ابدأ الاختبار الآن' : 'Start Quiz Now'}</span>
                              </>
                            )}
                          </Button>
                        ) : (
                          <div className="w-full flex items-center justify-center py-1">
                            {quiz.isEnded ? (
                              <span className="text-xs text-muted-foreground italic">
                                {isAr ? 'انتهت فترة الاختبار' : 'Quiz time has ended'}
                              </span>
                            ) : quiz.startsAt ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {isAr ? 'يبدأ خلال:' : 'Opens in:'}
                                </span>
                                <LiveCountdown targetDate={quiz.startsAt} isAr={isAr} />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                {isAr ? 'سيبدأ الاختبار قريباً' : 'Starting soon'}
                              </span>
                            )}
                          </div>
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

      {/* ─── TAB 2: Quiz Grades & Coursework History ─── */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {historyQuery.isLoading || onlineQuizzesQuery.isLoading ? (
            <LoadingState title={tCommon('loading')} />
          ) : historyQuery.isError ? (
            <ErrorState
              description={getApiErrorMessage(historyQuery.error)}
              error={historyQuery.error}
              onRetry={() => historyQuery.refetch()}
            />
          ) : combinedCourses.length === 0 ? (
            <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)]">
              <EmptyState
                title={isEnglish ? 'No quiz records found' : 'لا توجد سجلات درجات للكويزات'}
                description={
                  isEnglish
                    ? 'No online quizzes submitted or coursework evaluations uploaded yet.'
                    : 'لم يتم تسليم أي اختبارات إلكترونية أو رفع درجات أعمال سنة لك بعد.'
                }
              />
            </Card>
          ) : (
            <>
                  {/* Summary widgets */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 rounded-2xl">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black uppercase text-muted-foreground">
                            {isEnglish ? 'Overall Performance' : 'معدل الأداء العام'}
                          </span>
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                        </div>
                        <span className="text-2xl font-black font-mono text-foreground">
                          {allMaxTotalGrade > 0 ? `${combinedOverallPct}%` : '—'}
                        </span>
                      </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
                      <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 rounded-2xl">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black uppercase text-muted-foreground">
                            {isEnglish ? 'Total Points Earned' : 'مجموع الدرجات'}
                          </span>
                          <Award className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <span className="text-2xl font-black font-mono text-foreground">
                          {allMaxTotalGrade > 0 ? `${allTotalGrade} / ${allMaxTotalGrade}` : '—'}
                        </span>
                      </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
                      <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 rounded-2xl">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black uppercase text-muted-foreground">
                            {isEnglish ? 'Completed Quizzes' : 'الاختبارات المنجزة'}
                          </span>
                          <FileText className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <span className="text-2xl font-black font-mono text-foreground">
                          {totalCompletedQuizzes}
                        </span>
                      </Card>
                    </motion.div>
                  </div>

                  {/* Course Quiz & Review List */}
                  <div className="space-y-4">
                    {combinedCourses.map((course, idx) => {
                      const isExpanded = expandedCourses[course.courseCode] ?? true;
                      const coursePct =
                        course.maxTotalGrade > 0
                          ? Math.round((course.totalGrade / course.maxTotalGrade) * 100)
                          : 0;

                      return (
                        <motion.div
                          key={course.courseCode}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: idx * 0.04 }}
                        >
                          <Card className="bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 overflow-hidden p-0 rounded-2xl">
                            <div
                              onClick={() => toggleExpand(course.courseCode)}
                              className="flex cursor-pointer items-center justify-between p-4.5 hover:bg-secondary/40 transition-all select-none"
                            >
                              <div className="flex items-center gap-3.5">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 border border-primary/20">
                                  <FileText className="h-5.5 w-5.5" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-bold text-foreground leading-snug">{course.courseName}</h3>
                                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{course.courseCode}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-end">
                                  {course.maxTotalGrade > 0 ? (
                                    <>
                                      <span className="text-sm font-bold text-foreground block font-mono">
                                        {course.totalGrade} / {course.maxTotalGrade}
                                      </span>
                                      <span className="text-[10px] font-semibold text-primary">
                                        ({coursePct}%)
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-xs font-semibold text-amber-400 block">
                                      {isAr ? 'النتائج قيد الإعلان' : 'Results Pending'}
                                    </span>
                                  )}
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
                                  <div className="border-t border-border bg-secondary/15 p-5 space-y-5">
                                    {/* 1. Online Quizzes with Review Answer Key */}
                                    {course.onlineQuizzes.length > 0 && (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                                            <Award className="h-4 w-4 text-teal-400" />
                                            <span>
                                              {isAr
                                                ? 'الاختبارات الإلكترونية (مع مراجعة الإجابات النموذجية)'
                                                : 'Online Quizzes & Answer Key Review'}
                                            </span>
                                          </h4>
                                          <span className="text-[11px] font-mono text-muted-foreground">
                                            {course.onlineQuizzes.length} {isAr ? 'اختبار' : 'quizzes'}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {course.onlineQuizzes.map((q) => {
                                            const sub = q.submission;
                                            const canReview =
                                              q.canReview === true;

                                            return (
                                              <div
                                                key={q._id}
                                                className="rounded-xl border border-border/80 bg-card/60 p-3.5 space-y-3 shadow-sm hover:border-primary/40 transition-all"
                                              >
                                                <div className="flex items-start justify-between gap-2">
                                                  <div>
                                                    <h5 className="text-xs font-bold text-foreground">
                                                      {q.title}
                                                    </h5>
                                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                                      {q.durationMinutes} {isAr ? 'دقيقة' : 'mins'} • {q.questionsCount} {isAr ? 'أسئلة' : 'questions'}
                                                    </p>
                                                  </div>

                                                  {q.publishResults && sub && typeof sub.score === 'number' ? (
                                                    <span
                                                      className={cn(
                                                        'font-mono text-[11px] font-bold px-2 py-0.5 rounded-squircle border',
                                                        sub.isPassed
                                                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                                                      )}
                                                    >
                                                      {sub.score} / {sub.totalMarks} ({sub.percentage}%)
                                                    </span>
                                                  ) : (
                                                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-squircle bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                                      {isAr ? 'النتيجة قيد الإعلان' : 'Results Pending'}
                                                    </span>
                                                  )}
                                                </div>

                                                {/* Action / Review Button */}
                                                <div className="pt-1 border-t border-border/60 flex items-center justify-between">
                                                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {sub?.submittedAt
                                                      ? new Date(sub.submittedAt).toLocaleDateString(
                                                          isAr ? 'ar-EG' : 'en-GB',
                                                        )
                                                      : '—'}
                                                  </span>

                                                  <div className="flex items-center gap-1.5">
                                                    {q.publishResults && sub && typeof sub.score === 'number' && (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setResultModalQuizId(q._id);
                                                        }}
                                                        className="rounded-squircle gap-1 border border-border/80 text-foreground hover:bg-secondary/60 font-semibold text-xs h-7.5 px-2.5"
                                                      >
                                                        <Award className="h-3.5 w-3.5 text-teal-400" />
                                                        <span>{isAr ? 'النتيجة' : 'Result'}</span>
                                                      </Button>
                                                    )}

                                                    {q.publishResults && canReview ? (
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setReviewQuizId(q._id);
                                                        }}
                                                        className="rounded-squircle gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs h-7.5 px-3"
                                                      >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        <span>
                                                          {isAr ? 'مراجعة الإجابات' : 'Review Answers'}
                                                        </span>
                                                      </Button>
                                                    ) : !q.publishResults ? (
                                                      <span className="text-[10px] text-muted-foreground font-medium">
                                                        {isAr ? 'بانتظار إعلان أستاذ المقرر' : 'Pending instructor release'}
                                                      </span>
                                                    ) : (
                                                      <span className="text-[10px] text-amber-300/90 font-medium">
                                                        {isAr
                                                          ? 'تتاح المراجعة بعد موعد الإغلاق'
                                                          : 'Unlocks after deadline'}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* 2. Uploaded Coursework Grades Table */}
                                    {course.uploadedQuizzes.length > 0 && (
                                      <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-primary" />
                                            <span>
                                              {isAr
                                                ? 'تقييمات وتكليفات أعمال السنة (من الكنترول)'
                                                : 'Coursework & Assignment Evaluations'}
                                            </span>
                                          </h4>
                                        </div>

                                        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card/40">
                                          <table className="w-full border-collapse text-start text-xs">
                                            <thead>
                                              <tr className="border-b border-border/80 text-muted-foreground font-bold text-start bg-secondary/30">
                                                <th className="p-3 text-start">{isEnglish ? 'Evaluation Title' : 'اسم التكليف / الاختبار'}</th>
                                                <th className="p-3 text-center">{isEnglish ? 'Attendance' : 'الحضور'}</th>
                                                <th className="p-3 text-center">{isEnglish ? 'Grade' : 'الدرجة'}</th>
                                                <th className="p-3 text-end">{isEnglish ? 'Date' : 'التاريخ'}</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                              {course.uploadedQuizzes.map((quiz, index) => (
                                                <tr key={index} className="text-foreground hover:bg-secondary/25 transition-colors">
                                                  <td className="p-3 text-start font-bold text-foreground">{quiz.title}</td>
                                                  <td className="p-3 text-center">
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
                                                  <td className="p-3 text-center font-mono font-bold text-foreground">
                                                    {quiz.status === 'present' ? `${quiz.grade} / ${quiz.maxGrade}` : '—'}
                                                  </td>
                                                  <td className="p-3 text-end text-muted-foreground font-mono">
                                                    {quiz.date
                                                      ? new Date(quiz.date).toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG')
                                                      : '—'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
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
            queryClient.removeQueries({
              queryKey: ['start-quiz-attempt', confirmStartQuiz._id],
            });
            setTakingQuizId(confirmStartQuiz._id);
            setConfirmStartQuiz(null);
          }
        }}
        isAr={isAr}
      />

      {/* Taking Quiz Interactive Modal */}
      {takingQuizId && (
        <TakeQuizModal
          key={takingQuizId}
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
      )}

      {/* Quiz Questions & Model Answers Review Modal */}
      <QuizReviewModal
        quizId={reviewQuizId}
        open={Boolean(reviewQuizId)}
        onOpenChange={(op) => {
          if (!op) setReviewQuizId(null);
        }}
        isAr={isAr}
      />

      {/* Student Quiz Result Modal */}
      <StudentQuizResultModal
        quiz={resultModalQuiz}
        open={Boolean(resultModalQuiz)}
        onOpenChange={(op) => {
          if (!op) setResultModalQuizId(null);
        }}
        onOpenReview={(id) => setReviewQuizId(id)}
        isAr={isAr}
      />
    </div>
  );
}
