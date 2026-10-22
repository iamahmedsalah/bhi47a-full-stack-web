'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import {
  HelpCircle,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Eye,
  Calendar,
  ListChecks,
  Upload,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
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
import { DateTimePicker } from '@/components/ui/date-time-picker';
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
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizSubmissions,
  exportQuizAnalysis,
  parseQuestionsExcel,
  downloadQuestionsTemplate,
  type QuizItem,
  type QuizQuestion,
} from '@/features/quizzes/api';
import { QuizPreviewModal } from '@/features/quizzes/components/quiz-preview-modal';

/* ─── Question Builder Modal Component ─────────────────── */
interface QuizFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialValues?: Partial<QuizItem>;
  courses: Array<{ _id: string; code: string; name: string; nameAr?: string }>;
  coursesLoading?: boolean;
  isAr: boolean;
  onSuccess: (savedQuiz?: QuizItem) => void;
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
  const locale = isAr ? 'ar' : 'en';
  const { user } = useAuth();
  const draftStorageKey = useMemo(
    () => `portal_quiz_creator_draft_${user?._id || 'general'}`,
    [user?._id],
  );

  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSavedNotice, setDraftSavedNotice] = useState<string | null>(null);

  const [courseId, setCourseId] = useState(initialValues.courseId || '');
  const [title, setTitle] = useState(initialValues.title || '');
  const [description, setDescription] = useState(initialValues.description || '');
  const [durationMinutes, setDurationMinutes] = useState(initialValues.durationMinutes || 15);
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(initialValues.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(initialValues.endsAt));
  const [isPublished, setIsPublished] = useState(initialValues.isPublished ?? true);
  const [allowReview, setAllowReview] = useState(initialValues.allowReview ?? true);
  const [allowResume, setAllowResume] = useState(initialValues.allowResume ?? true);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [excelErrors, setExcelErrors] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
  const [nowTime] = useState(() => Date.now());

  // Reset or initialize on open and sync whenever initialValues updates
  React.useEffect(() => {
    if (!open) return;

    setCourseId(initialValues.courseId || '');
    setTitle(initialValues.title || '');
    setDescription(initialValues.description || '');
    setDurationMinutes(initialValues.durationMinutes || 15);
    setStartsAt(toDateTimeLocal(initialValues.startsAt));
    setEndsAt(toDateTimeLocal(initialValues.endsAt));
    setIsPublished(initialValues.isPublished ?? true);
    setAllowReview(initialValues.allowReview ?? true);
    setAllowResume(initialValues.allowResume ?? true);
    setUploadingExcel(false);
    setExcelErrors([]);
    setError('');

    if (initialValues.questions && initialValues.questions.length > 0) {
      setQuestions(
        initialValues.questions.map((q, idx) => ({
          id: q.id || `q_${idx + 1}_${Date.now()}`,
          text: q.text || '',
          type: (q.type as 'mcq' | 'true_false') || 'mcq',
          options:
            Array.isArray(q.options) && q.options.length > 0
              ? q.options
              : q.type === 'true_false'
                ? [isAr ? 'صواب' : 'True', isAr ? 'خطأ' : 'False']
                : ['', '', '', ''],
          correctOptionIndex:
            typeof q.correctOptionIndex === 'number'
              ? q.correctOptionIndex
              : 0,
          points: typeof q.points === 'number' ? q.points : 1,
          explanation: q.explanation || '',
        })),
      );
    } else {
      setQuestions([
        {
          id: 'q1',
          text: '',
          type: 'mcq',
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          points: 1,
        },
      ]);
    }
  }, [open, initialValues, isAr]);

  // Check if saved draft exists when opening in 'add' mode
  React.useEffect(() => {
    if (!open || mode !== 'add') {
      setHasDraft(false);
      setDraftSavedNotice(null);
      return;
    }
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const hasContent =
          Boolean(parsed.title?.trim()) ||
          Boolean(parsed.courseId) ||
          (Array.isArray(parsed.questions) &&
            parsed.questions.some((q: any) => q.text?.trim()));
        if (hasContent) {
          setHasDraft(true);
          setDraftSavedAt(parsed.savedAt || null);
        }
      }
    } catch {
      // Ignore
    }
  }, [open, mode, draftStorageKey]);

  // Debounced auto-save effect for 'add' mode
  React.useEffect(() => {
    if (!open || mode !== 'add') return;

    const hasContent =
      Boolean(courseId) ||
      Boolean(title.trim()) ||
      Boolean(description.trim()) ||
      questions.some(
        (q) =>
          q.text.trim() || (q.options && q.options.some((o) => o.trim())),
      );

    if (!hasContent) return;

    const timer = setTimeout(() => {
      try {
        const draft = {
          courseId,
          title,
          description,
          durationMinutes,
          startsAt,
          endsAt,
          isPublished,
          allowReview,
          allowResume,
          questions,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        const timeStr = new Date().toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setDraftSavedNotice(
          isAr ? `مسودة محفوظة (${timeStr})` : `Draft saved (${timeStr})`,
        );
      } catch {
        // LocalStorage quota or access error - ignore gracefully
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    open,
    mode,
    courseId,
    title,
    description,
    durationMinutes,
    startsAt,
    endsAt,
    isPublished,
    allowReview,
    allowResume,
    questions,
    draftStorageKey,
    isAr,
  ]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.courseId) setCourseId(parsed.courseId);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.durationMinutes) setDurationMinutes(parsed.durationMinutes);
      if (parsed.startsAt) setStartsAt(parsed.startsAt);
      if (parsed.endsAt) setEndsAt(parsed.endsAt);
      if (typeof parsed.isPublished === 'boolean') setIsPublished(parsed.isPublished);
      if (typeof parsed.allowReview === 'boolean') setAllowReview(parsed.allowReview);
      if (typeof parsed.allowResume === 'boolean') setAllowResume(parsed.allowResume);
      if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        setQuestions(parsed.questions);
      }
      setHasDraft(false);
      toast.success(isAr ? 'تمت استعادة مسودة الاختبار بنجاح' : 'Quiz draft restored successfully');
    } catch {
      toast.error(isAr ? 'فشل استعادة المسودة' : 'Failed to restore draft');
    }
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
      setHasDraft(false);
      setDraftSavedNotice(null);
      toast.info(isAr ? 'تم حذف المسودة المحفوظة' : 'Draft discarded');
    } catch {
      // Ignore
    }
  };

  const handleDownloadTemplate = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    try {
      await downloadQuestionsTemplate(format);
      toast.success(
        isAr
          ? `تم تحميل نموذج الأسئلة (${format === 'csv' ? 'CSV' : 'Excel'}) بنجاح`
          : `Downloaded ${format.toUpperCase()} questions template successfully`,
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تحميل القالب' : 'Failed to download template',
        ),
      );
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingExcel(true);
    setExcelErrors([]);
    try {
      const res = await parseQuestionsExcel(file);
      if (res.questions.length > 0) {
        setQuestions((prev) => {
          if (prev.length === 1 && !prev[0].text.trim()) {
            return res.questions;
          }
          return [...prev, ...res.questions];
        });
        toast.success(
          isAr
            ? `تم استيراد ${res.questions.length} سؤال بنجاح من الملف`
            : `Imported ${res.questions.length} questions successfully`,
        );
      }
      if (res.errors && res.errors.length > 0) {
        setExcelErrors(res.errors);
        toast.warning(
          isAr
            ? `يوجد ${res.errors.length} أخطاء في تنسيق بعض الصفوف`
            : `${res.errors.length} rows had formatting errors`,
        );
      }
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل معالجة ملف الأسئلة' : 'Failed to parse questions file',
        ),
      );
    } finally {
      setUploadingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      prev.map((q, idx) => {
        if (idx !== index) return q;
        const merged = { ...q, ...updates };
        if (updates.type === 'true_false' && (!merged.options || merged.options.length < 2)) {
          merged.options = [isAr ? 'صح' : 'True', isAr ? 'خطأ' : 'False'];
        } else if (updates.type === 'mcq' && (!merged.options || merged.options.length === 0)) {
          merged.options = ['', '', '', ''];
        }
        return merged;
      }),
    );
  };

  const handleOptionChange = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        const newOptions = [...(q.options || ['', '', '', ''])];
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
        const opts = q.options || [];
        const filled = opts.filter((o) => o && o.trim() !== '');
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

    if (scheduleValidationError) {
      setError(scheduleValidationError);
      toast.error(scheduleValidationError);
      return;
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
        allowResume,
        questions,
      };

      let savedResult: QuizItem | undefined = undefined;
      if (mode === 'add') {
        savedResult = await createQuiz(payload);
        try {
          localStorage.removeItem(draftStorageKey);
          setDraftSavedNotice(null);
          setHasDraft(false);
        } catch {
          // Ignore
        }
        toast.success(isAr ? 'تم إنشاء الاختبار بنجاح' : 'Quiz created successfully');
      } else if (initialValues._id) {
        savedResult = await updateQuiz(initialValues._id, payload);
        toast.success(isAr ? 'تم تحديث الاختبار بنجاح' : 'Quiz updated successfully');
      }

      onSuccess(savedResult);
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, isAr ? 'حدث خطأ أثناء الحفظ' : 'Failed to save quiz'));
    } finally {
      setLoading(false);
    }
  };

  const scheduleValidationError = useMemo(() => {
    const isNew = mode === 'add';

    // 1. Check startsAt
    if (startsAt) {
      const s = new Date(startsAt);
      if (isNaN(s.getTime())) {
        return isAr
          ? 'صيغة موعد فتح الاختبار غير صالحة'
          : 'Invalid quiz open time format';
      }
      const startsChanged = isNew || startsAt !== initialValues.startsAt;
      if (startsChanged && s.getTime() < nowTime - 5 * 60 * 1000) {
        return isAr
          ? 'لا يمكن تحديد موعد فتح الاختبار في وقت سابق لتاريخ ولحظة الآن'
          : 'Quiz open time cannot be in the past';
      }
    }

    // 2. Check endsAt
    if (endsAt) {
      const e = new Date(endsAt);
      if (isNaN(e.getTime())) {
        return isAr
          ? 'صيغة موعد إغلاق الاختبار غير صالحة'
          : 'Invalid quiz close time format';
      }
      const endsChanged = isNew || endsAt !== initialValues.endsAt;
      if (endsChanged && e.getTime() < nowTime) {
        return isAr
          ? 'لا يمكن تحديد موعد إغلاق الاختبار في وقت سابق لتاريخ ولحظة الآن'
          : 'Quiz close time cannot be in the past';
      }
    }

    // 3. Both startsAt and endsAt provided
    if (startsAt && endsAt) {
      const s = new Date(startsAt);
      const e = new Date(endsAt);
      if (e <= s) {
        return isAr
          ? 'موعد إغلاق الاختبار يجب أن يكون بعد موعد فتحه'
          : 'Quiz close time must be strictly after open time';
      }
      const windowMin = (e.getTime() - s.getTime()) / (60 * 1000);
      if (windowMin < Number(durationMinutes || 0)) {
        return isAr
          ? `نافذة إتاحة الاختبار (${Math.round(windowMin)} دقيقة) أقل من مدة الاختبار (${durationMinutes} دقيقة). يرجى توسيع نافذة الاختبار.`
          : `Quiz window (${Math.round(windowMin)}m) is shorter than quiz duration (${durationMinutes}m). Please expand window.`;
      }
    }

    // 4. Only endsAt provided without startsAt
    if (!startsAt && endsAt) {
      const e = new Date(endsAt);
      const remainingMin = (e.getTime() - nowTime) / (60 * 1000);
      if (remainingMin < Number(durationMinutes || 0)) {
        return isAr
          ? `الوقت المتبقي حتى إغلاق الاختبار (${Math.max(0, Math.round(remainingMin))} دقيقة) أقل من مدة الاختبار (${durationMinutes} دقيقة).`
          : `Remaining time until deadline is shorter than quiz duration (${durationMinutes}m).`;
      }
    }

    return null;
  }, [startsAt, endsAt, durationMinutes, mode, initialValues.startsAt, initialValues.endsAt, isAr]);

  const scheduleWindowSummary = useMemo(() => {
    if (!startsAt || !endsAt || scheduleValidationError) return null;
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
    const windowMin = Math.round((e.getTime() - s.getTime()) / (60 * 1000));
    const hours = Math.floor(windowMin / 60);
    const mins = windowMin % 60;
    if (hours > 0) {
      return isAr ? `${hours} ساعة و ${mins} دقيقة` : `${hours}h ${mins}m`;
    }
    return isAr ? `${mins} دقيقة` : `${mins} mins`;
  }, [startsAt, endsAt, scheduleValidationError, isAr]);

  const totalPoints = useMemo(
    () => questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0),
    [questions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 p-6">
        <DialogHeader className="border-b border-border/80 pb-4 text-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <HelpCircle className="h-5 w-5 text-primary" />
              <span>{mode === 'add' ? (isAr ? 'إنشاء اختبار جديد' : 'Create New Quiz') : (isAr ? 'تعديل الاختبار' : 'Edit Quiz')}</span>
            </DialogTitle>
            {mode === 'add' && draftSavedNotice && (
              <span className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
                <span>{draftSavedNotice}</span>
              </span>
            )}
          </div>
        </DialogHeader>

        {hasDraft && mode === 'add' && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-foreground font-medium">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <span>
                {isAr
                  ? `توجد مسودة اختبار غير مكتملة محفوظة تلقائياً ${draftSavedAt ? `(${new Date(draftSavedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})` : ''}. هل تود استعادتها؟`
                  : `An auto-saved quiz draft is available ${draftSavedAt ? `(${new Date(draftSavedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})` : ''}. Restore it?`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/20 rounded-squircle"
                onClick={handleRestoreDraft}
              >
                {isAr ? 'استعادة المسودة' : 'Restore Draft'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-danger rounded-squircle"
                onClick={handleDiscardDraft}
              >
                {isAr ? 'حذف' : 'Discard'}
              </Button>
            </div>
          </div>
        )}

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

          {/* Schedule Window (Open and Close Times) with Radix DateTimePicker */}
          <div className="space-y-2.5 rounded-xl border border-border/70 bg-background/50 p-3.5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span>{isAr ? 'موعد فتح الاختبار (اختياري)' : 'Quiz Open Time (Optional)'}</span>
                  </span>
                  {startsAt && (
                    <button
                      type="button"
                      onClick={() => setStartsAt('')}
                      className="text-[10px] text-muted-foreground hover:text-rose-400 cursor-pointer"
                    >
                      {isAr ? 'مسح' : 'Clear'}
                    </button>
                  )}
                </label>
                <DateTimePicker
                  value={startsAt}
                  onChange={setStartsAt}
                  locale={locale}
                  minDate={mode === 'add' ? new Date() : undefined}
                  isError={Boolean(scheduleValidationError)}
                  placeholder={isAr ? 'اختر تاريخ ووقت الفتح...' : 'Select open date & time...'}
                />
                <p className="text-[10px] text-muted-foreground">
                  {isAr ? 'الوقت الذي سيصبح فيه الاختبار متاحاً للطلاب' : 'When the quiz becomes available to students'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-danger" />
                    <span>{isAr ? 'موعد إغلاق الاختبار (اختياري)' : 'Quiz Close Time (Optional)'}</span>
                  </span>
                  {endsAt && (
                    <button
                      type="button"
                      onClick={() => setEndsAt('')}
                      className="text-[10px] text-muted-foreground hover:text-rose-400 cursor-pointer"
                    >
                      {isAr ? 'مسح' : 'Clear'}
                    </button>
                  )}
                </label>
                <DateTimePicker
                  value={endsAt}
                  onChange={setEndsAt}
                  locale={locale}
                  minDate={startsAt ? new Date(startsAt) : new Date()}
                  isError={Boolean(scheduleValidationError)}
                  placeholder={isAr ? 'اختر تاريخ ووقت الإغلاق...' : 'Select close date & time...'}
                />
                <p className="text-[10px] text-muted-foreground">
                  {isAr ? 'الموعد النهائي الذي لن يتمكن الطلاب بعده من تقديم الاختبار' : 'Deadline after which students cannot submit the quiz'}
                </p>
              </div>
            </div>

            {/* Validation Feedback Banner */}
            {scheduleValidationError ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{scheduleValidationError}</span>
              </div>
            ) : scheduleWindowSummary ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-xs text-emerald-300 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  {isAr
                    ? `نافذة إتاحة الاختبار: ${scheduleWindowSummary} (صالحة وتكفي مدة الاختبار ${durationMinutes} دقيقة)`
                    : `Availability Window: ${scheduleWindowSummary} (Valid, covers ${durationMinutes} mins duration)`}
                </span>
              </div>
            ) : null}
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

          {/* Anti-Cheat Session Control Toggle */}
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`h-4 w-4 shrink-0 ${allowResume ? 'text-teal-400' : 'text-amber-400'}`} />
                  <span className="text-xs font-bold text-foreground">
                    {isAr
                      ? 'سماح للطالب باستئناف الاختبار عند الانقطاع أو الخروج (Anti-Cheat / Resume)'
                      : 'Allow Student to Resume on Disconnect / Exit'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    allowResume
                      ? 'border-teal-500/30 bg-teal-500/10 text-teal-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}>
                    {allowResume
                      ? (isAr ? 'الوضع المرن (افتراضي)' : 'Flexible Resume (Default)')
                      : (isAr ? 'الوضع المشدد ضد الغش' : 'Strict Anti-Cheat')}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                  {allowResume
                    ? (isAr
                        ? 'الوضع المرن (موصى به): في حالة انقطاع الاتصال أو تحديث الصفحة أو الخروج المؤقت، يحتفظ النظام بإجابات الطالب ويستأنف العداد التنازلي من الوقت المتبقي المحسوب خادمياً دون حظر الطالب أو إنهاء محاولته.'
                        : 'Flexible Mode (Recommended): If disconnected, refreshed, or closed temporarily, answers are autosaved and countdown resumes from server-calculated time remaining without locking the student.')
                    : (isAr
                        ? 'الوضع المشدد (محاولة واحدة ضد الغش): يُمنع خروج الطالب أو تبديل التبويب أو تصغير النافذة؛ يؤدي الخروج فوراً إلى تسليم الإجابات وإنهاء المحاولة نهائياً.'
                        : 'Strict Anti-Cheat Mode: Single entry. Switching tabs, minimizing, or exiting immediately finalizes and locks the attempt.')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowResume}
                onClick={() => setAllowResume(!allowResume)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary ${
                  allowResume ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    allowResume ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bulk Excel / CSV Upload Area */}
          <div className="rounded-xl border border-border/80 bg-secondary/15 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-foreground">
                  {isAr ? 'الاستيراد السريع للأسئلة عبر Excel (.xlsx / .csv)' : 'Bulk Questions Import via Excel (.xlsx / .csv)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadTemplate('xlsx')}
                  className="h-7 text-[11px] rounded-squircle gap-1.5 border-border/80 hover:bg-secondary/60 cursor-pointer"
                  title={isAr ? 'تحميل نموذج الأسئلة بصيغة Excel' : 'Download Excel template (.xlsx)'}
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{isAr ? 'نموذج Excel (.xlsx)' : 'Excel Template (.xlsx)'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadTemplate('csv')}
                  className="h-7 text-[11px] rounded-squircle gap-1.5 border-border/80 hover:bg-secondary/60 cursor-pointer"
                  title={isAr ? 'تحميل نموذج الأسئلة بصيغة CSV' : 'Download CSV template (.csv)'}
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{isAr ? 'نموذج CSV (.csv)' : 'CSV Template (.csv)'}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={uploadingExcel}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 text-[11px] rounded-squircle gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                >
                  {uploadingExcel ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{isAr ? 'رفع ملف الأسئلة' : 'Upload Questions File'}</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>
            </div>
            {excelErrors.length > 0 && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger space-y-1 max-h-28 overflow-y-auto">
                <p className="font-bold flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>{isAr ? 'تنبيهات وتعارضات صفوف الملف:' : 'File Warnings / Errors:'}</span>
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {excelErrors.map((errStr, errIdx) => (
                    <li key={errIdx}>{errStr}</li>
                  ))}
                </ul>
              </div>
            )}
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
                        value={q.type || 'mcq'}
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
                          value={q.points ?? 1}
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
                    value={q.text || ''}
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
                        {(q.options || ['', '', '', '']).map((opt, optIndex) => (
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
                              value={opt || ''}
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
                        {(q.options && q.options.length > 0
                          ? q.options
                          : [isAr ? 'صح' : 'True', isAr ? 'خطأ' : 'False']
                        ).map((opt, optIndex) => (
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
              disabled={loading || Boolean(scheduleValidationError)}
              className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle disabled:opacity-50 cursor-pointer"
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

function SubmissionsModal({
  quiz,
  open,
  onOpenChange,
  isAr,
}: SubmissionsModalProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'roster'>('analytics');
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const submissionsQuery = useQuery({
    queryKey: ['quiz-submissions', quiz?._id],
    queryFn: () => getQuizSubmissions(quiz!._id),
    enabled: Boolean(quiz?._id && open),
  });

  const submissions = submissionsQuery.data || [];

  const total = submissions.length;
  const passed = submissions.filter((s) => s.isPassed).length;
  const failed = total - passed;
  const passPercentage = total > 0 ? Math.round((passed / total) * 100) : 0;
  const failPercentage = total > 0 ? 100 - passPercentage : 0;
  const scores = submissions.map((s) => s.score);
  const avgScore =
    total > 0
      ? (scores.reduce((a, b) => a + b, 0) / total).toFixed(1)
      : '0';
  const maxScore = total > 0 ? Math.max(...scores) : 0;
  const minScore = total > 0 ? Math.min(...scores) : 0;

  const pieData = [
    { name: isAr ? 'ناجح' : 'Passed', value: passed, color: '#10B981' },
    { name: isAr ? 'راسب' : 'Failed', value: failed, color: '#F43F5E' },
  ];

  const barData = [
    {
      tier: isAr ? 'ممتاز (85%+)' : 'Excellent (85%+)',
      count: submissions.filter((s) => s.percentage >= 85).length,
      fill: '#10B981',
    },
    {
      tier: isAr ? 'جيد جداً (75-84%)' : 'Very Good (75-84%)',
      count: submissions.filter(
        (s) => s.percentage >= 75 && s.percentage < 85,
      ).length,
      fill: '#14B8A6',
    },
    {
      tier: isAr ? 'جيد (65-74%)' : 'Good (65-74%)',
      count: submissions.filter(
        (s) => s.percentage >= 65 && s.percentage < 75,
      ).length,
      fill: '#38BDF8',
    },
    {
      tier: isAr ? 'مقبول (50-64%)' : 'Pass (50-64%)',
      count: submissions.filter(
        (s) => s.percentage >= 50 && s.percentage < 65,
      ).length,
      fill: '#F59E0B',
    },
    {
      tier: isAr ? 'راسب (<50%)' : 'Fail (<50%)',
      count: submissions.filter((s) => s.percentage < 50).length,
      fill: '#F43F5E',
    },
  ];

  const handleExport = async () => {
    if (!quiz) return;
    try {
      setIsExporting(true);
      await exportQuizAnalysis(quiz._id, quiz.title);
      toast.success(
        isAr
          ? 'تم تحميل شيت التحليل بنجاح'
          : 'Analysis spreadsheet downloaded successfully',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تحميل شيت التحليل' : 'Failed to export analysis sheet',
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return submissions;
    const q = search.toLowerCase();
    return submissions.filter(
      (s) =>
        s.studentCode.toLowerCase().includes(q) ||
        (s.studentName && s.studentName.toLowerCase().includes(q)) ||
        (s.studentNameAr && s.studentNameAr.toLowerCase().includes(q)) ||
        (s.studentNameEn && s.studentNameEn.toLowerCase().includes(q)),
    );
  }, [submissions, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl">
        <DialogHeader className="border-b border-border/70 pb-4 text-start">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span>
                  {isAr
                    ? 'تحليل نتائج وأداء الاختبار:'
                    : 'Quiz Analytics & Submissions:'}{' '}
                  <span className="text-primary">
                    {isAr ? quiz?.titleAr || quiz?.title : quiz?.title}
                  </span>
                </span>
              </DialogTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground/80">
                  {quiz?.courseCode}
                </span>
                <span>·</span>
                <span>
                  {isAr
                    ? quiz?.courseNameAr || quiz?.courseName
                    : quiz?.courseNameEn || quiz?.courseName || quiz?.courseNameAr}
                </span>
                <span>·</span>
                <span>
                  {quiz?.totalMarks} {isAr ? 'درجة' : 'marks'}
                </span>
              </div>
            </div>

            <Button
              onClick={handleExport}
              disabled={
                isExporting || submissionsQuery.isLoading || total === 0
              }
              size="sm"
              className="rounded-squircle gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700 shadow-sm"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              <span>
                {isAr
                  ? 'تصدير شيت التحليل (Excel)'
                  : 'Export Analysis (.xlsx)'}
              </span>
            </Button>
          </div>

          {/* Tab buttons */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 rounded-squircle px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>
                {isAr
                  ? 'الرسوم البيانية والإحصائيات'
                  : 'Charts & Statistics'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`flex items-center gap-1.5 rounded-squircle px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'roster'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                {isAr ? 'قائمة تسليمات الطلاب' : 'Student Submissions'}
                {total > 0 && ` (${total})`}
              </span>
            </button>
          </div>
        </DialogHeader>

        {submissionsQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-white/10 bg-secondary/20 p-12 text-center text-muted-foreground text-sm">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="font-semibold">
              {isAr
                ? 'لم يقم أي طالب بتقديم هذا الاختبار حتى الآن'
                : 'No student submissions yet'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {isAr
                ? 'ستظهر الإحصائيات والرسوم البيانية تلقائياً بمجرد تسليم الطلاب لإجاباتهم.'
                : 'Statistics and charts will appear as soon as students submit their answers.'}
            </p>
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="space-y-6 pt-3">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-secondary/30 p-3.5 shadow-sm">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? 'إجمالي المشاركين' : 'Total Students'}
                </span>
                <div className="mt-1 flex items-baseline gap-1 text-2xl font-bold font-mono text-foreground">
                  {total}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {isAr ? 'طالب خاضوا الاختبار' : 'participated'}
                </span>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 shadow-sm">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {isAr ? 'نسبة النجاح العامة' : 'Pass Rate'}
                </span>
                <div className="mt-1 flex items-baseline gap-1 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {passPercentage}%
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {passed} {isAr ? 'ناجح' : 'passed'} · {failed}{' '}
                  {isAr ? 'راسب' : 'failed'}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-secondary/30 p-3.5 shadow-sm">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? 'متوسط الدرجات' : 'Average Score'}
                </span>
                <div className="mt-1 flex items-baseline gap-1 text-2xl font-bold font-mono text-primary">
                  {avgScore}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {quiz?.totalMarks}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {quiz?.totalMarks
                    ? Math.round((Number(avgScore) / quiz.totalMarks) * 100)
                    : 0}
                  % {isAr ? 'من الدرجة الكلية' : 'of total'}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-secondary/30 p-3.5 shadow-sm">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? 'أعلى وأدنى درجة' : 'Score Range'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold font-mono text-foreground">
                  <span className="text-emerald-500">{maxScore}</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-rose-500">{minScore}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {isAr ? 'أعلى درجة / أدنى درجة' : 'High / Low score'}
                </span>
              </div>
            </div>

            {/* Recharts Visualizations */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Pie Chart: Pass vs Fail */}
              <div className="rounded-xl border border-white/10 bg-card/60 p-4 shadow-sm backdrop-blur-md">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {isAr
                      ? 'نسبة النجاح مقابل الرسوب'
                      : 'Pass vs. Fail Distribution'}
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-500">
                    {passPercentage}% {isAr ? 'نجاح' : 'Pass'}
                  </span>
                </div>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 pt-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="font-medium">
                      {isAr ? 'ناجح' : 'Passed'}: {passed} ({passPercentage}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="font-medium">
                      {isAr ? 'راسب' : 'Failed'}: {failed} ({failPercentage}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Bar Chart: Score Tiers */}
              <div className="rounded-xl border border-white/10 bg-card/60 p-4 shadow-sm backdrop-blur-md">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    {isAr
                      ? 'توزيع درجات الطلاب بالتقديرات'
                      : 'Grade Tiers Breakdown'}
                  </span>
                </div>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <XAxis
                        dataKey="tier"
                        tick={{ fontSize: 9, fill: '#94A3B8' }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#94A3B8' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name={isAr ? 'عدد الطلاب' : 'Students'}
                        radius={[4, 4, 0, 0]}
                      >
                        {barData.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Roster Tab */
          <div className="space-y-4 pt-3">
            <div className="relative">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isAr
                    ? 'بحث بكود أو اسم الطالب...'
                    : 'Search student code or name...'
                }
                className="rounded-squircle text-xs border-white/15 bg-background/60"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-secondary/20 p-8 text-center text-muted-foreground text-sm">
                {isAr
                  ? 'لا توجد نتائج مطابقة للبحث'
                  : 'No matching submissions found'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs text-start">
                  <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-3 text-start">
                        {isAr ? 'كود الطالب' : 'Student Code'}
                      </th>
                      <th className="p-3 text-start">
                        {isAr ? 'اسم الطالب' : 'Student Name'}
                      </th>
                      <th className="p-3 text-center">
                        {isAr ? 'الدرجة' : 'Score'}
                      </th>
                      <th className="p-3 text-center">
                        {isAr ? 'النسبة' : 'Percentage'}
                      </th>
                      <th className="p-3 text-center">
                        {isAr ? 'النتيجة' : 'Result'}
                      </th>
                      <th className="p-3 text-end">
                        {isAr ? 'وقت التسليم' : 'Submitted At'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filtered.map((sub) => (
                      <tr
                        key={sub._id}
                        className="hover:bg-secondary/20 transition-colors"
                      >
                        <td className="p-3 font-mono font-bold text-foreground">
                          {sub.studentCode}
                        </td>
                        <td className="p-3 font-medium text-foreground">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {isAr
                                ? sub.studentNameAr || sub.studentName
                                : sub.studentNameEn || sub.studentName || sub.studentNameAr}
                            </span>
                            {isAr &&
                              sub.studentName &&
                              sub.studentName !== sub.studentNameAr && (
                                <span
                                  className="text-[10px] text-muted-foreground/70 font-sans"
                                  dir="ltr"
                                >
                                  {sub.studentName}
                                </span>
                              )}
                            {!isAr && sub.studentNameAr && (
                              <span
                                className="text-[10px] text-muted-foreground/70 font-sans"
                                dir="rtl"
                              >
                                {sub.studentNameAr}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span className="text-primary">{sub.score}</span> /{' '}
                          {sub.totalMarks}
                        </td>
                        <td className="p-3 text-center font-mono font-semibold">
                          {sub.percentage}%
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              sub.isPassed
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {sub.isPassed
                              ? isAr
                                ? 'ناجح'
                                : 'Passed'
                              : isAr
                                ? 'راسب'
                                : 'Failed'}
                          </span>
                        </td>
                        <td className="p-3 text-end text-muted-foreground font-mono text-[11px]">
                          {new Date(sub.submittedAt).toLocaleTimeString(
                            isAr ? 'ar-EG' : 'en-GB',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Africa/Cairo',
                            },
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Admin Quizzes Page ──────────────────────────── */
function AdminQuizzesContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) || 'ar';
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const canWrite =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes(PERMISSIONS.QUIZZES_WRITE));
  const canViewSubmissions =
    user?.role === 'admin' ||
    Boolean(user?.permissions?.includes(PERMISSIONS.QUIZZES_SUBMISSIONS_READ));

  const urlCourseId = searchParams?.get('courseId') || 'ALL';
  const autoCreate = searchParams?.get('create') === 'true';

  const isDoctor = user?.role === 'staff' && user?.staffType === 'doctor';

  const [page] = useState(1);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState(urlCourseId);
  const [isAddOpen, setIsAddOpen] = useState(autoCreate && canWrite);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<QuizItem | null>(null);
  const [submissionsQuiz, setSubmissionsQuiz] = useState<QuizItem | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState<QuizItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewQuiz, setPreviewQuiz] = useState<QuizItem | null>(null);
  const [, setLoadingQuizId] = useState<string | null>(null);

  const handleOpenEdit = async (quiz: QuizItem) => {
    try {
      setLoadingQuizId(quiz._id);
      const full = await getQuiz(quiz._id);
      setSelectedQuiz(full);
    } catch {
      setSelectedQuiz(quiz);
    } finally {
      setLoadingQuizId(null);
      setIsEditOpen(true);
    }
  };

  const handleOpenPreview = async (quiz: QuizItem) => {
    try {
      setLoadingQuizId(quiz._id);
      const full = await getQuiz(quiz._id);
      setPreviewQuiz(full);
    } catch {
      setPreviewQuiz(quiz);
    } finally {
      setLoadingQuizId(null);
      setIsPreviewOpen(true);
    }
  };

  // Fetch quizzes
  const quizzesQuery = useQuery({
    queryKey: ['admin-quizzes', page, search, courseFilter, user?._id, isDoctor],
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
    queryKey: ['active-courses-list', user?._id, isDoctor],
    queryFn: async () => {
      try {
        const res = await api.get<unknown>('/admin/courses', {
          params: { page: 1, limit: 200, doctorId: isDoctor ? user?._id : undefined },
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
          params: { page: 1, limit: 200, doctorId: isDoctor ? user?._id : undefined },
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
  const coursesMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; nameAr?: string }>();
    for (const c of coursesList) {
      if (c._id) map.set(c._id, c);
      if (c.code) map.set(c.code, c);
    }
    return map;
  }, [coursesList]);

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
      render: (quiz) => {
        const matchedCourse = coursesMap.get(quiz.courseId) || coursesMap.get(quiz.courseCode);
        const displayName = isAr
          ? (quiz.courseNameAr || matchedCourse?.nameAr || quiz.courseName)
          : (quiz.courseNameEn || matchedCourse?.name || quiz.courseName);

        return (
          <TableCell className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-squircle">
                {quiz.courseCode}
              </span>
              <span className="font-medium text-foreground text-xs">
                {displayName}
              </span>
            </div>
          </TableCell>
        );
      },
    },
    {
      key: 'title',
      header: isAr ? 'عنوان الاختبار' : 'Quiz Title',
      render: (quiz) => (
        <TableCell className="p-4 text-start">
          <button
            type="button"
            onClick={() => handleOpenPreview(quiz)}
            className="text-start font-bold text-foreground text-sm hover:text-primary hover:underline transition-colors cursor-pointer block"
          >
            {quiz.title}
          </button>
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
                  onClick={() => handleOpenPreview(quiz)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'معاينة الاختبار' : 'Preview Quiz'}</span>
                </DropdownMenu.Item>
                {canViewSubmissions && (
                  <>
                    <DropdownMenu.Item
                      onClick={() => setSubmissionsQuiz(quiz)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      <span>{isAr ? 'عرض التحليل وتسليمات الطلاب' : 'View Analytics & Submissions'}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onClick={async () => {
                        try {
                          await exportQuizAnalysis(quiz._id, quiz.title);
                          toast.success(isAr ? 'تم تحميل شيت التحليل بنجاح' : 'Analysis sheet downloaded');
                        } catch (err) {
                          toast.error(getApiErrorMessage(err));
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer outline-none hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{isAr ? 'تحميل شيت التحليل (Excel)' : 'Download Analysis (.xlsx)'}</span>
                    </DropdownMenu.Item>
                  </>
                )}
                {canWrite && (
                  <>
                    <DropdownMenu.Item
                      onClick={() => handleOpenEdit(quiz)}
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
                  </>
                )}
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
        {canWrite && (
          <Button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover rounded-squircle"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إنشاء كويز جديد' : 'Create Quiz'}</span>
          </Button>
        )}
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
        initialValues={
          selectedQuiz ||
          (urlCourseId !== 'ALL' ? { courseId: urlCourseId } : {})
        }
        courses={coursesList}
        coursesLoading={coursesQuery.isLoading}
        isAr={isAr}
        onSuccess={(savedQuiz) => {
          void queryClient.invalidateQueries({ queryKey: ['admin-quizzes'] });
          if (savedQuiz) {
            handleOpenPreview(savedQuiz);
          }
        }}
      />

      {/* Quiz Preview Modal */}
      <QuizPreviewModal
        quiz={previewQuiz}
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setPreviewQuiz(null);
        }}
        isAr={isAr}
        canEdit={canWrite}
        onEdit={(quiz) => {
          setIsPreviewOpen(false);
          handleOpenEdit(quiz);
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
