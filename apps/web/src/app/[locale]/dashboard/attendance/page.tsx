'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { ClipboardList, Calendar, CheckCircle, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

interface AttendanceRecord {
  _id: string;
  studentId: string;
  studentCode: string;
  academicYear: string;
  semester: 'first' | 'second' | 'summer';
  totalLectures: number;
  attendedLectures: number;
  absenceLectures: number;
  attendancePercentage: number;
}

export default function StudentAttendancePage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');

  const attendanceQuery = useQuery({
    queryKey: ['student-attendance'],
    queryFn: async () => {
      const res = await api.get<AttendanceRecord[]>('/students/me/attendance');
      return res.data;
    },
  });

  const isEnglish = tCommon('search') === 'Search...';

  if (attendanceQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (attendanceQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(attendanceQuery.error)}
        error={attendanceQuery.error}
        onRetry={() => attendanceQuery.refetch()}
      />
    );
  }

  const records = attendanceQuery.data || [];

  if (records.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ClipboardList className="h-6 w-6 text-primary" />
            <span>{t('attendance')}</span>
          </h2>
        </div>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <EmptyState
            title={isEnglish ? 'No attendance records' : 'لا توجد سجلات حضور وغياب'}
            description={
              isEnglish
                ? 'Your attendance statistics have not been uploaded by the administration yet.'
                : 'لم يتم رفع إحصائيات الغياب والحضور الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </Card>
      </div>
    );
  }

  const totalLecs = records.reduce((acc, curr) => acc + curr.totalLectures, 0);
  const totalAtt = records.reduce((acc, curr) => acc + curr.attendedLectures, 0);
  const totalAbs = records.reduce((acc, curr) => acc + curr.absenceLectures, 0);
  const avgPercentage = totalLecs > 0 ? Math.round((totalAtt / totalLecs) * 100) : 100;

  return (
    <div className="mx-auto max-w-5xl space-y-8" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardList className="h-6 w-6 text-primary" />
          <span>{t('attendance')}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'Track your lecture attendance and view details by semester'
            : 'تابع غيابك وحضورك للمحاضرات بالتفصيل حسب كل فصل دراسي'}
        </p>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Overall Percentage */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-32 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-muted-foreground">
                {isEnglish ? 'Overall Attendance' : 'نسبة الحضور العامة'}
              </span>
              <CheckCircle className={`h-5 w-5 ${avgPercentage >= 75 ? 'text-emerald-500' : 'text-red-500'}`} />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black font-mono text-foreground">{avgPercentage}%</span>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                {avgPercentage >= 75
                  ? (isEnglish ? 'Good standing' : 'حالة ممتازة')
                  : (isEnglish ? 'Warning: Under 75%' : 'تنبيه: أقل من 75%')}
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Total Lectures */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-32 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-muted-foreground">
                {isEnglish ? 'Total Lectures' : 'إجمالي المحاضرات'}
              </span>
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black font-mono text-foreground">{totalLecs}</span>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                {isEnglish ? 'Registered sessions' : 'المحاضرات المسجلة'}
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Attended Sessions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-32 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-muted-foreground">
                {isEnglish ? 'Attended Sessions' : 'عدد مرات الحضور'}
              </span>
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black font-mono text-emerald-500">{totalAtt}</span>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                {isEnglish ? 'Confirmed attendance' : 'المحاضرات التي تم حضورها'}
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Absence Sessions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-32 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-muted-foreground">
                {isEnglish ? 'Absence Sessions' : 'عدد مرات الغياب'}
              </span>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black font-mono text-red-500">{totalAbs}</span>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                {isEnglish ? 'Missed lectures' : 'المحاضرات الفائتة'}
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Semester details list */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">
          {isEnglish ? 'Semester Breakdown' : 'التفاصيل حسب الفصل الدراسي'}
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {records.map((record, index) => {
            const isWarning = record.attendancePercentage < 75;
            return (
              <motion.div
                key={record._id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
              >
                <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h4 className="font-bold text-foreground">
                        {isEnglish
                          ? record.semester === 'first'
                            ? 'First Semester'
                            : 'Second Semester'
                          : record.semester === 'first'
                          ? 'الفصل الدراسي الأول'
                          : 'الفصل الدراسي الثاني'}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">{record.academicYear}</p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                        record.attendancePercentage >= 75
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : record.attendancePercentage >= 60
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {record.attendancePercentage}%
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{isEnglish ? 'Progress Indicator' : 'مؤشر التقدم'}</span>
                      <span className="font-mono">{record.attendedLectures} / {record.totalLectures}</span>
                    </div>
                    <Progress value={record.attendancePercentage} className="h-2" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm pt-2">
                    <div className="bg-secondary/40 p-2 rounded-lg border border-border/50">
                      <span className="text-[10px] text-muted-foreground block font-bold">
                        {isEnglish ? 'Total' : 'المحاضرات'}
                      </span>
                      <span className="font-bold text-foreground font-mono mt-0.5 block">
                        {record.totalLectures}
                      </span>
                    </div>
                    <div className="bg-secondary/40 p-2 rounded-lg border border-border/50">
                      <span className="text-[10px] text-muted-foreground block font-bold">
                        {isEnglish ? 'Attended' : 'حضور'}
                      </span>
                      <span className="font-bold text-emerald-500 font-mono mt-0.5 block">
                        {record.attendedLectures}
                      </span>
                    </div>
                    <div className="bg-secondary/40 p-2 rounded-lg border border-border/50">
                      <span className="text-[10px] text-muted-foreground block font-bold">
                        {isEnglish ? 'Absent' : 'غياب'}
                      </span>
                      <span className="font-bold text-red-500 font-mono mt-0.5 block">
                        {record.absenceLectures}
                      </span>
                    </div>
                  </div>

                  {isWarning && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs leading-normal">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <p className="font-bold">{isEnglish ? 'Exam Suspension Risk' : 'خطر الحرمان من الامتحان'}</p>
                        <p className="mt-0.5 text-muted-foreground/90">
                          {isEnglish
                            ? 'Warning: High absence rate. You must maintain at least 75% attendance to take the final exams.'
                            : 'تنبيه: تجاوزت نسبة الغياب المسموح بها. يجب الحفاظ على 75% حضور على الأقل لدخول الامتحانات.'}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
