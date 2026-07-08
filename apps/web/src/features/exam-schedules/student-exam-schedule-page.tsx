'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import { Calendar, Download, Eye, FileImage, Image as ImageIcon } from 'lucide-react';

import { GlassCard } from '@/components/ui/glass-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';

interface ExamSchedule {
  _id: string;
  title: string;
  examType: 'midterm' | 'final';
  academicYear: string;
  semester: string;
  fileUrl: string;
  isPublished: boolean;
}

interface ExamAssignmentResponse {
  seatNumber: string | null;
  examRoom: string | null;
  examFloor: string | null;
  examBuilding: string | null;
  schedules: ExamSchedule[];
}

type ExamScheduleType = 'final' | 'midterm';

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
    descriptionEn: 'End-of-term exams',
  },
  midterm: {
    labelAr: 'جدول امتحانات الميد ترم',
    labelEn: 'Midterm Exam Schedule',
    descriptionAr: 'امتحانات منتصف الفصل الدراسي',
    descriptionEn: 'Midterm exams',
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

export default function StudentExamSchedulePage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;
  const [selectedType, setSelectedType] = useState<ExamScheduleType>('final');

  const assignmentQuery = useQuery({
    queryKey: ['student-exam-assignment'],
    queryFn: async () => {
      const res = await api.get<ExamAssignmentResponse>('/students/me/exam-assignment');
      return res.data;
    },
  });

  if (assignmentQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (assignmentQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(assignmentQuery.error)}
        error={assignmentQuery.error}
        onRetry={() => assignmentQuery.refetch()}
      />
    );
  }

  const schedules = assignmentQuery.data?.schedules || [];
  const currentSchedule = schedules.find((schedule) => schedule.examType === selectedType) || null;
  const typeOptions: ExamScheduleType[] = ['final', 'midterm'];

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface/50 px-5 py-3 text-sm font-bold text-foreground shadow-sm">
          <Calendar className="h-5 w-5 text-primary" />
          <span>{locale === 'ar' ? 'جدول الامتحانات' : t('examSchedule')}</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          {locale === 'ar' ? 'جداول الامتحانات' : t('examSchedule')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {locale === 'ar'
            ? 'اختر نوع الجدول لعرض صورة الامتحانات النهائية أو الميد ترم'
            : 'Choose a schedule type to view the final or midterm exam image'}
        </p>
      </div>

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
              className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-start transition-all ${
                isActive
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
                      ? 'جدول متاح'
                      : 'Available'
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

      <GlassCard className="rounded-3xl border border-border/70 p-5 md:p-6">
        {currentSchedule ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  {locale === 'ar' ? TYPE_META[selectedType].labelAr : TYPE_META[selectedType].labelEn}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentSchedule.title} • {currentSchedule.academicYear} • {semesterLabel(locale, currentSchedule.semester)}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface/50 px-4 py-2 text-sm font-semibold text-foreground">
                <ImageIcon className="h-4 w-4 text-primary" />
                <span>{currentSchedule.isPublished ? (locale === 'ar' ? 'منشور' : 'Published') : (locale === 'ar' ? 'مسودة' : 'Draft')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="overflow-hidden rounded-3xl border border-border bg-black/20 min-h-88">
                {currentSchedule.fileUrl.toLowerCase().endsWith('.pdf') ? (
                  <div className="flex h-full min-h-88 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                    <FileImage className="h-12 w-12" />
                    <p className="text-lg font-bold text-foreground">
                      {locale === 'ar' ? 'الملف متاح بصيغة PDF' : 'File available as PDF'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {locale === 'ar' ? 'يمكنك فتحه أو تنزيله من الأزرار الجانبية' : 'Open or download it using the side buttons'}
                    </p>
                  </div>
                ) : (
                  <img src={currentSchedule.fileUrl} alt={currentSchedule.title} className="h-full min-h-88 w-full object-cover" />
                )}
              </div>

              <div className="space-y-4 rounded-3xl border border-border bg-surface/30 p-4">
                <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {locale === 'ar' ? 'العنوان' : 'Title'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">{currentSchedule.title}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {locale === 'ar' ? 'السنة الدراسية' : 'Academic year'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">{currentSchedule.academicYear}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">{semesterLabel(locale, currentSchedule.semester)}</p>
                </div>

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <a
                    href={currentSchedule.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md shadow-primary/15 transition hover:bg-primary-hover"
                  >
                    <Eye className="h-4 w-4" />
                    <span>{locale === 'ar' ? 'عرض الجدول' : 'View schedule'}</span>
                  </a>
                  <a
                    href={currentSchedule.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm font-bold text-foreground transition hover:bg-surface-hover"
                  >
                    <Download className="h-4 w-4" />
                    <span>{locale === 'ar' ? 'تحميل' : 'Download'}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title={locale === 'ar'
              ? selectedType === 'final'
                ? 'لا يوجد جدول نهائي متاح حالياً'
                : 'لا يوجد جدول ميد ترم متاح حالياً'
              : selectedType === 'final'
              ? 'No final schedule available yet'
              : 'No midterm schedule available yet'}
            description={locale === 'ar'
              ? 'لم يتم رفع الجدول بعد. يرجى المتابعة لاحقاً.'
              : 'The administration has not published this schedule yet. Please check again later.'}
          />
        )}
      </GlassCard>
    </div>
  );
}
