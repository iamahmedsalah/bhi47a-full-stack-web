'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { Award, FileSpreadsheet, CheckSquare, Printer, Calendar, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

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

  const isEnglish = tCommon('search') === 'Search...';

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
      <div className="mx-auto max-w-4xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t('results')}</span>
          </h2>
        </div>
        <Card className="bg-card/45 backdrop-blur-sm border-border p-6 shadow-sm">
          <EmptyState
            title={isEnglish ? 'No published results' : 'النتائج لم تعلن بعد'}
            description={
              isEnglish
                ? 'Your semester results have not been published by the administration yet.'
                : 'لم يتم نشر نتائج الفصل الدراسي الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </Card>
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
    <div className="mx-auto max-w-5xl space-y-6 print:p-0 print:m-0" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Award className="h-6 w-6 text-primary" />
            <span>{t('results')}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEnglish
              ? 'View your final transcripts and semester performance'
              : 'عرض نتائج أعمال السنة والامتحانات النهائية للفصل الدراسي الحالي'}
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary px-4 py-2.5 text-xs font-semibold text-foreground transition-all cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          <span>{isEnglish ? 'Print Report' : 'طباعة الشهادة'}</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {/* GPA Estimate */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Academic Estimate' : 'التقدير العام للترم'}
              </span>
              <Award className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{cumulativePercentage}%</span>
          </Card>
        </motion.div>

        {/* Total marks */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Earned Total Marks' : 'إجمالي الدرجات'}
              </span>
              <FileSpreadsheet className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{totalAcquired} / {totalMax}</span>
          </Card>
        </motion.div>

        {/* Passed courses */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border flex flex-col justify-between h-28 relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Passed Courses' : 'المواد الناجح بها'}
              </span>
              <CheckSquare className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{passedCourses} / {groupedList.length}</span>
          </Card>
        </motion.div>
      </div>

      {/* Transcript Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <Card className="bg-card/45 backdrop-blur-sm border-border shadow-[var(--shadow-glow)] overflow-hidden p-0 print:border-none print:shadow-none relative">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {isEnglish ? 'Academic Transcript' : 'بيان الدرجات التفصيلي'}
            </h3>
            <span className="text-xs text-muted-foreground font-mono font-bold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {groupedList[0]?.academicYear} - {
                isEnglish
                  ? groupedList[0]?.semester
                  : groupedList[0]?.semester === 'first'
                  ? 'الفصل الدراسي الأول'
                  : 'الفصل الدراسي الثاني'
              }
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/10 text-muted-foreground font-bold text-start">
                  <th className="p-4 text-start">{isEnglish ? 'Course' : 'المادة'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Midterm (20)' : 'أعمال السنة (20)'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Final Exam (80)' : 'الامتحان النهائي (80)'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Total Grade (100)' : 'المجموع الكلي (100)'}</th>
                  <th className="p-4 text-end">{isEnglish ? 'Status' : 'التقدير / الحالة'}</th>
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
                  let badgeClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';

                  if (isBanned) {
                    statusText = isEnglish ? 'Banned' : 'محجوب/محروم';
                    badgeClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                  } else if (isAbsent) {
                    statusText = isEnglish ? 'Absent' : 'غائب';
                    badgeClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                  } else if (isPass) {
                    statusText = isEnglish ? 'Pass' : 'ناجح';
                    badgeClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                  } else {
                    statusText = isEnglish ? 'Fail' : 'راسب';
                    badgeClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                  }

                  return (
                    <tr key={course.courseCode} className="hover:bg-secondary/25 transition-colors text-foreground">
                      <td className="p-4 text-start">
                        <span className="font-bold block text-sm text-foreground">{course.courseName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">{course.courseCode}</span>
                      </td>
                      <td className="p-4 text-center font-mono font-semibold">
                        {course.midterm ? (
                          course.midterm.status === 'present' ? `${course.midterm.grade} / ${course.midterm.maxGrade}` : (isEnglish ? 'Absent' : 'غائب')
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center font-mono font-semibold">
                        {course.final ? (
                          course.final.status === 'present' ? `${course.final.grade} / ${course.final.maxGrade}` : (isEnglish ? 'Absent' : 'غائب')
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-foreground">
                        {total} / {maxTotal}
                      </td>
                      <td className="p-4 text-end">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>
    </div>
  );
}
