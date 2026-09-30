'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/feedback';
import { Award, FileSpreadsheet, CheckSquare, Printer, Calendar, Sparkles, Download, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  downloadResultCertificatePdf,
  openResultCertificate,
  type ResultCertificateData,
} from '@/lib/result-certificate';

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
  creditHours?: number;
  academicLevel: '1' | '2' | '3' | '4';
  courseNameAr?: string;
  courseNameEn?: string;
}

interface CourseGradesGroup {
  courseCode: string;
  courseName: string;
  academicYear: string;
  semester: string;
  creditHours: number;
  academicLevel: '1' | '2' | '3' | '4';
  midterm?: { grade: number; maxGrade: number; status: string };
  final?: { grade: number; maxGrade: number; status: string };
}

interface StudentAcademicSummary {
  level: string;
}

function calculateGroupStats(groups: CourseGradesGroup[]) {
  let acquired = 0;
  let maximum = 0;
  let passed = 0;
  let weightedPoints = 0;
  let credits = 0;

  for (const group of groups) {
    const midterm = group.midterm?.status === 'present' ? group.midterm.grade : 0;
    const final = group.final?.status === 'present' ? group.final.grade : 0;
    const maxMidterm = group.midterm?.maxGrade ?? 0;
    const maxFinal = group.final?.maxGrade ?? 0;
    const maxTotal = maxMidterm + maxFinal;
    const percentage = maxTotal > 0 ? ((midterm + final) / maxTotal) * 100 : 0;
    acquired += midterm + final;
    maximum += maxTotal;
    if (percentage >= 50 && group.final?.status === 'present') passed += 1;
    if (group.final) {
      weightedPoints += Math.min(4, Math.max(0, percentage / 25)) * group.creditHours;
      credits += group.creditHours;
    }
  }

  return {
    acquired,
    maximum,
    passed,
    percentage: maximum > 0 ? Math.round((acquired / maximum) * 100) : 0,
    gpa: credits > 0 ? Math.round((weightedPoints / credits) * 100) / 100 : 0,
  };
}

