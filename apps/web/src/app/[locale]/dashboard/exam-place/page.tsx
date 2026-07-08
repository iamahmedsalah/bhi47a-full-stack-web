'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { StatBlock } from '@/components/ui/stat-block';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { MapPin, Info, HelpCircle, CheckCircle } from 'lucide-react';

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
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MapPin className="h-6 w-6 text-primary" />
            <span>{t('examPlace')}</span>
          </h2>
        </div>
        <GlassCard glow>
          <EmptyState
            title={
              tCommon('search') === 'Search...'
                ? 'No exam place assigned'
                : 'أماكن اللجان لم تعلن بعد'
            }
            description={
              tCommon('search') === 'Search...'
                ? 'Your seating assignment and exam hall details have not been published by the administration yet.'
                : 'لم يتم تخصيص رقم جلوس أو لجنة امتحانات لك حالياً، يرجى مراجعة إدارة الامتحانات أو الانتظار حتى نشر اللجان رسمياً.'
            }
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-8">
      {/* Title */}
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MapPin className="h-6 w-6 text-primary" />
          <span>{t('examPlace')}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'Find your assigned seat number, building, floor, and exam room/committee'
            : 'اعرف رقم جلوسك، مبنى الامتحان، الدور، واسم قاعة اللجنة المخصصة لك'}
        </p>
      </div>

      {/* Visual Placement Board */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Seat Number' : 'رقم الجلوس'}
          value={data.seatNumber || '—'}
          icon={<Info className="h-6 w-6" />}
          color="#31a8c9"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Exam Committee/Room' : 'اللجنة / القاعة'}
          value={data.examRoom || '—'}
          icon={<MapPin className="h-6 w-6" />}
          color="#8b5cf6"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Building' : 'المبنى'}
          value={data.examBuilding || '—'}
          icon={<MapPin className="h-6 w-6" />}
          color="#f6c344"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Floor' : 'الدور'}
          value={data.examFloor || '—'}
          icon={<MapPin className="h-6 w-6" />}
          color="#22c55e"
        />
      </div>

      {/* Detailed Ticket Card */}
      <GlassCard glow className="space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <CheckCircle className="h-6 w-6 text-primary shrink-0" />
          <h3 className="text-base font-bold text-foreground">
            {tCommon('search') === 'Search...' ? 'Official Seating Ticket' : 'بطاقة تفاصيل مقر اللجنة'}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground block">
              {tCommon('search') === 'Search...' ? 'Allocated Building' : 'مقر مبنى الامتحان'}
            </span>
            <span className="text-sm font-bold text-foreground">{data.examBuilding || '—'}</span>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground block">
              {tCommon('search') === 'Search...' ? 'Floor & Section' : 'الدور والقسم'}
            </span>
            <span className="text-sm font-bold text-foreground">{data.examFloor || '—'}</span>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground block">
              {tCommon('search') === 'Search...' ? 'Committee Room' : 'اسم القاعة / المدرج'}
            </span>
            <span className="text-sm font-bold text-foreground text-primary">{data.examRoom || '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-slate-300">
          <p className="font-bold text-primary mb-1">
            {tCommon('search') === 'Search...' ? 'Seating Seat Number:' : 'تأكيد رقم الجلوس:'}
          </p>
          <p>
            {tCommon('search') === 'Search...'
              ? `You are assigned seat number ${data.seatNumber || '—'}. Please make sure you write this number correctly on all your answer sheets.`
              : `رقم جلوسك المعتمد هو (${data.seatNumber || '—'}). يرجى التأكد من كتابة هذا الرقم بدقة متناهية على غلاف كراسة الإجابة الخاصة بك.`}
          </p>
        </div>
      </GlassCard>

      {/* Seating Regulations */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-bold text-sm">
          <HelpCircle className="h-5 w-5 text-accent" />
          <span>{tCommon('search') === 'Search...' ? 'Student Exam Regulations' : 'تعليمات وتوجيهات لجان الامتحانات'}</span>
        </div>
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            {tCommon('search') === 'Search...'
              ? '• Arrive at the exam committee location at least 15 minutes before the exam starts.'
              : '• يجب الحضور إلى مقر اللجنة وقاعة الامتحانات قبل موعد بدء الامتحان بـ 15 دقيقة على الأقل.'}
          </p>
          <p>
            {tCommon('search') === 'Search...'
              ? '• Bring your student ID card or national identity card to verify your identity.'
              : '• يلزم إحضار كارنيه المعهد الجامعي أو بطاقة الرقم القومي لإثبات الشخصية عند الدخول.'}
          </p>
          <p>
            {tCommon('search') === 'Search...'
              ? '• Smartwatches, mobile phones, and electronic communication devices are strictly prohibited inside the exam hall.'
              : '• يُمنع منعاً باتاً إدخال الساعات الذكية والهواتف المحمولة أو أي أجهزة اتصال لاسلكية داخل قاعات الامتحان.'}
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
