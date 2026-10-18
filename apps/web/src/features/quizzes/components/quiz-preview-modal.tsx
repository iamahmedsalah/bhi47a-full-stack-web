'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  HelpCircle,
  Clock,
  Award,
  ListChecks,
  CheckCircle2,
  Calendar,
  Edit2,
  BookOpen,
  Info,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type { QuizItem } from '../api';

export interface QuizPreviewModalProps {
  quiz: QuizItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
  canEdit?: boolean;
  onEdit?: (quiz: QuizItem) => void;
}

export function QuizPreviewModal({
  quiz,
  open,
  onOpenChange,
  isAr,
  canEdit = false,
  onEdit,
}: QuizPreviewModalProps) {
  if (!quiz) return null;

  const questions = quiz.questions || [];
  const totalQuestions = questions.length;
  const courseDisplay = `${quiz.courseCode} - ${isAr ? quiz.courseNameAr || quiz.courseName : quiz.courseName}`;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formattedStart = formatDateTime(quiz.startsAt || quiz.open_at);
  const formattedEnd = formatDateTime(quiz.endsAt || quiz.close_at);

  const getOptionLetter = (index: number) => {
    if (isAr) {
      const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
      return letters[index] || String(index + 1);
    }
    return String.fromCharCode(65 + index); // A, B, C, D
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl border-border bg-card p-6 shadow-2xl">
        <DialogHeader className="border-b border-border/70 pb-4 text-start rtl:text-right">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HelpCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {isAr ? quiz.titleAr || quiz.title : quiz.title}
                  </DialogTitle>
                  <StatusBadge
                    label={quiz.isPublished ? (isAr ? 'منشور للطلاب' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
                    variant={quiz.isPublished ? 'success' : 'neutral'}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-semibold text-foreground/90">
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    <span>{courseDisplay}</span>
                  </span>
                  {quiz.creatorName && (
                    <>
                      <span>•</span>
                      <span>
                        {isAr ? 'بواسطة:' : 'By:'} {quiz.creatorName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {canEdit && onEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(quiz);
                }}
                className="shrink-0 gap-1.5 rounded-squircle border-primary/30 text-primary hover:bg-primary/10 text-xs font-semibold"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>{isAr ? 'تعديل الاختبار' : 'Edit Quiz'}</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Quiz Description if present */}
          {quiz.description && (
            <p className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground leading-relaxed">
              {quiz.description}
            </p>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-surface/50 p-3 text-start">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                {isAr ? 'عدد الأسئلة' : 'Questions'}
              </span>
              <p className="mt-1 text-base font-bold text-foreground font-mono">
                {totalQuestions} {isAr ? 'سؤال' : 'items'}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface/50 p-3 text-start">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-teal-500" />
                {isAr ? 'مدة الاختبار' : 'Duration'}
              </span>
              <p className="mt-1 text-base font-bold text-foreground font-mono">
                {quiz.durationMinutes} {isAr ? 'دقيقة' : 'min'}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface/50 p-3 text-start">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Award className="h-3.5 w-3.5 text-amber-500" />
                {isAr ? 'الدرجة الكلية' : 'Total Marks'}
              </span>
              <p className="mt-1 text-base font-bold text-foreground font-mono">
                {quiz.totalMarks} {isAr ? 'درجة' : 'pts'}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface/50 p-3 text-start">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {isAr ? 'درجة النجاح' : 'Passing Mark'}
              </span>
              <p className="mt-1 text-base font-bold text-foreground font-mono">
                {quiz.passingMarks} {isAr ? 'درجة' : 'pts'}
              </p>
            </div>
          </div>

          {/* Schedule Window & Resume mode */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5 text-xs text-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>
                {formattedStart || formattedEnd ? (
                  <>
                    {formattedStart && <span>{isAr ? `من: ${formattedStart}` : `From: ${formattedStart}`}</span>}
                    {formattedStart && formattedEnd && <span className="mx-1.5">|</span>}
                    {formattedEnd && <span>{isAr ? `إلى: ${formattedEnd}` : `Until: ${formattedEnd}`}</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground italic">
                    {isAr ? 'متاح دائماً للطلاب (بدون نافذة زمنية محددة)' : 'Always open (no fixed time window)'}
                  </span>
                )}
              </span>
            </div>

            {quiz.allowResume && (
              <Badge variant="outline" className="border-teal-500/40 text-teal-700 dark:text-teal-300 text-[11px] gap-1 py-0.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isAr ? 'استئناف مرن مفعل' : 'Flexible Resume Enabled'}</span>
              </Badge>
            )}
          </div>

          {/* Questions Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-primary" />
                <span>{isAr ? `الأسئلة ونموذج الإجابة (${totalQuestions})` : `Questions & Model Answers (${totalQuestions})`}</span>
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {isAr
                  ? 'يتم تمييز الإجابة الصحيحة باللون الأخضر'
                  : 'Correct answers are highlighted in emerald green'}
              </span>
            </div>

            {questions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                {isAr ? 'لا توجد أسئلة مضافة في هذا الاختبار' : 'No questions found in this quiz'}
              </div>
            ) : (
              <div className="space-y-3.5">
                {questions.map((q, qIndex) => {
                  const qType = q.type || 'mcq';
                  const options =
                    Array.isArray(q.options) && q.options.length > 0
                      ? q.options
                      : qType === 'true_false'
                        ? [isAr ? 'صواب' : 'True', isAr ? 'خطأ' : 'False']
                        : [];

                  return (
                    <div
                      key={q.id || qIndex}
                      className="rounded-xl border border-border/80 bg-secondary/25 p-4 space-y-3 text-start transition-all hover:border-border"
                    >
                      {/* Question Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary font-mono">
                            {qIndex + 1}
                          </span>
                          <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {qType === 'true_false'
                              ? isAr ? 'صح أو خطأ' : 'True / False'
                              : isAr ? 'اختيار من متعدد' : 'Multiple Choice'}
                          </span>
                        </div>

                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary font-mono">
                          {q.points || 1} {isAr ? 'درجة' : 'pts'}
                        </span>
                      </div>

                      {/* Question Text */}
                      <p className="text-sm font-semibold text-foreground leading-relaxed pe-2">
                        {q.text || (isAr ? '(بدون نص سؤال)' : '(Empty question text)')}
                      </p>

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {options.map((opt, optIndex) => {
                          const isCorrect = q.correctOptionIndex === optIndex;
                          return (
                            <div
                              key={optIndex}
                              className={`flex items-center gap-2.5 rounded-squircle border p-2.5 text-xs transition-all ${
                                isCorrect
                                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-sm'
                                  : 'border-border/60 bg-background/50 text-foreground/80'
                              }`}
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                  isCorrect
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {isCorrect ? (
                                  <Check className="h-3 w-3 stroke-[3]" />
                                ) : (
                                  getOptionLetter(optIndex)
                                )}
                              </span>
                              <span className="flex-1 break-words">{opt}</span>
                              {isCorrect && (
                                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  {isAr ? 'الإجابة الصحيحة' : 'Correct'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanation if present */}
                      {q.explanation && (
                        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground/90">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="space-y-0.5">
                            <span className="font-bold text-primary block text-[11px]">
                              {isAr ? 'الشرح والتوضيح:' : 'Explanation:'}
                            </span>
                            <p className="text-muted-foreground text-[11px]">
                              {q.explanation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6 border-t border-border pt-4 flex items-center justify-end gap-2 rtl:sm:justify-start">
          {canEdit && onEdit && (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onEdit(quiz);
              }}
              className="gap-1.5 rounded-squircle bg-primary font-semibold text-white hover:bg-primary-hover text-xs"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>{isAr ? 'تعديل الاختبار' : 'Edit Quiz'}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="rounded-squircle text-xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
