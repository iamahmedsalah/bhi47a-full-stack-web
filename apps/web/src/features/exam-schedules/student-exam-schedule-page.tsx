'use client';
import NextImage from "next/image";

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { Calendar, Download, Eye, FileImage, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/ui/feedback';
import { motion } from 'framer-motion';

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

  const isEnglish = locale === 'en' || tCommon('search') === 'Search...';

  if (assignmentQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (assignmentQuery.isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Calendar className="h-6 w-6 text-primary" />
            <span>{isEnglish ? 'Exam Timetables' : 'جداول الامتحانات'}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEnglish
              ? 'Exam schedules and official timetables'
              : 'جداول الامتحانات المعتمدة للفصل الدراسي'}
          </p>
        </div>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <EmptyState
            title={locale === 'ar' ? 'لا يوجد جدول امتحانات متاح حالياً' : 'No exam schedule available yet'}
            description={locale === 'ar'
              ? 'لم تقم إدارة المعهد بنشر جدول الامتحانات لهذا الفصل الدراسي بعد. يرجى المتابعة لاحقاً.'
              : 'The administration has not published the exam timetable yet. Please check again later.'}
          />
        </Card>
      </div>
    );
  }

  const schedules = assignmentQuery.data?.schedules || [];
  const currentSchedule = schedules.find((schedule) => schedule.examType === selectedType) || null;
  const typeOptions: ExamScheduleType[] = ['final', 'midterm'];

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Calendar className="h-6 w-6 text-primary" />
          <span>{isEnglish ? 'Exam Timetables' : 'جداول الامتحانات'}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'Choose a schedule type to view the final or midterm exam details'
            : 'اختر نوع الجدول لعرض صورة الامتحانات النهائية أو الميد ترم بالتفصيل'}
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
              className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-start transition-all cursor-pointer ${isActive
                  ? 'border-primary/50 bg-primary/10 shadow-md shadow-primary/5'
                  : 'border-border bg-card/45 hover:border-primary/45 hover:bg-card/75'
                }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {locale === 'ar' ? meta.labelAr : meta.labelEn}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ar' ? meta.descriptionAr : meta.descriptionEn}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${hasSchedule ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {hasSchedule
                    ? (locale === 'ar' ? 'جدول متاح' : 'Available')
                    : (locale === 'ar' ? 'لا يوجد جدول حالياً' : 'No schedule yet')}
                </p>
              </div>
              <div className={`rounded-xl border p-2.5 ${isActive ? 'border-primary/45 bg-primary/10 text-primary' : 'border-border bg-secondary/50 text-muted-foreground'}`}>
                <Calendar className="h-5 w-5" />
              </div>
            </button>
          );
        })}
      </div>

      <motion.div
        key={selectedType}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-6 relative overflow-hidden">
          {currentSchedule ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-foreground">
                    {locale === 'ar' ? TYPE_META[selectedType].labelAr : TYPE_META[selectedType].labelEn}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {currentSchedule.title} • {currentSchedule.academicYear} • {semesterLabel(locale, currentSchedule.semester)}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary self-start md:self-center">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{currentSchedule.isPublished ? (locale === 'ar' ? 'منشور' : 'Published') : (locale === 'ar' ? 'مسودة' : 'Draft')}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="overflow-hidden rounded-2xl border border-border bg-secondary/35 min-h-88 flex items-center justify-center relative">
                  {currentSchedule.fileUrl.toLowerCase().endsWith('.pdf') ? (
                    <div className="flex h-full min-h-88 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                      <FileImage className="h-12 w-12 text-primary/65" />
                      <p className="text-lg font-bold text-foreground">
                        {locale === 'ar' ? 'الملف متاح بصيغة PDF' : 'File available as PDF'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {locale === 'ar' ? 'يمكنك فتحه أو تنزيله من الأزرار الجانبية' : 'Open or download it using the side buttons'}
                      </p>
                    </div>
                  ) : (
                    <NextImage unoptimized width={1200} height={800} src={currentSchedule.fileUrl} alt={currentSchedule.title} className="h-full min-h-88 w-full object-contain" />
                  )}
                </div>

                <div className="space-y-4 rounded-2xl border border-border bg-secondary/20 p-5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="bg-card/45 backdrop-blur-sm p-4 rounded-xl border border-border/70 hover:border-primary/30 transition-all duration-300">
                      <p className="text-xs text-muted-foreground font-semibold">
                        {locale === 'ar' ? 'العنوان' : 'Title'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">{currentSchedule.title}</p>
                    </div>
                    <div className="bg-card/45 backdrop-blur-sm p-4 rounded-xl border border-border/70 hover:border-primary/30 transition-all duration-300">
                      <p className="text-xs text-muted-foreground font-semibold">
                        {locale === 'ar' ? 'السنة الدراسية' : 'Academic year'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground font-mono">{currentSchedule.academicYear}</p>
                    </div>
                    <div className="bg-card/45 backdrop-blur-sm p-4 rounded-xl border border-border/70 hover:border-primary/30 transition-all duration-300">
                      <p className="text-xs text-muted-foreground font-semibold">
                        {locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">{semesterLabel(locale, currentSchedule.semester)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                    <a
                      href={currentSchedule.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/80 px-4 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      <span>{locale === 'ar' ? 'عرض الجدول' : 'View schedule'}</span>
                    </a>
                    <a
                      href={currentSchedule.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary px-4 py-3 text-sm font-bold text-foreground transition-all cursor-pointer"
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
          <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>
    </div>
  );
}
