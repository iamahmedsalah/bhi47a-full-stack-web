'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  HelpCircle,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  BookOpen,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Award,
  MoreVertical,
  Eye,
  Calendar,
  ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { PERMISSIONS } from '@student-portal/shared';
import { getApiErrorMessage } from '@/lib/api';
import api from '@/lib/api';

// UI Primitives
import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { DataTableShell, type ColumnDef } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

// Quiz API
import {
  listQuizzes,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizSubmissions,
  type QuizItem,
  type QuizQuestion,
  type QuizSubmission,
} from '@/features/quizzes/api';

/* ─── Question Builder Modal Component ─────────────────── */
interface QuizFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialValues?: Partial<QuizItem>;
  courses: Array<{ _id: string; code: string; name: string; nameAr?: string }>;
  coursesLoading?: boolean;
  isAr: boolean;
  onSuccess: () => void;
}

function toDateTimeLocal(isoString?: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function QuizFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues = {},
  courses,
  coursesLoading = false,
  isAr,
  onSuccess,
}: QuizFormDialogProps) {
  const [courseId, setCourseId] = useState(initialValues.courseId || '');
  const [title, setTitle] = useState(initialValues.title || '');
  const [description, setDescription] = useState(initialValues.description || '');
  const [durationMinutes, setDurationMinutes] = useState(initialValues.durationMinutes || 15);
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(initialValues.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(initialValues.endsAt));
  const [isPublished, setIsPublished] = useState(initialValues.isPublished ?? true);
  const [allowReview, setAllowReview] = useState(initialValues.allowReview ?? true);

  const [questions, setQuestions] = useState<QuizQuestion[]>(
    initialValues.questions && initialValues.questions.length > 0
      ? initialValues.questions
      : [
          {
            id: 'q1',
            text: '',
            type: 'mcq',
            options: ['', '', '', ''],
            correctOptionIndex: 0,
            points: 1,
          },
        ],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset or initialize on open
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCourseId(initialValues.courseId || '');
      setTitle(initialValues.title || '');
      setDescription(initialValues.description || '');
      setDurationMinutes(initialValues.durationMinutes || 15);
      setStartsAt(toDateTimeLocal(initialValues.startsAt));
      setEndsAt(toDateTimeLocal(initialValues.endsAt));
      setIsPublished(initialValues.isPublished ?? true);
      setAllowReview(initialValues.allowReview ?? true);
      setQuestions(
        initialValues.questions && initialValues.questions.length > 0
          ? initialValues.questions
          : [
              {
                id: 'q1',
                text: '',
                type: 'mcq',
                options: ['', '', '', ''],
                correctOptionIndex: 0,
                points: 1,
              },
            ],
      );
      setError('');
    }
  }

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q${prev.length + 1}_${Date.now()}`,
        text: '',
        type: 'mcq',
        options: ['', '', '', ''],
        correctOptionIndex: 0,
        points: 1,
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      toast.error(isAr ? 'يجب أن يحتوي الاختبار على سؤال واحد على الأقل' : 'Quiz must have at least one question');
      return;
    }
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleQuestionChange = (index: number, updates: Partial<QuizQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, ...updates } : q)),
    );
  };

  const handleOptionChange = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        const newOptions = [...q.options];
        newOptions[optIndex] = value;
        return { ...q, options: newOptions };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!courseId) {
      setError(isAr ? 'برجاء اختيار المقرر الدراسي' : 'Please select a course');
      return;
    }
    if (!title.trim()) {
      setError(isAr ? 'برجاء إدخال عنوان الاختبار' : 'Please enter quiz title');
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        setError(isAr ? `السؤال رقم ${i + 1} لا يحتوي على نص` : `Question ${i + 1} has no text`);
        return;
      }
      if (q.type === 'mcq') {
        const filled = q.options.filter((o) => o.trim() !== '');
        if (filled.length < 2) {
          setError(
            isAr
              ? `السؤال رقم ${i + 1} يجب أن يحتوي على خيارين على الأقل`
              : `Question ${i + 1} must have at least 2 choices`,
          );
          return;
        }
      }
    }

    if (startsAt && endsAt) {
      if (new Date(endsAt) <= new Date(startsAt)) {
        setError(
          isAr
            ? 'موعد إغلاق الاختبار يجب أن يكون بعد موعد فتحه'
            : 'Quiz close time must be after open time',
        );
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        courseId,
        title,
        description,
        durationMinutes: Number(durationMinutes),
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        isPublished,
        allowReview,
        questions,
      };

      if (mode === 'add') {
        await createQuiz(payload);
        toast.success(isAr ? 'تم إنشاء الاختبار بنجاح' : 'Quiz created successfully');
      } else if (initialValues._id) {
        await updateQuiz(initialValues._id, payload);
        toast.success(isAr ? 'تم تحديث الاختبار بنجاح' : 'Quiz updated successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, isAr ? 'حدث خطأ أثناء الحفظ' : 'Failed to save quiz'));
    } finally {
      setLoading(false);
    }
  };

  const totalPoints = useMemo(
    () => questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0),
    [questions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 p-6">
        <DialogHeader className="border-b border-border/80 pb-4 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>{mode === 'add' ? (isAr ? 'إنشاء اختبار جديد' : 'Create New Quiz') : (isAr ? 'تعديل الاختبار' : 'Edit Quiz')}</span>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-squircle border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 pt-3">
          {/* Top Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {isAr ? 'المقرر الدراسي *' : 'Course *'}
              </label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="bg-secondary/50 border-border rounded-squircle">
                  <SelectValue
                    placeholder={
                      coursesLoading
                        ? isAr
                          ? 'جاري تحميل المقررات...'
                          : 'Loading courses...'
                        : isAr
                          ? 'اختر المقرر...'
                          : 'Select course...'
                    }
                  />
                </SelectTrigger>
                <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                  {courses.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {coursesLoading
                        ? isAr
                          ? 'جاري التحميل...'
                          : 'Loading...'
                        : isAr
                          ? 'لا توجد مقررات متاحة'
                          : 'No courses available'}
                    </SelectItem>
                  ) : (
                    courses.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.code} - {isAr ? c.nameAr || c.name : c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {isAr ? 'مدة الاختبار (بالدقائق) *' : 'Duration (minutes) *'}
              </label>
              <Input
                type="number"
                min={1}
                max={180}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="rounded-squircle font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {isAr ? 'عنوان الاختبار *' : 'Quiz Title *'}
            </label>
            <Input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isAr ? 'مثال: كويز الأسبوع الرابع - التراكيب البيانية' : 'e.g. Week 4 Quiz'}
              className="rounded-squircle"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {isAr ? 'وصف أو تعليمات الاختبار (اختياري)' : 'Description / Instructions (Optional)'}
            </label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isAr ? 'تعليمات وإرشادات الاختبار للطلاب...' : 'Quiz instructions for students...'}
              className="rounded-squircle text-sm"
            />
          </div>

          {/* Schedule Window (Open and Close Times) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border/70 bg-background/50 p-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{isAr ? 'موعد فتح الاختبار (اختياري)' : 'Quiz Open Time (Optional)'}</span>
              </label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded-squircle font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {isAr ? 'الوقت الذي سيصبح فيه الاختبار متاحاً للطلاب' : 'When the quiz becomes available to students'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-danger" />
                <span>{isAr ? 'موعد إغلاق الاختبار (اختياري)' : 'Quiz Close Time (Optional)'}</span>
              </label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded-squircle font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {isAr ? 'الموعد النهائي الذي لن يتمكن الطلاب بعده من تقديم الاختبار' : 'Deadline after which students cannot submit the quiz'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border/70 bg-background/50 p-3.5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded-full border-input-border text-primary focus:ring-primary"
              />
              <span>{isAr ? 'نشر الاختبار فوراً للطلاب' : 'Publish Quiz for Students'}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={allowReview}
                onChange={(e) => setAllowReview(e.target.checked)}
                className="h-4 w-4 rounded-full border-input-border text-primary focus:ring-primary"
              />
              <span>{isAr ? 'إتاحة مراجعة الإجابات بعد التسليم' : 'Allow Review after Submission'}</span>
            </label>

            <div className="ms-auto flex items-center gap-2 text-xs font-bold text-primary">
              <span>{isAr ? 'إجمالي الدرجات:' : 'Total Marks:'}</span>
              <span className="font-mono text-sm">{totalPoints}</span>
            </div>
          </div>

          {/* Questions Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-primary" />
                <span>{isAr ? `أسئلة الاختبار (${questions.length})` : `Questions (${questions.length})`}</span>
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddQuestion}
                className="rounded-squircle flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? 'إضافة سؤال جديد' : 'Add Question'}</span>
              </Button>
            </div>

            <div className="space-y-4 max-h-[45vh] overflow-y-auto pe-1">
              {questions.map((q, qIndex) => (
                <div
                  key={q.id || qIndex}
                  className="rounded-xl border border-border/80 bg-secondary/30 p-4 space-y-3 relative group text-start"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                        {qIndex + 1}
                      </span>
                      <Select
                        value={q.type}
                        onValueChange={(val: string) => {
                          const qType = val as 'mcq' | 'true_false';
                          const newOptions =
                            qType === 'true_false'
                              ? [isAr ? 'صواب' : 'True', isAr ? 'خطأ' : 'False']
                              : ['', '', '', ''];
                          handleQuestionChange(qIndex, {
                            type: qType,
                            options: newOptions,
                            correctOptionIndex: 0,
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 w-32 bg-background/80 text-xs rounded-squircle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
                          <SelectItem value="mcq">{isAr ? 'اختيار من متعدد' : 'Multiple Choice'}</SelectItem>
                          <SelectItem value="true_false">{isAr ? 'صح أو خطأ' : 'True / False'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{isAr ? 'الدرجة:' : 'Points:'}</span>
                        <Input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={q.points}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, {
                              points: Number(e.target.value) || 1,
                            })
                          }
                          className="h-7 w-16 text-center font-mono rounded-squircle text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQuestion(qIndex)}
                        className="h-7 w-7 p-0 text-danger hover:bg-danger/10 hover:text-danger rounded-squircle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <Input
                    type="text"
                    required
                    value={q.text}
                    onChange={(e) =>
                      handleQuestionChange(qIndex, { text: e.target.value })
                    }
                    placeholder={isAr ? `نص السؤال ${qIndex + 1}...` : `Question ${qIndex + 1} text...`}
                    className="rounded-squircle bg-background/60 text-sm"
                  />

                  {/* Options */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {isAr
                        ? 'الخيارات (حدد الدائرة أمام الإجابة الصحيحة):'
                        : 'Options (check radio for correct answer):'}
                    </p>
                    {q.type === 'mcq' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, optIndex) => (
                          <div
                            key={optIndex}
                            className="flex items-center gap-2 rounded-squircle border border-border/60 bg-background/50 px-2.5 py-1.5"
                          >
                            <input
                              type="radio"
                              name={`correct_${qIndex}`}
                              checked={q.correctOptionIndex === optIndex}
                              onChange={() =>
                                handleQuestionChange(qIndex, {
                                  correctOptionIndex: optIndex,
                                })
                              }
                              className="h-4 w-4 text-primary focus:ring-primary cursor-pointer"
                            />
                            <Input
                              type="text"
                              value={opt}
                              onChange={(e) =>
                                handleOptionChange(qIndex, optIndex, e.target.value)
                              }
                              placeholder={`${isAr ? 'خيار' : 'Option'} ${optIndex + 1}`}
                              className="h-7 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-4">
                        {q.options.map((opt, optIndex) => (
                          <label
                            key={optIndex}
                            className="flex items-center gap-2 rounded-squircle border border-border/60 bg-background/50 px-3 py-1.5 cursor-pointer text-xs"
                          >
                            <input
                              type="radio"
                              name={`correct_${qIndex}`}
                              checked={q.correctOptionIndex === optIndex}
                              onChange={() =>
                                handleQuestionChange(qIndex, {
                                  correctOptionIndex: optIndex,
                                })
                              }
                              className="h-4 w-4 text-primary focus:ring-primary"
                            />
                            <span className="font-semibold">{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2 border-t border-border pt-4">
            <Button
              variant="secondary"
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-squircle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAr ? 'حفظ الاختبار' : 'Save Quiz'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Submissions Modal Component ──────────────────────── */
interface SubmissionsModalProps {
  quiz: QuizItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
}

function SubmissionsModal({ quiz, open, onOpenChange, isAr }: SubmissionsModalProps) {
  const [search, setSearch] = useState('');

  const submissionsQuery = useQuery({
    queryKey: ['quiz-submissions', quiz?._id],
    queryFn: () => getQuizSubmissions(quiz!._id),
    enabled: Boolean(quiz?._id && open),
  });

  const filtered = useMemo(() => {
    const list = submissionsQuery.data || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (s) =>
        s.studentCode.toLowerCase().includes(q) ||
        s.studentName.toLowerCase().includes(q),
    );
  }, [submissionsQuery.data, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 p-6">
        <DialogHeader className="border-b border-border/80 pb-3 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Users className="h-5 w-5 text-primary" />
            <span>
              {isAr ? 'نتائج وتسليمات الطلاب:' : 'Student Submissions:'}{' '}
              <span className="text-primary">{quiz?.title}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-3">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بكود أو اسم الطالب...' : 'Search student code or name...'}
            className="rounded-squircle text-xs"
          />

          {submissionsQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-secondary/20 p-8 text-center text-muted-foreground text-sm">
              {isAr ? 'لا توجد تسليمات مسجلة بعد' : 'No submissions found yet'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/80">
              <table className="w-full text-xs text-start">
                <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'كود الطالب' : 'Student Code'}</th>
                    <th className="p-3 text-start">{isAr ? 'اسم الطالب' : 'Student Name'}</th>
                    <th className="p-3 text-center">{isAr ? 'الدرجة' : 'Score'}</th>
                    <th className="p-3 text-center">{isAr ? 'النسبة' : 'Percentage'}</th>
                    <th className="p-3 text-end">{isAr ? 'وقت التسليم' : 'Submitted At'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((sub) => (
                    <tr key={sub._id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-mono font-bold text-foreground">
                        {sub.studentCode}
                      </td>
                      <td className="p-3 font-medium text-foreground">
                        {sub.studentName}
                      </td>
                      <td className="p-3 text-center font-bold">
                        <span className="text-primary">{sub.score}</span> / {sub.totalMarks}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            sub.isPassed
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {sub.percentage}%
                        </span>
                      </td>
                      <td className="p-3 text-end text-muted-foreground font-mono text-[11px]">
                        {new Date(sub.submittedAt).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Admin Quizzes Page ──────────────────────────── */
function AdminQuizzesContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'ar';
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<QuizItem | null>(null);
  const [submissionsQuiz, setSubmissionsQuiz] = useState<QuizItem | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState<QuizItem | null>(null);

  // Fetch quizzes
  const quizzesQuery = useQuery({
    queryKey: ['admin-quizzes', page, search, courseFilter],
    queryFn: () =>
      listQuizzes({
        page,
        limit: 15,
        search: search || undefined,
        courseId: courseFilter !== 'ALL' ? courseFilter : undefined,
      }),
  });

  // Fetch courses list for selectors
  const coursesQuery = useQuery({
    queryKey: ['active-courses-list'],
    queryFn: async () => {
      try {
        const res = await api.get<unknown>('/admin/courses', {
          params: { page: 1, limit: 200 },
        });
        const payload = (res as { data?: unknown })?.data ?? res;
        const items = Array.isArray((payload as { items?: unknown[] })?.items)
          ? (payload as { items: Array<{ _id: string; code: string; name: string; nameAr?: string }> }).items
          : Array.isArray(payload)
            ? (payload as Array<{ _id: string; code: string; name: string; nameAr?: string }>)
            : [];
        if (items.length > 0) return items;
      } catch {
        // Fallback below
      }

      try {
        const res2 = await api.get<unknown>('/courses', {
          params: { page: 1, limit: 200 },
        });
        const payload2 = (res2 as { data?: unknown })?.data ?? res2;
        return Array.isArray((payload2 as { items?: unknown[] })?.items)
          ? (payload2 as { items: Array<{ _id: string; code: string; name: string; nameAr?: string }> }).items
          : Array.isArray(payload2)
            ? (payload2 as Array<{ _id: string; code: string; name: string; nameAr?: string }>)
            : [];
      } catch {
        return [];
      }
    },
  });

  const coursesList = coursesQuery.data || [];

  const handleDelete = async () => {
    if (!quizToDelete) return;
    try {
      await deleteQuiz(quizToDelete._id);
      toast.success(isAr ? 'تم حذف الاختبار بنجاح' : 'Quiz deleted successfully');
      setIsDeleteOpen(false);
      setQuizToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-quizzes'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleTogglePublish = async (quiz: QuizItem) => {
    try {
      await updateQuiz(quiz._id, { isPublished: !quiz.isPublished });
      toast.success(
        quiz.isPublished
          ? isAr ? 'تم إيقاف نشر الاختبار' : 'Quiz unpublished'
          : isAr ? 'تم نشر الاختبار للطلاب' : 'Quiz published',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-quizzes'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const columns: ColumnDef<QuizItem>[] = [
    {
      key: 'course',
      header: isAr ? 'المقرر الدراسي' : 'Course',
      render: (quiz) => (
        <TableCell className="p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-squircle">
              {quiz.courseCode}
            </span>
            <span className="font-medium text-foreground text-xs">
              {quiz.courseName}
            </span>
          </div>
        </TableCell>
      ),
    },
    {
      key: 'title',
      header: isAr ? 'عنوان الاختبار' : 'Quiz Title',
      render: (quiz) => (
        <TableCell className="p-4 text-start">
          <p className="font-bold text-foreground text-sm">{quiz.title}</p>
          {quiz.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{quiz.description}</p>
          )}
        </TableCell>
      ),
    },
    {
      key: 'duration',
      header: isAr ? 'المدة' : 'Duration',
      render: (quiz) => (
        <TableCell className="p-4 text-center">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{quiz.durationMinutes} {isAr ? 'د' : 'm'}</span>
          </span>
        </TableCell>
      ),
    },
    {
      key: 'schedule',
      header: isAr ? 'المواعيد' : 'Schedule',
      render: (quiz) => (
        <TableCell className="p-4 text-start">
          {quiz.startsAt || quiz.endsAt ? (
            <div className="space-y-0.5 text-[11px] font-mono">
              {quiz.startsAt && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="text-[10px] font-bold text-primary">{isAr ? 'فتح:' : 'Open:'}</span>
                  <span>
                    {new Date(quiz.startsAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              {quiz.endsAt && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="text-[10px] font-bold text-rose-400">{isAr ? 'إغلاق:' : 'Close:'}</span>
                  <span>
                    {new Date(quiz.endsAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/60 text-xs italic">
              {isAr ? 'متاح دائماً' : 'Always open'}
            </span>
          )}
        </TableCell>
      ),
    },
    {
      key: 'marks',
      header: isAr ? 'الدرجة' : 'Marks',
      render: (quiz) => (
        <TableCell className="p-4 text-center">
          <span className="font-bold text-foreground font-mono text-xs">
            {quiz.totalMarks}
          </span>
        </TableCell>
      ),
    },
    {
      key: 'submissions',
      header: isAr ? 'التسليمات' : 'Submissions',
      render: (quiz) => (
        <TableCell className="p-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSubmissionsQuiz(quiz)}
            className="h-7 rounded-squircle text-xs font-semibold text-primary hover:bg-primary/10 gap-1"
          >
            <Users className="h-3.5 w-3.5" />
            <span>{quiz.submissionsCount || 0}</span>
          </Button>
        </TableCell>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (quiz) => (
        <TableCell className="p-4 text-center">
          <StatusBadge
            label={quiz.isPublished ? (isAr ? 'منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
            variant={quiz.isPublished ? 'success' : 'neutral'}
            onClick={() => handleTogglePublish(quiz)}
          />
        </TableCell>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (quiz) => (
        <TableCell className="p-4 text-end">
          <DropdownMenu.Root dir={isAr ? 'rtl' : 'ltr'}>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-squircle">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-48 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95"
              >
                <DropdownMenu.Item
                  onClick={() => setSubmissionsQuiz(quiz)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'عرض نتائج وتسليمات الطلاب' : 'View Submissions'}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => {
                    setSelectedQuiz(quiz);
                    setIsEditOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{isAr ? 'تعديل الاختبار' : 'Edit Quiz'}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => handleTogglePublish(quiz)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-secondary/60 transition-colors"
                >
                  {quiz.isPublished ? (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-amber-400" />
                      <span>{isAr ? 'تحويل إلى مسودة' : 'Unpublish'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{isAr ? 'نشر للطلاب' : 'Publish'}</span>
                    </>
                  )}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => {
                    setQuizToDelete(quiz);
                    setIsDeleteOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none text-danger hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'حذف الاختبار' : 'Delete Quiz'}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </TableCell>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <PageTitleBanner
        title={isAr ? 'إدارة الاختبارات الإلكترونية (الكويزات)' : 'Course Quizzes Management'}
        subtitle={
          isAr
            ? 'إنشاء وإدارة الاختبارات القصيرة والتكليفات الإلكترونية للمقررات الدراسية ومتابعة تصحيح درجات الطلاب تلقائياً.'
            : 'Create and manage course quizzes, assignments, and inspect auto-graded student submissions.'
        }
        icon={<HelpCircle className="h-6 w-6 text-primary" />}
      >
        <Button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? 'إنشاء كويز جديد' : 'Create Quiz'}</span>
        </Button>
      </PageTitleBanner>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isAr ? 'بحث بعنوان الاختبار أو كود المقرر...' : 'Search by quiz title or course code...'}
      >
        <div className="flex items-center gap-2">
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="h-9 w-44 rounded-squircle bg-secondary/50 border-border text-xs">
              <SelectValue placeholder={isAr ? 'تصفية بالمقرر...' : 'Filter by course...'} />
            </SelectTrigger>
            <SelectContent dir={isAr ? 'rtl' : 'ltr'}>
              <SelectItem value="ALL">{isAr ? 'جميع المقررات' : 'All Courses'}</SelectItem>
              {coursesList.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.code} - {isAr ? c.nameAr || c.name : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {/* Quizzes Data Table */}
      <DataTableShell<QuizItem>
        columns={columns}
        data={quizzesQuery.data?.items || []}
        keyExtractor={(quiz) => quiz._id}
        isLoading={quizzesQuery.isLoading}
        emptyMessage={
          isAr
            ? 'لم يتم إنشاء أي كويزات للمقررات بعد. يمكنك إنشاء كويز جديد بالضغط على الزر أعلاه.'
            : 'No course quizzes created yet. Start by clicking Create Quiz above.'
        }
      />

      {/* Create / Edit Dialog */}
      <QuizFormDialog
        open={isAddOpen || isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddOpen(false);
            setIsEditOpen(false);
            setSelectedQuiz(null);
          }
        }}
        mode={isAddOpen ? 'add' : 'edit'}
        initialValues={selectedQuiz || {}}
        courses={coursesList}
        coursesLoading={coursesQuery.isLoading}
        isAr={isAr}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin-quizzes'] });
        }}
      />

      {/* Submissions Modal */}
      <SubmissionsModal
        quiz={submissionsQuiz}
        open={Boolean(submissionsQuiz)}
        onOpenChange={(open) => {
          if (!open) setSubmissionsQuiz(null);
        }}
        isAr={isAr}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={isAr ? 'حذف الاختبار' : 'Delete Quiz'}
        description={
          isAr
            ? `هل أنت متأكد من حذف الاختبار "${quizToDelete?.title}"؟ سيتم حذف جميع إجابات وتسليمات الطلاب المرتبطة به نهائياً.`
            : `Are you sure you want to delete "${quizToDelete?.title}"? All student attempts will be deleted permanently.`
        }
        confirmLabel={isAr ? 'تأكيد الحذف' : 'Confirm Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function AdminQuizzesPage() {
  return (
    <PermissionGuard permission={PERMISSIONS.QUIZZES_READ}>
      <Suspense fallback={<PageSkeletonLoader />}>
        <AdminQuizzesContent />
      </Suspense>
    </PermissionGuard>
  );
}
