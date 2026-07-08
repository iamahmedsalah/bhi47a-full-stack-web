'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { StatBlock } from '@/components/ui/stat-block';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { ClipboardList, Calendar, CheckCircle, AlertTriangle } from 'lucide-react';

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
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ClipboardList className="h-6 w-6 text-primary" />
            <span>{t('attendance')}</span>
          </h2>
        </div>
        <GlassCard glow>
          <EmptyState
            title={
              tCommon('search') === 'Search...'
                ? 'No attendance records'
                : 'لا توجد سجلات حضور وغياب'
            }
            description={
              tCommon('search') === 'Search...'
                ? 'Your attendance statistics have not been uploaded by the administration yet.'
                : 'لم يتم رفع إحصائيات الغياب والحضور الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </GlassCard>
      </div>
    );
  }

  // Calculate overall/average statistics from all semesters
  const totalLecs = records.reduce((acc, curr) => acc + curr.totalLectures, 0);
  const totalAtt = records.reduce((acc, curr) => acc + curr.attendedLectures, 0);
  const totalAbs = records.reduce((acc, curr) => acc + curr.absenceLectures, 0);
  const avgPercentage = totalLecs > 0 ? Math.round((totalAtt / totalLecs) * 100) : 100;

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-8">
      {/* Title */}
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardList className="h-6 w-6 text-primary" />
          <span>{t('attendance')}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'Track your lecture attendance and view details by semester'
            : 'تابع غيابك وحضورك للمحاضرات بالتفصيل حسب كل فصل دراسي'}
        </p>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Overall Attendance' : 'نسبة الحضور العامة'}
          value={`${avgPercentage}%`}
          icon={<CheckCircle className="h-6 w-6" />}
          color={avgPercentage >= 75 ? '#22c55e' : avgPercentage >= 60 ? '#f6c344' : '#ef4444'}
          description={
            avgPercentage < 75
              ? (tCommon('search') === 'Search...' ? 'Warning: Attendance is below 75%' : 'تنبيه: نسبة الحضور أقل من 75%')
              : (tCommon('search') === 'Search...' ? 'Good standing' : 'حالة ممتازة')
          }
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Total Lectures' : 'إجمالي المحاضرات'}
          value={totalLecs}
          icon={<Calendar className="h-6 w-6" />}
          color="#31a8c9"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Attended Sessions' : 'عدد مرات الحضور'}
          value={totalAtt}
          icon={<CheckCircle className="h-6 w-6" />}
          color="#22c55e"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Absence Sessions' : 'عدد مرات الغياب'}
          value={totalAbs}
          icon={<AlertTriangle className="h-6 w-6" />}
          color="#ef4444"
        />
      </div>

      {/* Semester details list */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold text-foreground">
          {tCommon('search') === 'Search...' ? 'Semester Breakdown' : 'التفاصيل حسب الفصل الدراسي'}
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {records.map((record) => {
            const isWarning = record.attendancePercentage < 75;
            return (
              <GlassCard key={record._id} glow className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h4 className="font-bold text-foreground">
                      {tCommon('welcome') === 'Welcome'
                        ? record.semester === 'first'
                          ? 'First Semester'
                          : 'Second Semester'
                        : record.semester === 'first'
                        ? 'الفصل الدراسي الأول'
                        : 'الفصل الدراسي الثاني'}
                    </h4>
                    <p className="text-xs text-muted-foreground">{record.academicYear}</p>
                  </div>
                  <span
                    className={`badge ${
                      record.attendancePercentage >= 75
                        ? 'badge-success'
                        : record.attendancePercentage >= 60
                        ? 'badge-warning'
                        : 'badge-danger'
                    }`}
                  >
                    {record.attendancePercentage}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <span className="text-xs text-muted block mb-1">
                      {tCommon('search') === 'Search...' ? 'Total' : 'المحاضرات'}
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      {record.totalLectures}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block mb-1">
                      {tCommon('search') === 'Search...' ? 'Attended' : 'حضور'}
                    </span>
                    <span className="font-semibold text-success font-mono">
                      {record.attendedLectures}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block mb-1">
                      {tCommon('search') === 'Search...' ? 'Absent' : 'غياب'}
                    </span>
                    <span className="font-semibold text-danger font-mono">
                      {record.absenceLectures}
                    </span>
                  </div>
                </div>

                {isWarning && (
                  <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/25 p-3 text-xs text-danger">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {tCommon('search') === 'Search...'
                        ? 'Warning: High absence rate. You are at risk of exam suspension.'
                        : 'تنبيه: تجاوزت نسبة الغياب المسموح بها، قد تكون عرضة للحرمان من الامتحان.'}
                    </span>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
