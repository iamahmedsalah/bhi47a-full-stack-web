'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { GlassCard } from '@/components/ui/glass-card';
import { StatBlock } from '@/components/ui/stat-block';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { FileText, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';

interface QuizEntry {
  quizNumber: number;
  title: string;
  grade: number;
  maxGrade: number;
  status: 'present' | 'absent' | 'banned';
  date?: string;
}

interface CourseQuiz {
  _id: string;
  courseName: string;
  courseCode: string;
  academicYear: string;
  semester: string;
  quizzes: QuizEntry[];
  totalGrade: number;
  maxTotalGrade: number;
  percentage: number;
}

export default function StudentQuizzesPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  const quizzesQuery = useQuery({
    queryKey: ['student-quizzes'],
    queryFn: async () => {
      const res = await api.get<CourseQuiz[]>('/students/me/course-quizzes');
      return res.data;
    },
  });

  const toggleExpand = (courseId: string) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  };

  if (quizzesQuery.isLoading) {
    return <LoadingState title={tCommon('loading')} />;
  }

  if (quizzesQuery.isError) {
    return (
      <ErrorState
        description={getApiErrorMessage(quizzesQuery.error)}
        error={quizzesQuery.error}
        onRetry={() => quizzesQuery.refetch()}
      />
    );
  }

  const items = quizzesQuery.data || [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            <span>{t('quizzes')}</span>
          </h2>
        </div>
        <GlassCard glow>
          <EmptyState
            title={
              tCommon('search') === 'Search...'
                ? 'No quiz records found'
                : 'لا توجد سجلات كويزات'
            }
            description={
              tCommon('search') === 'Search...'
                ? 'Your quiz and class assignment grades have not been uploaded by the administration yet.'
                : 'لم يتم رفع درجات الكويزات أو التكليفات العملية الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </GlassCard>
      </div>
    );
  }

  // Calculate some overview statistics
  const totalQuizScore = items.reduce((acc, curr) => acc + curr.totalGrade, 0);
  const totalMaxScore = items.reduce((acc, curr) => acc + curr.maxTotalGrade, 0);
  const overallPercentage = totalMaxScore > 0 ? Math.round((totalQuizScore / totalMaxScore) * 100) : 0;
  const totalCourses = items.length;

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-8">
      {/* Title */}
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileText className="h-6 w-6 text-primary" />
          <span>{t('quizzes')}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {tCommon('search') === 'Search...'
            ? 'View your quiz results, practical tasks, and monthly exam performance'
            : 'تابع نتائج اختباراتك القصيرة (الكويزات)، التكليفات العملية، وتقييمات الشهر'}
        </p>
      </div>

      {/* Summary widgets */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Overall Performance' : 'معدل الأداء العام'}
          value={`${overallPercentage}%`}
          icon={<CheckCircle2 className="h-6 w-6" />}
          color={overallPercentage >= 85 ? '#22c55e' : overallPercentage >= 65 ? '#f6c344' : '#ef4444'}
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Total Points Earned' : 'مجموع الدرجات الحاصل عليها'}
          value={`${totalQuizScore} / ${totalMaxScore}`}
          icon={<FileText className="h-6 w-6" />}
          color="#31a8c9"
        />
        <StatBlock
          title={tCommon('search') === 'Search...' ? 'Graded Courses' : 'المواد المقيمة'}
          value={totalCourses}
          icon={<FileText className="h-6 w-6" />}
          color="#8b5cf6"
        />
      </div>

      {/* Course Quiz List */}
      <div className="space-y-4">
        {items.map((course) => {
          const isExpanded = !!expandedCourses[course._id];
          return (
            <GlassCard key={course._id} glow className="overflow-hidden p-0">
              {/* Header block */}
              <div
                onClick={() => toggleExpand(course._id)}
                className="flex cursor-pointer items-center justify-between p-5 hover:bg-surface/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">{course.courseName}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{course.courseCode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-end">
                    <span className="text-sm font-bold text-foreground block">
                      {course.totalGrade} / {course.maxTotalGrade}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({course.percentage}%)
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted" />
                  )}
                </div>
              </div>

              {/* Expansion Details */}
              {isExpanded && (
                <div className="border-t border-border bg-surface/10 p-5 space-y-4">
                  {course.quizzes.length === 0 ? (
                    <p className="text-center text-sm text-muted py-4">
                      {tCommon('search') === 'Search...'
                        ? 'No individual quizzes graded for this course yet.'
                        : 'لا توجد كويزات فردية مسجلة لهذه المادة بعد.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-start text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted font-medium pb-2 text-start">
                            <th className="pb-3 text-start">{tCommon('search') === 'Search...' ? 'Quiz Title' : 'اسم الاختبار'}</th>
                            <th className="pb-3 text-center">{tCommon('search') === 'Search...' ? 'Status' : 'الحضور'}</th>
                            <th className="pb-3 text-center">{tCommon('search') === 'Search...' ? 'Grade' : 'الدرجة'}</th>
                            <th className="pb-3 text-end">{tCommon('search') === 'Search...' ? 'Date' : 'التاريخ'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {course.quizzes.map((quiz, index) => (
                            <tr key={index} className="text-foreground">
                              <td className="py-3 text-start font-medium">{quiz.title}</td>
                              <td className="py-3 text-center">
                                <span
                                  className={`badge ${
                                    quiz.status === 'present'
                                      ? 'badge-success'
                                      : 'badge-danger'
                                  }`}
                                >
                                  {tCommon('search') === 'Search...'
                                    ? quiz.status
                                    : quiz.status === 'present'
                                    ? 'حاضر'
                                    : 'غائب'}
                                </span>
                              </td>
                              <td className="py-3 text-center font-mono font-semibold">
                                {quiz.status === 'present' ? `${quiz.grade} / ${quiz.maxGrade}` : '—'}
                              </td>
                              <td className="py-3 text-end text-muted-foreground font-mono">
                                {quiz.date
                                  ? new Date(quiz.date).toLocaleDateString('ar-EG')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