export default function StudentResultsPage() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale === 'en' ? 'en' : 'ar';
  const isEnglish = locale === 'en';
  const { user } = useAuth();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [selectedLevel, setSelectedLevel] = React.useState('');

  const resultsQuery = useQuery({
    queryKey: ['student-results'],
    queryFn: async () => {
      const res = await api.get<Grade[]>('/students/me/results');
      return res.data;
    },
  });

  const profileQuery = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const res = await api.get<StudentAcademicSummary>('/students/me/profile');
      return res.data;
    },
  });

  const resultLevels = React.useMemo(
    () =>
      [...new Set((resultsQuery.data ?? []).map((grade) => grade.academicLevel))].sort(
        (a, b) => Number(a) - Number(b),
      ),
    [resultsQuery.data],
  );
  const availableLevels = React.useMemo(() => {
    const levels = new Set(resultLevels);
    if (profileQuery.data?.level) levels.add(profileQuery.data.level as Grade['academicLevel']);
    return [...levels].sort((a, b) => Number(a) - Number(b));
  }, [profileQuery.data?.level, resultLevels]);

  React.useEffect(() => {
    if (selectedLevel && availableLevels.includes(selectedLevel as Grade['academicLevel'])) return;
    const current = profileQuery.data?.level;
    setSelectedLevel(
      (current && availableLevels.includes(current as Grade['academicLevel'])
        ? current
        : availableLevels.at(-1)) ?? '',
    );
  }, [availableLevels, profileQuery.data?.level, selectedLevel]);

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
        <Card className="p-6 bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
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
    const groupKey = `${g.academicLevel}:${g.academicYear}:${g.semester}:${g.courseCode}`;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        courseCode: g.courseCode,
        courseName:
          (isEnglish ? g.courseNameEn : g.courseNameAr) || g.courseName,
        academicYear: g.academicYear,
        semester: g.semester,
        creditHours: g.creditHours ?? 1,
        academicLevel: g.academicLevel,
      };
    }
    if (g.examType === 'midterm') {
      groups[groupKey].midterm = { grade: g.grade, maxGrade: g.maxGrade, status: g.status };
    } else if (g.examType === 'final') {
      groups[groupKey].final = { grade: g.grade, maxGrade: g.maxGrade, status: g.status };
    }
  });

  const groupedList = Object.values(groups);

  const cumulativeStats = calculateGroupStats(groupedList);
  const totalAcquired = cumulativeStats.acquired;
  const totalMax = cumulativeStats.maximum;
  const passedCourses = cumulativeStats.passed;
  const cumulativePercentage = cumulativeStats.percentage;
  const calculatedGpa = cumulativeStats.gpa;
  const selectedLevelGroups = groupedList.filter(
    (group) => group.academicLevel === selectedLevel,
  );
  const selectedLevelStats = calculateGroupStats(selectedLevelGroups);
  const semesterSections = (['first', 'second', 'summer'] as const)
    .map((semester) => {
      const semesterGroups = selectedLevelGroups
        .filter((group) => group.semester === semester)
        .sort((a, b) =>
          a.academicYear === b.academicYear
            ? a.courseCode.localeCompare(b.courseCode)
            : a.academicYear.localeCompare(b.academicYear),
        );
      return {
        semester,
        groups: semesterGroups,
        stats: calculateGroupStats(semesterGroups),
        academicYears: [...new Set(semesterGroups.map((group) => group.academicYear))],
      };
    })
    .filter((section) => section.groups.length > 0);

  const semesterName = (semester: string) => {
    if (isEnglish) {
      if (semester === 'first') return 'First Semester';
      if (semester === 'second') return 'Second Semester';
      return 'Summer Semester';
    }
    if (semester === 'first') return 'الفصل الدراسي الأول';
    if (semester === 'second') return 'الفصل الدراسي الثاني';
    return 'الفصل الدراسي الصيفي';
  };

  const semesterValue = groupedList[0]?.semester ?? '';
  const semesterLabel = isEnglish
    ? semesterValue === 'first'
      ? 'First Semester'
      : semesterValue === 'second'
        ? 'Second Semester'
        : 'Summer Semester'
    : semesterValue === 'first'
      ? 'الفصل الدراسي الأول'
      : semesterValue === 'second'
        ? 'الفصل الدراسي الثاني'
        : 'الفصل الدراسي الصيفي';

  const certificateData: ResultCertificateData = {
    locale,
    studentName: user?.name ?? (isEnglish ? 'Student' : 'الطالب'),
    studentCode: user?.studentCode ?? '—',
    academicYear: groupedList[0]?.academicYear ?? '—',
    semester: semesterLabel,
    totalAcquired,
    totalMax,
    percentage: cumulativePercentage,
    gpa: calculatedGpa,
    passedCourses,
    issuedAt: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'long',
    }).format(new Date()),
    courses: groupedList.map((course) => {
      const midtermGrade = course.midterm?.status === 'present' ? course.midterm.grade : 0;
      const finalGrade = course.final?.status === 'present' ? course.final.grade : 0;
      const maxMidterm = course.midterm?.maxGrade ?? 0;
      const maxFinal = course.final?.maxGrade ?? 0;
      const total = midtermGrade + finalGrade;
      const maxTotal = maxMidterm + maxFinal;
      const isBanned = course.final?.status === 'banned' || course.midterm?.status === 'banned';
      const isAbsent = course.final?.status === 'absent' || course.midterm?.status === 'absent';
      const isPassed = total >= maxTotal / 2 && course.final?.status === 'present';
      const status = isBanned
        ? isEnglish ? 'Banned' : 'محروم'
        : isAbsent
          ? isEnglish ? 'Absent' : 'غائب'
          : isPassed
            ? isEnglish ? 'Pass' : 'ناجح'
            : isEnglish ? 'Fail' : 'راسب';
      const absent = isEnglish ? 'Absent' : 'غائب';

      return {
        code: course.courseCode,
        name: course.courseName,
        midterm: course.midterm?.status === 'present'
          ? `${course.midterm.grade} / ${course.midterm.maxGrade}`
          : course.midterm ? absent : '—',
        final: course.final?.status === 'present'
          ? `${course.final.grade} / ${course.final.maxGrade}`
          : course.final ? absent : '—',
        total: `${total} / ${maxTotal}`,
        status,
      };
    }),
  };

  const handlePrint = () => {
    if (!openResultCertificate(certificateData)) {
      toast.error(
        isEnglish
          ? 'Allow pop-ups to open the certificate.'
          : 'يرجى السماح بالنوافذ المنبثقة لفتح الشهادة.',
      );
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const downloaded = await downloadResultCertificatePdf(certificateData);
      if (!downloaded) throw new Error('Certificate generation failed');
    } catch {
      toast.error(
        isEnglish
          ? 'The certificate PDF could not be generated.'
          : 'تعذر إنشاء ملف PDF للشهادة.',
      );
    } finally {
      setIsDownloading(false);
    }
  };

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

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary px-4 py-2.5 text-xs font-semibold text-foreground transition-all cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{isEnglish ? 'Print certificate' : 'طباعة الشهادة'}</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/85 disabled:opacity-60 px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-all cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>
              {isDownloading
                ? isEnglish ? 'Preparing PDF...' : 'جارٍ تجهيز PDF...'
                : isEnglish ? 'Download PDF' : 'تنزيل PDF'}
            </span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Cumulative GPA' : 'المعدل التراكمي'}
              </span>
              <GraduationCap className="h-4.5 w-4.5 text-violet-400" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{calculatedGpa.toFixed(2)} / 4.00</span>
          </Card>
        </motion.div>
        {/* GPA Estimate */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? `Level ${selectedLevel} GPA` : `المعدل للمستوى ${selectedLevel}`}
              </span>
              <Award className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{selectedLevelStats.gpa.toFixed(2)} / 4.00</span>
          </Card>
        </motion.div>

        {/* Total marks */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Level Performance' : 'تقدير المستوى'}
              </span>
              <FileSpreadsheet className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{selectedLevelStats.percentage}%</span>
          </Card>
        </motion.div>

        {/* Passed courses */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
          <Card className="p-5 bg-card/45 backdrop-blur-sm border-border/70 flex flex-col justify-between h-28 relative overflow-hidden shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase text-muted-foreground">
                {isEnglish ? 'Passed Courses' : 'المواد الناجح بها'}
              </span>
              <CheckSquare className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="text-2xl font-black font-mono text-foreground">{selectedLevelStats.passed} / {selectedLevelGroups.length}</span>
          </Card>
        </motion.div>
      </div>

      <Tabs value={selectedLevel} onValueChange={setSelectedLevel} className="print:hidden">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl border border-border bg-card/45 p-2">
          {availableLevels.map((level) => {
            const currentLevel = profileQuery.data?.level ?? selectedLevel;
            const isPast = Number(level) < Number(currentLevel);
            const isCurrent = level === currentLevel;
            return (
              <TabsTrigger
                key={level}
                value={level}
                className="gap-2 rounded-xl border border-transparent px-4 py-2 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10"
              >
                <span>{isEnglish ? `Level ${level}` : `المستوى ${level}`}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                  {isCurrent
                    ? isEnglish ? 'Current' : 'الحالي'
                    : isPast
                      ? isEnglish ? 'Past' : 'سابق'
                      : isEnglish ? 'Upcoming' : 'قادم'}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Transcript Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <Card className="bg-card/45 backdrop-blur-sm border-border/70 shadow-[var(--shadow-glow)] hover:border-primary/30 transition-all duration-300 overflow-hidden p-0 print:border-none print:shadow-none relative">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {isEnglish ? `Level ${selectedLevel} Academic Transcript` : `بيان درجات المستوى ${selectedLevel}`}
            </h3>
            <span className="text-xs text-muted-foreground font-mono font-bold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {isEnglish ? 'Level GPA' : 'معدل المستوى'}: {selectedLevelStats.gpa.toFixed(2)} / 4.00
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/10 text-muted-foreground font-bold text-start">
                  <th className="p-4 text-start">{isEnglish ? 'Course' : 'المادة'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Coursework' : 'أعمال السنة'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Final Exam' : 'الامتحان النهائي'}</th>
                  <th className="p-4 text-center">{isEnglish ? 'Total Grade' : 'المجموع الكلي'}</th>
                  <th className="p-4 text-end">{isEnglish ? 'Status' : 'التقدير / الحالة'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {semesterSections.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      {isEnglish
                        ? `No published results are available for Level ${selectedLevel} yet.`
                        : `لا توجد نتائج منشورة للمستوى ${selectedLevel} حتى الآن.`}
                    </td>
                  </tr>
                )}
                {semesterSections.map((section) => (
                  <React.Fragment key={section.semester}>
                    <tr className="border-y border-primary/25 bg-primary/5">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-5 w-1 rounded-full bg-primary" />
                            <span className="font-black text-foreground">
                              {semesterName(section.semester)}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {section.academicYears.join(', ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[10px] font-bold">
                            <span className="rounded-lg border border-border bg-card/70 px-2.5 py-1 text-foreground">
                              {isEnglish ? 'Semester GPA' : 'معدل الفصل'}: {section.stats.gpa.toFixed(2)}
                            </span>
                            <span className="text-muted-foreground">
                              {section.stats.passed}/{section.groups.length} {isEnglish ? 'passed' : 'ناجح'}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {section.groups.map((course) => {
                      const midVal = course.midterm?.status === 'present' ? course.midterm.grade : 0;
                      const finalVal = course.final?.status === 'present' ? course.final.grade : 0;
                      const total = midVal + finalVal;

                      const maxMid = course.midterm?.maxGrade ?? 0;
                      const maxFin = course.final?.maxGrade ?? 0;
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
                        <tr key={`${course.academicYear}:${course.semester}:${course.courseCode}`} className="hover:bg-secondary/25 transition-colors text-foreground">
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
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="absolute -right-20 -top-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        </Card>
      </motion.div>
    </div>
  );
}
