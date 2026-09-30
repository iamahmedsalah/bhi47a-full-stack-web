'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { FileText, ChevronDown, ChevronUp, CheckCircle2, Award, Calendar, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  const isEnglish = tCommon('search') === 'Search...';

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
      <div className="mx-auto max-w-4xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            <span>{t('quizzes')}</span>
          </h2>
        </div>
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
          <EmptyState
            title={isEnglish ? 'No quiz records found' : 'لا توجد سجلات اختبارات'}
            description={
              isEnglish
                ? 'Your quiz and class assignment grades have not been uploaded by the administration yet.'
                : 'لم يتم رفع درجات الكويزات أو التكليفات العملية الخاصة بك من قبل الإدارة بعد.'
            }
          />
        </Card>
      </div>
    );
  }

  const totalQuizScore = items.reduce((acc, curr) => acc + curr.totalGrade, 0);
  const totalMaxScore = items.reduce((acc, curr) => acc + curr.maxTotalGrade, 0);
  const overallPercentage = totalMaxScore > 0 ? Math.round((totalQuizScore / totalMaxScore) * 100) : 0;
  const totalCourses = items.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* Title */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileText className="h-6 w-6 text-primary" />
          <span>{t('quizzes')}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? 'View your quiz results, practical tasks, and monthly exam performance'
            : 'تابع نتائج اختباراتك القصيرة (الكويزات)، التكليفات العملية، وتقييمات الشهر المعتمدة'}
        </p>
      </div>

      {/* Summary widgets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Overall Performance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Overall Performance' : 'معدل الأداء العام'}
              </span>
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{overallPercentage}%</span>
          </Card>
        </motion.div>

        {/* Total Points */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Total Points Earned' : 'مجموع الدرجات'}
              </span>
              <Award className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{totalQuizScore} / {totalMaxScore}</span>
          </Card>
        </motion.div>

        {/* Graded Courses */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Graded Courses' : 'المواد المقيمة'}
              </span>
              <FileText className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{totalCourses}</span>
          </Card>
        </motion.div>
      </div>

      {/* Course Quiz List */}
      <div className="space-y-4">
        {items.map((course, idx) => {
          const isExpanded = !!expandedCourses[course._id];
          return (
            <motion.div
              key={course._id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Card className="bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 overflow-hidden p-0">
                {/* Header block */}
                <div
                  onClick={() => toggleExpand(course._id)}
                  className="flex cursor-pointer items-center justify-between p-4 hover:bg-secondary/40 transition-all select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <FileText className="h-5.5 w-5.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground leading-snug">{course.courseName}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{course.courseCode}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-end">
                      <span className="text-sm font-bold text-foreground block font-mono">
                        {course.totalGrade} / {course.maxTotalGrade}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        ({course.percentage}%)
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expansion Details */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border bg-secondary/15 p-5 space-y-4">
                        {course.quizzes.length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-4">
                            {isEnglish
                              ? 'No individual quizzes graded for this course yet.'
                              : 'لا توجد كويزات فردية مسجلة لهذه المادة بعد.'}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-start text-xs">
                              <thead>
                                <tr className="border-b border-border/80 text-muted-foreground font-bold pb-2 text-start">
                                  <th className="pb-3 text-start">{isEnglish ? 'Quiz Title' : 'اسم الاختبار'}</th>
                                  <th className="pb-3 text-center">{isEnglish ? 'Status' : 'الحضور'}</th>
                                  <th className="pb-3 text-center">{isEnglish ? 'Grade' : 'الدرجة'}</th>
                                  <th className="pb-3 text-end">{isEnglish ? 'Date' : 'التاريخ'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {course.quizzes.map((quiz, index) => (
                                  <tr key={index} className="text-foreground hover:bg-secondary/25 transition-colors">
                                    <td className="py-3 text-start font-bold text-foreground">{quiz.title}</td>
                                    <td className="py-3 text-center">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${quiz.status === 'present'
                                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                                          }`}
                                      >
                                        {isEnglish
                                          ? quiz.status
                                          : quiz.status === 'present'
                                            ? 'حاضر'
                                            : 'غائب'}
                                      </span>
                                    </td>
                                    <td className="py-3 text-center font-mono font-bold text-foreground">
                                      {quiz.status === 'present' ? `${quiz.grade} / ${quiz.maxGrade}` : '—'}
                                    </td>
                                    <td className="py-3 text-end text-muted-foreground font-mono inline-flex items-center gap-1 mt-1 justify-end">
                                      <Calendar className="w-3 h-3 text-muted-foreground" />
                                      {quiz.date
                                        ? new Date(quiz.date).toLocaleDateString(isEnglish ? 'en-US' : 'ar-EG')
                                        : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
