'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { StatBlock } from '@/components/ui/stat-block';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { Award, FileSpreadsheet, CheckSquare, Printer } from 'lucide-react';

interface Grade {
  _id: string;
  courseCode: string;
  courseName: string;
  examType: 'midterm' | 'final';
  grade: number;
  maxGrade: number;
  status: 'present' | 'absent' | 'banned';
  academicYear: string;
  semester: string;
  isPublished: boolean;
}

interface CourseGradesGroup {
  courseCode: string;
  courseName: string;
  academicYear: string;
  semester: string;
  midterm?: { grade: number; maxGrade: number; status: string };
  final?: { grade: number; maxGrade: number; status: string };
}

export default function StudentResultsPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');

  const resultsQuery = useQuery({
    queryKey: ['student-results'],
    queryFn: async () => {
      const res = await api.get<Grade[]>('/students/me/results');
      return res.data;
    },
  });

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (resultsQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (resultsQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(resultsQuery.error)}
        error={resultsQuery.error}
        onRetry={() => resultsQuery.refetch()}
      />
    );
  }

  const grades = resultsQuery.data || [];

  if (grades.length === 0) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t('results')}</span>
          </h2>
        </div>
        <GlassCard glow>
          <EmptyState
            title={
              tCommon('search') === 'Search...'
                ? 'No published results'
                : 'النتائج لم تعلن بعد'
            }
            description={
              tCommon('search') === 'Search...'
                ? 'Your semester results have not been published by the administration yet.'
                : 'لم يتم نشر نتائج الفصل الدراسي الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </GlassCard>
      </div>
    );
  }

  // Group grades by course code
  const groups: Record<string, CourseGradesGroup> = {};
  grades.forEach((g) => {
    if (!groups[g.courseCode]) {
      groups[g.courseCode] = {
        courseCode: g.courseCode,
        courseName: g.courseName,
        academicYear: g.academicYear,
        semester: g.semester,
      };
    }
    if (g.examType === 'midterm') {
      groups[g.courseCode].midterm = { grade: g.grade, maxGrade: g.maxGrade, status: g.status };
    } else if (g.examType === 'final') {
      groups[g.courseCode].final = { grade: g.grade, maxGrade: g.maxGrade, status: g.status };
    }
  });

  const groupedList = Object.values(groups);

  // Stats calculation
  let totalAcquired = 0;
  let totalMax = 0;
  let passedCourses = 0;

  groupedList.forEach((group) => {
    const midtermGrade = group.midterm?.status === 'present' ? group.midterm.grade : 0;
    const finalGrade = group.final?.status === 'present' ? group.final.grade : 0;
    const maxMidterm = group.midterm?.maxGrade || 20;
    const maxFinal = group.final?.maxGrade || 80;

    totalAcquired += midtermGrade + finalGrade;
    totalMax += maxMidterm + maxFinal;

    const percentage = (maxMidterm + maxFinal) > 0 ? ((midtermGrade + finalGrade) / (maxMidterm + maxFinal)) * 100 : 0;
    if (percentage >= 50 && group.final?.status === 'present') {
      passedCourses++;
    }
  });

  const cumulativePercentage = totalMax > 0 ? Math.round((totalAcquired / totalMax) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-8 print:p-0 print:m-0">
      {/* Title */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t('results')}</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {tCommon('search') === 'Search...'
              ? 'View your final transcripts and semester performance'
              : 'عرض نتائج أعمال السنة والامتحانات النهائية للفصل الدراسي الحالي'}
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-hover hover:text-primary transition-all active:scale-[0.98]"
        >
          <Printer className="h-4 w-4" />
          <span>{tCommon('search') === 'Search...' ? 'Print Report' : 'طباعة الشهادة'}</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 print:grid-cols-3">
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Academic Estimate' : 'التقدير العام للترم'}
          value={`${cumulativePercentage}%`}
          icon={<Award className="h-6 w-6" />}
          color={cumulativePercentage >= 85 ? '#22c55e' : cumulativePercentage >= 65 ? '#f6c344' : '#ef4444'}
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Earned Total Marks' : 'إجمالي الدرجات'}
          value={`${totalAcquired} / ${totalMax}`}
          icon={<FileSpreadsheet className="h-6 w-6" />}
          color="#31a8c9"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Passed Courses' : 'المواد الناجح بها'}
          value={`${passedCourses} / ${groupedList.length}`}
          icon={<CheckSquare className="h-6 w-6" />}
          color="#22c55e"
        />
      </div>

      {/* Transcript Card */}
      <GlassCard glow className="overflow-hidden p-0 print:border-none print:shadow-none">
        <div className="bg-surface/50 p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground text-base">
            {tCommon('search') === 'Search...' ? 'Academic Transcript' : 'بيان الدرجات التفصيلي'}
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {groupedList[0]?.academicYear} - {
              tCommon('welcome') === 'Welcome'
                ? groupedList[0]?.semester
                : groupedList[0]?.semester === 'first'
                ? 'الفصل الدراسي الأول'
                : 'الفصل الدراسي الثاني'
            }
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/20 text-muted font-semibold">
                <th className="p-4 text-start">{tCommon('search') === 'Search...' ? 'Course' : 'المادة'}</th>
                <th className="p-4 text-center">{tCommon('search') === 'Search...' ? 'Midterm (20)' : 'أعمال السنة (20)'}</th>
                <th className="p-4 text-center">{tCommon('search') === 'Search...' ? 'Final Exam (80)' : 'الامتحان النهائي (80)'}</th>
                <th className="p-4 text-center">{tCommon('search') === 'Search...' ? 'Total Grade (100)' : 'المجموع الكلي (100)'}</th>
                <th className="p-4 text-center">{tCommon('search') === 'Search...' ? 'Status' : 'التقدير / الحالة'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {groupedList.map((course) => {
                const midVal = course.midterm?.status === 'present' ? course.midterm.grade : 0;
                const finalVal = course.final?.status === 'present' ? course.final.grade : 0;
                const total = midVal + finalVal;

                const maxMid = course.midterm?.maxGrade || 20;
                const maxFin = course.final?.maxGrade || 80;
                const maxTotal = maxMid + maxFin;

                const isPass = total >= (maxTotal / 2) && course.final?.status === 'present';
                const isAbsent = course.final?.status === 'absent' || course.midterm?.status === 'absent';
                const isBanned = course.final?.status === 'banned' || course.midterm?.status === 'banned';

                let statusText = '—';
                let badgeClass = 'badge-success';

                if (isBanned) {
                  statusText = tCommon('welcome') === 'Welcome' ? 'Banned' : 'محجوب/محروم';
                  badgeClass = 'badge-danger';
                } else if (isAbsent) {
                  statusText = tCommon('welcome') === 'Welcome' ? 'Absent' : 'غائب';
                  badgeClass = 'badge-danger';
                } else if (isPass) {
                  statusText = tCommon('welcome') === 'Welcome' ? 'Pass' : 'ناجح';
                  badgeClass = 'badge-success';
                } else {
                  statusText = tCommon('welcome') === 'Welcome' ? 'Fail' : 'راسب';
                  badgeClass = 'badge-danger';
                }

                return (
                  <tr key={course.courseCode} className="hover:bg-surface/30 transition-colors text-foreground">
                    <td className="p-4">
                      <span className="font-bold block text-sm">{course.courseName}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{course.courseCode}</span>
                    </td>
                    <td className="p-4 text-center font-mono">
                      {course.midterm ? (
                        course.midterm.status === 'present' ? `${course.midterm.grade} / ${course.midterm.maxGrade}` : (tCommon('welcome') === 'Welcome' ? 'Absent' : 'غائب')
                      ) : '—'}
                    </td>
                    <td className="p-4 text-center font-mono">
                      {course.final ? (
                        course.final.status === 'present' ? `${course.final.grade} / ${course.final.maxGrade}` : (tCommon('welcome') === 'Welcome' ? 'Absent' : 'غائب')
                      ) : '—'}
                    </td>
                    <td className="p-4 text-center font-mono font-bold">
                      {total} / {maxTotal}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`badge ${badgeClass}`}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
