'use client';
import NextImage from "next/image";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import {
  Calendar,
  Eye,
  EyeOff,
  FileImage,
  Loader2,
  Save,
  Trash2,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { SEMESTER_VALUES } from '@student-portal/shared';

import { PageTitleBanner } from '@/components/ui/page-title-banner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageSkeletonLoader } from '@/components/ui/page-suspense-fallback';
import { PermissionGuard } from '@/components/ui/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GlassCard } from '@/components/ui/glass-card';
import { useAuth } from '@/providers/auth-provider';

interface ExamSchedule {
  _id: string;
  title: string;
  examType: 'midterm' | 'final';
  academicYear: string;
  semester: string;
  fileUrl: string;
  isPublished: boolean;
}

type ExamScheduleType = 'midterm' | 'final';

const TYPE_META: Record<
  ExamScheduleType,
  {
    labelAr: string;
    labelEn: string;
    descriptionAr: string;
    descriptionEn: string;
  }
> = {
  final: {
    labelAr: 'جدول الامتحانات النهائية',
    labelEn: 'Final Exam Schedule',
    descriptionAr: 'امتحانات نهاية الفصل الدراسي',
    descriptionEn: 'End-of-term exam schedule',
  },
  midterm: {
    labelAr: 'جدول امتحانات الميد ترم',
    labelEn: 'Midterm Exam Schedule',
    descriptionAr: 'امتحانات منتصف الفصل الدراسي',
    descriptionEn: 'Midterm exam schedule',
  },
};

function semesterLabel(locale: string, semester: string) {
  if (locale === 'ar') {
    if (semester === 'first') return 'الأول';
    if (semester === 'second') return 'الثاني';
    return 'الصيفي';
  }

  if (semester === 'first') return 'First';
  if (semester === 'second') return 'Second';
  return 'Summer';
}

function isImageFile(url: string) {
  return !url.toLowerCase().endsWith('.pdf');
}

function isPdfFile(fileUrl: string) {
  return fileUrl.toLowerCase().endsWith('.pdf');
}

function AdminExamSchedulesManagerContent() {
  const t = useTranslations('examSchedules');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const staffType = user?.staffType;
  const isTeachingOrFinanceStaff =
    user?.role === 'staff' &&
    ['doctor', 'teaching_assistant', 'assistant_lecturer', 'ta', 'accountant'].includes(staffType || '');
  const canWriteSchedules =
    !isTeachingOrFinanceStaff &&
    (isAdmin || Boolean(user?.permissions?.includes('exam_schedules.write')));

  const [selectedType, setSelectedType] = useState<ExamScheduleType>('final');
  const [title, setTitle] = useState('');
  const [academicYear, setAcademicYear] = useState('2024-2025');
  const [semester, setSemester] = useState<'first' | 'second' | 'summer'>('first');
  const [fileUrl, setFileUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const schedulesQuery = useQuery({
    queryKey: ['exam-schedules'],
    queryFn: async () => {
      const res = await api.get<ExamSchedule[]>('/admin/exam-schedules');
      return res.data;
    },
  });

  const schedules = schedulesQuery.data || [];
  const currentSchedule = schedules.find((schedule) => schedule.examType === selectedType) || null;

  const [previousSchedule, setPreviousSchedule] = useState<unknown[] | null>(null);
  if (previousSchedule === null || previousSchedule.some((value, index) => !Object.is(value, [currentSchedule, selectedType][index]))) {
    setPreviousSchedule([currentSchedule, selectedType]);
    (() => {
    if (currentSchedule) {
      setTitle(currentSchedule.title);
      setAcademicYear(currentSchedule.academicYear);
      setSemester(currentSchedule.semester as 'first' | 'second' | 'summer');
      setFileUrl(currentSchedule.fileUrl);
      setPreviewUrl(currentSchedule.fileUrl);
      setUploadedImageName('');
      setIsPublished(currentSchedule.isPublished);
      return;
    }

    setTitle('');
    setAcademicYear('2024-2025');
    setSemester('first');
    setFileUrl('');
    setPreviewUrl('');
    setUploadedImageName('');
    setIsPublished(true);

    })();
  }

  const uploadScheduleImage = async (file: File) => {
    const isImage = /^image\//.test(file.type);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (!isImage && !isPdf) {
      throw new Error(locale === 'ar' ? 'يرجى اختيار صورة أو ملف PDF' : 'Please choose an image or PDF file');
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await api.post<{ fileUrl: string }>('/admin/exam-schedules/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!res.data.fileUrl) {
      throw new Error(locale === 'ar' ? 'تعذر رفع الملف' : 'Unable to upload the file');
    }

    setUploadedImageName(file.name);
    setPreviewUrl(res.data.fileUrl);
    setFileUrl(res.data.fileUrl);
  };

  const handleUploadPick = async (file?: File) => {
    if (!file) return;

    setFormError('');
    setImageUploading(true);

    try {
      await uploadScheduleImage(file);
    } catch (error: unknown) {
      setUploadedImageName('');
      setPreviewUrl(currentSchedule?.fileUrl || '');
      setFileUrl(currentSchedule?.fileUrl || '');
      setFormError(getApiErrorMessage(error, locale === 'ar' ? 'فشل رفع الصورة إلى Cloudinary' : 'Failed to upload image to Cloudinary'));
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    setFormError('');

    if (!title.trim()) {
      setFormError(locale === 'ar' ? 'يرجى إدخال عنوان الجدول' : 'Please enter a schedule title');
      return;
    }

    if (!fileUrl.trim()) {
      setFormError(locale === 'ar' ? 'يرجى رفع صورة الجدول أولاً' : 'Please upload the schedule image first');
      return;
    }

    setFormLoading(true);

    try {
      const payload = {
        title,
        examType: selectedType,
        academicYear,
        semester,
        fileUrl,
        isPublished,
      };

      if (currentSchedule) {
        await api.patch(`/admin/exam-schedules/${currentSchedule._id}`, payload);
        toast.success(locale === 'ar' ? 'تم تحديث الجدول بنجاح' : 'Exam schedule updated successfully');
      } else {
        await api.post('/admin/exam-schedules', payload);
        toast.success(locale === 'ar' ? 'تم إضافة الجدول بنجاح' : 'Exam schedule added successfully');
      }

      void queryClient.invalidateQueries({ queryKey: ['exam-schedules'] });
    } catch (error: unknown) {
      setFormError(getApiErrorMessage(error, locale === 'ar' ? 'حدث خطأ أثناء حفظ الجدول' : 'Failed to save the schedule'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!currentSchedule) return;
    try {
      await api.patch(`/admin/exam-schedules/${currentSchedule._id}`, {
        isPublished: !currentSchedule.isPublished,
      });
      toast.success(locale === 'ar' ? 'تم تحديث حالة النشر' : 'Publish status updated');
      void queryClient.invalidateQueries({ queryKey: ['exam-schedules'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!currentSchedule) return;
    try {
      await api.delete(`/admin/exam-schedules/${currentSchedule._id}`);
      toast.success(locale === 'ar' ? 'تم حذف الجدول' : 'Schedule deleted');
      void queryClient.invalidateQueries({ queryKey: ['exam-schedules'] });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const typeOptions: ExamScheduleType[] = ['final', 'midterm'];

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6 text-start">
      <PageTitleBanner
        title={locale === 'ar' ? 'جدول الامتحانات' : t('title')}
        icon={<Calendar className="h-5 w-5" />}
        subtitle={locale === 'ar' ? 'رفع وتحديث صورة جداول نهاية الفصل وعرضها في بوابة الطالب' : 'Upload and update final and midterm exam schedule images'}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {typeOptions.map((type) => {
          const meta = TYPE_META[type];
          const isActive = selectedType === type;
          const hasSchedule = schedules.some((schedule) => schedule.examType === type);

          return (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-start transition-all duration-200 ${isActive
                  ? 'border-primary/70 bg-primary/10 shadow-md shadow-primary/10'
                  : 'border-border bg-surface/40 hover:border-primary/40 hover:bg-primary/5'
                }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {locale === 'ar' ? meta.labelAr : meta.labelEn}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ar' ? meta.descriptionAr : meta.descriptionEn}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {hasSchedule
                    ? locale === 'ar'
                      ? 'يوجد جدول متاح'
                      : 'Schedule available'
                    : locale === 'ar'
                      ? 'لا يوجد جدول حالياً'
                      : 'No schedule yet'}
                </p>
              </div>
              <div className={`rounded-2xl border p-3 ${isActive ? 'border-primary/50 bg-primary/15' : 'border-border bg-surface/50'}`}>
                <Calendar className={`h-6 w-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </button>
          );
        })}
      </div>

      {formError && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {formError}
        </div>
      )}

      <div className={canWriteSchedules ? "grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]" : "grid grid-cols-1 gap-5"}>
        <GlassCard className="space-y-4 rounded-3xl border border-border/70 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-foreground">
                {locale === 'ar' ? TYPE_META[selectedType].labelAr : TYPE_META[selectedType].labelEn}
              </h3>
              <p className="text-sm text-muted-foreground">
                {locale === 'ar'
                  ? 'الجدول الحالي المعروض للطلاب'
                  : 'Current schedule shown to students'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/50 p-3 text-primary">
              <Calendar className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-4 min-h-88 flex flex-col">
            {currentSchedule ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-foreground">{currentSchedule.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <bdi dir="ltr">{currentSchedule.academicYear}</bdi> • {semesterLabel(locale, currentSchedule.semester)}
                    </p>
                  </div>
                  {canWriteSchedules && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePublish}
                        className="rounded-xl border border-border bg-surface/60 p-2 text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                        title={currentSchedule.isPublished ? (locale === 'ar' ? 'إخفاء' : 'Hide') : (locale === 'ar' ? 'نشر' : 'Publish')}
                      >
                        {currentSchedule.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            className="rounded-xl border border-border bg-surface/60 p-2 text-muted-foreground transition hover:border-danger/40 hover:text-danger"
                            title={locale === 'ar' ? 'حذف الجدول' : 'Delete schedule'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        }
                        title={locale === 'ar' ? 'حذف الجدول' : 'Delete schedule'}
                        description={locale === 'ar' ? 'هل أنت متأكد من حذف هذا الجدول؟' : 'Are you sure you want to delete this schedule?'}
                        confirmLabel={tCommon('delete')}
                        cancelLabel={tCommon('cancel')}
                        onConfirm={() => void handleDelete()}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex-1 overflow-hidden rounded-2xl border border-border bg-black/20">
                  {isImageFile(currentSchedule.fileUrl) ? (
                    <NextImage unoptimized width={1200} height={800}
                      src={previewUrl || currentSchedule.fileUrl}
                      alt={currentSchedule.title}
                      className="h-64 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                      <FileImage className="h-12 w-12" />
                      <p className="text-sm font-semibold">
                        {locale === 'ar' ? 'تم حفظ رابط PDF' : 'PDF link saved'}
                      </p>
                      <a
                        href={currentSchedule.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {locale === 'ar' ? 'فتح الملف' : 'Open file'}
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-88 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/20 px-6 text-center text-muted-foreground">
                <Calendar className="h-14 w-14 text-muted-foreground/60" />
                <p className="mt-4 text-lg font-bold text-foreground">
                  {locale === 'ar'
                    ? selectedType === 'final'
                      ? 'لا يوجد جدول امتحانات نهائية متاح حالياً'
                      : 'لا يوجد جدول ميد ترم متاح حالياً'
                    : selectedType === 'final'
                      ? 'No final schedule available yet'
                      : 'No midterm schedule available yet'}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {locale === 'ar'
                    ? 'قم برفع صورة الجدول الجديد من اللوحة اليمنى حتى يظهر للطلاب.'
                    : 'Upload a new schedule image from the right panel so students can see it.'}
                </p>
              </div>
            )}
          </div>
        </GlassCard>

        {canWriteSchedules && (
          <GlassCard className="space-y-4 rounded-3xl border border-border/70 p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {locale === 'ar' ? 'رفع صورة جديدة' : 'Upload New Image'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {locale === 'ar'
                    ? 'ارفع صورة جدول الامتحانات إلى Cloudinary ثم احفظها مباشرة.'
                    : 'Upload the exam schedule image to Cloudinary and save it directly.'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/50 p-3 text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-dashed border-border bg-surface/30 p-4">
              <label className="block text-sm font-semibold text-foreground">
                {locale === 'ar' ? 'اختر صورة جديدة' : 'Choose a new image'}
              </label>
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-4 py-5 text-center transition hover:border-primary/60 hover:bg-primary/5">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={(event) => void handleUploadPick(event.target.files?.[0])}
                />
                {imageUploading ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {locale === 'ar' ? 'جارٍ رفع الصورة...' : 'Uploading image...'}
                    </p>
                  </>
                ) : uploadedImageName ? (
                  <>
                    <UploadCloud className="h-7 w-7 text-success" />
                    <p className="mt-2 max-w-full truncate text-sm font-semibold text-foreground">
                      {uploadedImageName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'ar' ? 'تم الرفع إلى Cloudinary' : 'Uploaded to Cloudinary'}
                    </p>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {locale === 'ar' ? 'اضغط لاختيار ملف الجدول' : 'No file chosen'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'ar' ? 'PNG / JPG / WEBP / PDF' : 'PNG / JPG / WEBP / PDF'}
                    </p>
                  </>
                )}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'عنوان الجدول' : 'Schedule title'}
                </label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={locale === 'ar' ? 'مثال: جدول امتحانات نهاية الفصل' : 'e.g. Final exam schedule'} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'السنة الدراسية' : 'Academic year'}
                </label>
                <Input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}</label>
                <Select value={semester} onValueChange={(value) => setSemester(value as 'first' | 'second' | 'summer')}>
                  <SelectTrigger className="border-border bg-card/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                    {SEMESTER_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {semesterLabel(locale, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              onClick={() => setIsPublished((value) => !value)}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-surface/35 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-surface/50"
            >
              <div className="space-y-0.5 text-start">
                <p className="text-sm font-semibold text-foreground">
                  {locale === 'ar' ? 'منشور للطلاب' : 'Published to students'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ar' ? 'سيظهر الجدول في بوابة الطالب مباشرة' : 'Students will see it immediately'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublished}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsPublished((value) => !value);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  isPublished ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isPublished
                      ? 'translate-x-5 rtl:-translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {previewUrl && isImageFile(previewUrl) && (
              <div className="overflow-hidden rounded-2xl border border-border bg-black/20">
                <NextImage unoptimized width={1200} height={800} src={previewUrl} alt={title || 'Schedule preview'} className="h-44 w-full object-cover" />
              </div>
            )}
            {previewUrl && isPdfFile(previewUrl) && (
              <div className="rounded-2xl border border-border bg-surface/35 px-4 py-4 text-sm text-muted-foreground">
                {locale === 'ar' ? 'تم رفع ملف PDF وسيظهر للطلاب كرابط تنزيل/عرض.' : 'The PDF file is uploaded and will be shown to students as a view/download link.'}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button type="button" onClick={() => void handleSave()} disabled={formLoading || imageUploading} className="w-full gap-2 bg-primary text-white hover:bg-primary-hover">
                {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {currentSchedule ? (locale === 'ar' ? 'حفظ التحديث' : 'Save changes') : (locale === 'ar' ? 'إنشاء الجدول' : 'Create schedule')}
              </Button>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

export default function AdminExamSchedulesManager() {
  return (
    <React.Suspense fallback={<PageSkeletonLoader />}>
      <PermissionGuard permission="exam_schedules.read">
        <AdminExamSchedulesManagerContent />
      </PermissionGuard>
    </React.Suspense>
  );
}
