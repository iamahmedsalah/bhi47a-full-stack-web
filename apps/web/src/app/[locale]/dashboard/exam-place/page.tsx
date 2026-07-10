'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { MapPin, Info, HelpCircle, CheckCircle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface ExamAssignmentResponse {
  seatNumber: string | null;
  examRoom: string | null;
  examFloor: string | null;
  examBuilding: string | null;
  schedules?: unknown[];
}

export default function StudentExamPlacePage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');

  const assignmentQuery = useQuery({
    queryKey: ['student-exam-assignment'],
    queryFn: async () => {
      const res = await api.get<ExamAssignmentResponse>('/students/me/exam-assignment');
      return res.data;
    },
  });

  const isEnglish = tCommon('search') === 'Search...';

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

  const data = assignmentQuery.data;
  const hasPlacement = data?.seatNumber || data?.examRoom || data?.examBuilding;

  if (!data || !hasPlacement) {
    return (
      <div className="mx-auto max-w-4xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MapPin className="h-6 w-6 text-primary" />
            <span>{t('examPlace')}</span>
          </h2>
        </div>
        <Card className="bg-card/45 backdrop-blur-sm border-border p-6 shadow-sm">
          <EmptyState
            title={isEnglish ? 'No exam place assigned' : 'أماكن اللجان لم تعلن بعد'}
            description={
              isEnglish
                ? 'Your seating assignment and exam hall details have not been published by the administration yet.'
                : 'لم يتم تخصيص رقم جلوس أو لجنة امتحانات لك حالياً، يرجى مراجعة إدارة الامتحانات أو الانتظار حتى نشر اللجان رسمياً.'
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MapPin className="h-6 w-6 text-primary" />
          <span>{t('examPlace')}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'Find your assigned seat number, building, floor, and exam room/committee'
            : 'اعرف رقم جلوسك، مبنى الامتحان، الدور، واسم قاعة اللجنة المخصصة لك'}
        </p>
      </div>

      {/* Visual Placement Board */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Seat Number */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Seat Number' : 'رقم الجلوس'}
              </span>
              <Info className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{data.seatNumber || '—'}</span>
          </Card>
        </motion.div>

        {/* Committee/Room */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Committee/Room' : 'اللجنة / القاعة'}
              </span>
              <MapPin className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground truncate">{data.examRoom || '—'}</span>
          </Card>
        </motion.div>

        {/* Building */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Building' : 'المبنى'}
              </span>
              <MapPin className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground truncate">{data.examBuilding || '—'}</span>
          </Card>
        </motion.div>

        {/* Floor */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Floor' : 'الدور'}
              </span>
              <MapPin className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground truncate">{data.examFloor || '—'}</span>
          </Card>
        </motion.div>
      </div>

      {/* Detailed Ticket Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-[var(--shadow-glow)] space-y-6 relative overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isEnglish ? 'Official Seating Ticket' : 'بطاقة تفاصيل مقر اللجنة'}
              </h3>
              <p className="text-xs text-muted-foreground">{isEnglish ? 'Show this ticket to invigilators if requested' : 'قم بإظهار هذه البطاقة للمراقبين عند الطلب'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 border-b border-border pb-5">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block font-semibold">
                {isEnglish ? 'Allocated Building' : 'مقر مبنى الامتحان'}
              </span>
              <span className="text-sm font-bold text-foreground">{data.examBuilding || '—'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block font-semibold">
                {isEnglish ? 'Floor & Section' : 'الدور والقسم'}
              </span>
              <span className="text-sm font-bold text-foreground">{data.examFloor || '—'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block font-semibold">
                {isEnglish ? 'Committee Room' : 'اسم القاعة / المدرج'}
              </span>
              <span className="text-sm font-bold text-primary">{data.examRoom || '—'}</span>
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-foreground">
            <p className="font-bold text-primary mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {isEnglish ? 'Seating Seat Number:' : 'تأكيد رقم الجلوس:'}
            </p>
            <p className="text-muted-foreground">
              {isEnglish
                ? `You are assigned seat number ${data.seatNumber || '—'}. Please make sure you write this number correctly on all your answer sheets.`
                : `رقم جلوسك المعتمد هو (${data.seatNumber || '—'}). يرجى التأكد من كتابة هذا الرقم بدقة متناهية على غلاف كراسة الإجابة الخاصة بك.`}
            </p>
          </div>
          <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>

      {/* Seating Regulations */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold text-sm border-b border-border pb-3">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span>{isEnglish ? 'Student Exam Regulations' : 'تعليمات وتوجيهات لجان الامتحانات'}</span>
          </div>
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              {isEnglish
                ? '• Arrive at the exam committee location at least 15 minutes before the exam starts.'
                : '• يجب الحضور إلى مقر اللجنة وقاعة الامتحانات قبل موعد بدء الامتحان بـ 15 دقيقة على الأقل.'}
            </p>
            <p>
              {isEnglish
                ? '• Bring your student ID card or national identity card to verify your identity.'
                : '• يلزم إحضار كارنيه المعهد الجامعي أو بطاقة الرقم القومي لإثبات الشخصية عند الدخول.'}
            </p>
            <p>
              {isEnglish
                ? '• Smartwatches, mobile phones, and electronic communication devices are strictly prohibited inside the exam hall.'
                : '• يُمنع منعاً باتاً إدخال الساعات الذكية والهواتف المحمولة أو أي أجهزة اتصال لاسلكية داخل قاعات الامتحان.'}
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
