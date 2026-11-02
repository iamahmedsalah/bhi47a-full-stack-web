'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAcademicAnalyticsOverview,
} from '../api';
import {
  Award,
  Users,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  BookOpen,
  BarChart3,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface AnalyticsSummaryWidgetsProps {
  isAr: boolean;
  onOpenExportModal: () => void;
}

export function AnalyticsSummaryWidgets({
  isAr,
  onOpenExportModal,
}: AnalyticsSummaryWidgetsProps) {
  const overviewQuery = useQuery({
    queryKey: ['admin-comprehensive-analytics-overview'],
    queryFn: () => getAcademicAnalyticsOverview(),
    staleTime: 60 * 1000,
  });

  const data = overviewQuery.data;
  const kpis = data?.kpis;

  const staffChartData = React.useMemo(() => {
    if (!data?.staffPerformance) return [];
    return data.staffPerformance.slice(0, 8).map((s) => ({
      name: isAr ? s.staffNameAr || s.staffName : s.staffName,
      quizzes: s.quizzesCreatedCount,
      partRate: s.avgParticipationRate,
      passRate: s.avgPassRate,
    }));
  }, [data?.staffPerformance, isAr]);

  const courseChartData = React.useMemo(() => {
    if (!data?.coursePerformance) return [];
    return data.coursePerformance.slice(0, 8).map((c) => ({
      code: c.courseCode,
      name: isAr ? c.courseNameAr || c.courseName : c.courseName,
      enrolled: c.enrolledStudentsCount,
      passRate: c.overallPassRate,
      quizPass: c.avgQuizPassRate,
    }));
  }, [data?.coursePerformance, isAr]);

  if (overviewQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-border/60 bg-card/60">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <section className="space-y-6 pt-2">
      {/* Header with Title and Export Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Award className="h-5 w-5 text-teal-500" />
            <span>
              {isAr
                ? 'تحليلات الكويزات، هيئة التدريس، ونسب نجاح المواد'
                : 'Quizzes, Faculty Performance & Course Pass Rates'}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? 'متابعة شاملة لنسب دخول ونجاح الطلاب في الكويزات، ومعدلات الأداء لكل دكتور ومعيد، ونسب النجاح بالمقررات.'
              : 'Live tracking of quiz attendance, pass rates, faculty quiz counts, and course performance.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenExportModal}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-squircle text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>{isAr ? 'تصدير شيت التحليلات الشامل (.xlsx)' : 'Export Full Analytics (.xlsx)'}</span>
        </button>
      </div>

      {/* 4 Cards for Quizzes & Courses */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Quizzes */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? 'إجمالي الكويزات' : 'Total Quizzes'}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle bg-teal-500/10 text-teal-500">
              <Award className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.totalQuizzes}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isAr
              ? `${kpis.publishedQuizzes} منشور · ${kpis.activeQuizzes} نشط حالياً`
              : `${kpis.publishedQuizzes} published · ${kpis.activeQuizzes} active`}
          </p>
        </div>

        {/* Quiz Participation Rate */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? 'متوسط نسبة الدخول للكويزات' : 'Avg Quiz Participation'}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle bg-cyan-500/10 text-cyan-400">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.avgQuizParticipationRate}%
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isAr
              ? 'نسبة الطلاب الذين دخلوا وسلموا الكويزات'
              : 'Students who started and submitted assigned quizzes'}
          </p>
        </div>

        {/* Quiz Pass Rate */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? 'متوسط نسبة نجاح الكويزات' : 'Avg Quiz Pass Rate'}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.avgQuizPassRate}%
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isAr
              ? 'نسبة المجتازين لدرجة النجاح المحددة'
              : 'Students scoring at or above passing threshold'}
          </p>
        </div>

        {/* Faculty Breakdown */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? 'هيئة التدريس والمعاونة' : 'Faculty & Staff'}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle bg-purple-500/10 text-purple-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.totalStaff}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isAr
              ? `${kpis.doctorCount} دكتور · ${kpis.assistantLecturerCount} م.م · ${kpis.teachingAssistantCount} معيد`
              : `${kpis.doctorCount} Doctors · ${kpis.assistantLecturerCount} A.L. · ${kpis.teachingAssistantCount} TAs`}
          </p>
        </div>
      </div>

      {/* Recharts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Staff Quiz Counts & Pass Rate */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr
                  ? 'أداء هيئة التدريس في الكويزات'
                  : 'Faculty & TA Quiz Activity'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'عدد الكويزات المنشورة ونسبة نجاح الطلاب لكل عضو هيئة تدريس'
                  : 'Quizzes created and student pass rates by faculty member'}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-teal-500/30 bg-teal-500/10 text-teal-400">
              <BarChart3 className="h-4 w-4" />
            </span>
          </div>

          {staffChartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {isAr ? 'لا توجد بيانات كويزات لهيئة التدريس حالياً' : 'No quiz activity recorded'}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: 'rgba(51, 65, 85, 0.6)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      String(val),
                      String(name) === 'quizzes'
                        ? (isAr ? 'عدد الكويزات' : 'Quizzes Created')
                        : (isAr ? 'نسبة النجاح %' : 'Pass Rate %'),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="quizzes" fill="#0d9488" radius={[4, 4, 0, 0]} name={isAr ? 'عدد الكويزات' : 'Quizzes'} />
                  <Bar dataKey="passRate" fill="#06b6d4" radius={[4, 4, 0, 0]} name={isAr ? 'نسبة النجاح %' : 'Pass Rate %'} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Course Registered Count & Overall Pass Rate */}
        <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr
                  ? 'تسجيل المواد ونسب النجاح'
                  : 'Course Enrollment & Pass Rates'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'أعداد الطلاب المسجلين بكل مادة ونسبة النجاح المرصودة'
                  : 'Enrolled students volume and overall pass percentage per course'}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-squircle border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <BookOpen className="h-4 w-4" />
            </span>
          </div>

          {courseChartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {isAr ? 'لا توجد بيانات مقررات حالياً' : 'No course data available'}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="code" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: 'rgba(51, 65, 85, 0.6)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                    }}
                    labelFormatter={(lbl: unknown) => {
                      const item = courseChartData.find((c) => c.code === String(lbl));
                      return `${lbl} - ${item?.name || ''}`;
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      String(val),
                      String(name) === 'enrolled'
                        ? (isAr ? 'الطلاب المسجلون' : 'Enrolled Students')
                        : (isAr ? 'نسبة النجاح %' : 'Pass Rate %'),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="enrolled" fill="#8b5cf6" radius={[4, 4, 0, 0]} name={isAr ? 'الطلاب المسجلون' : 'Enrolled'} />
                  <Bar dataKey="passRate" fill="#10b981" radius={[4, 4, 0, 0]} name={isAr ? 'نسبة النجاح %' : 'Pass Rate %'} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
