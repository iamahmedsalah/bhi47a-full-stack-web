'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  HelpCircle,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { calculateGradeScale, GRADE_SCALE, type GradeScaleItem } from '@student-portal/shared';

export interface StudentUserRef {
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  phone?: string;
  nationalIdMasked?: string;
  nationalId?: string;
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalIdMasked?: string;
  nationalId?: string;
  phone?: string;
  academicEmail?: string;
  department?: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: string;
  seatNumber?: string;
  examRoom?: string;
  examFloor?: string;
  examBuilding?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: StudentUserRef | string;
  registrationSummary?: {
    academicYear?: string;
    semester?: string;
    isTermOpen?: boolean;
    status?: string;
    registrationId?: string;
    courseCount?: number;
    totalCreditHours?: number;
    advisingCaseId?: string;
    advisingStatus?: string;
  };
  gpa?: number;
  academicWarnings?: number;
  academicProfile?: {
    gpa?: number;
    academicWarnings?: number;
    completedCourses?: string[];
    failedCourses?: string[];
  };
}

export interface CourseGradeRow {
  key: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
  academicYear: string;
  semester: string;
  midterm?: Grade;
  final?: Grade;
  otherGrades: Grade[];
  totalScore: number;
  totalMaxGrade: number;
  percentage: number;
  letterGrade?: string;
  status: 'passed' | 'failed' | 'in_progress';
}

export interface Grade {
  _id: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  courseNameEn?: string;
  examType: string;
  grade: number;
  maxGrade: number;
  status: string;
  academicYear: string;
  semester: string;
  isPublished: boolean;
  percentage?: number;
  letterGrade?: string;
  gradePoints?: number;
}

export interface Complaint {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
}

export interface AcademicEmail {
  _id: string;
  academicEmail: string;
  status: string;
}

function getUserRef(student: Student): StudentUserRef | null {
  return typeof student.userId === 'object' && student.userId ? student.userId : null;
}

function formatDate(value?: string, locale?: string) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getGpaScale(gpa: number): GradeScaleItem {
  for (const item of GRADE_SCALE) {
    if (gpa >= item.points) {
      return item;
    }
  }
  return GRADE_SCALE[GRADE_SCALE.length - 1];
}

function InfoItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || 'N/A'}</div>
    </div>
  );
}

function SensitiveNationalId({
  value,
  canView,
}: {
  value?: string;
  canView: boolean;
}) {
  if (!canView || !value) {
    return (
      <span className="rounded-squircle border border-border/70 bg-surface/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Restricted
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm font-medium text-foreground">{value}</span>
      <CopyButton
        value={value}
        label="Copy"
        successMessage="National ID copied"
        className="rounded-squircle px-2 py-1"
      />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
      <span className="text-primary">{icon}</span>
      {title}
    </div>
  );
}

export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
  grades,
  complaints,
  academicEmail,
  isLoading,
  gradesLoading,
  complaintsLoading,
  locale,
  canViewSensitiveStudentData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  grades: Grade[];
  complaints: Complaint[];
  academicEmail: AcademicEmail | null | undefined;
  isLoading: boolean;
  gradesLoading: boolean;
  complaintsLoading: boolean;
  locale: string;
  canViewSensitiveStudentData: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('record');
  const [gradeSearch, setGradeSearch] = useState('');
  const [visibleComplaints, setVisibleComplaints] = useState(5);

  const userRef = student ? getUserRef(student) : null;
  const isAr = locale === 'ar';

  const semesterMap: Record<string, string> = {
    first: isAr ? 'الأول' : 'First',
    second: isAr ? 'الثاني' : 'Second',
    summer: isAr ? 'الصيفي' : 'Summer',
  };

  const enrollmentStatusMap: Record<string, string> = {
    active: isAr ? 'نشط' : 'Active',
    suspended: isAr ? 'موقوف' : 'Suspended',
    graduated: isAr ? 'خريج' : 'Graduated',
    withdrawn: isAr ? 'منسحب' : 'Withdrawn',
  };

  const coursesQuery = useQuery({
    queryKey: ['courses-lookup-dialog'],
    queryFn: async () => {
      try {
        const res = await api.get<{ items: Array<{ code: string; name: string; nameAr?: string; nameEn?: string }> }>(
          '/courses',
          { params: { limit: 200 } }
        );
        return res.data?.items ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const coursesMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; nameAr?: string; nameEn?: string }>();
    for (const c of coursesQuery.data ?? []) {
      if (c.code) {
        map.set(c.code.toUpperCase(), c);
      }
    }
    return map;
  }, [coursesQuery.data]);

  const groupedCourses = useMemo(() => {
    const map = new Map<string, CourseGradeRow>();

    for (const g of grades) {
      const key = `${g.courseCode}-${g.academicYear}-${g.semester}`;
      let row = map.get(key);
      const courseMeta = coursesMap.get(g.courseCode.toUpperCase());
      if (!row) {
        row = {
          key,
          courseCode: g.courseCode,
          courseName: g.courseName,
          courseNameAr: g.courseNameAr || courseMeta?.nameAr,
          courseNameEn: g.courseNameEn || courseMeta?.nameEn,
          academicYear: g.academicYear,
          semester: g.semester,
          otherGrades: [],
          totalScore: 0,
          totalMaxGrade: 0,
          percentage: 0,
          letterGrade: g.letterGrade,
          status: 'in_progress',
        };
        map.set(key, row);
      } else {
        if (!row.courseNameAr && (g.courseNameAr || courseMeta?.nameAr)) {
          row.courseNameAr = g.courseNameAr || courseMeta?.nameAr;
        }
        if (!row.courseNameEn && (g.courseNameEn || courseMeta?.nameEn)) {
          row.courseNameEn = g.courseNameEn || courseMeta?.nameEn;
        }
      }

      const examType = (g.examType || '').toLowerCase();
      if (examType.includes('mid') || examType.includes('فصلي')) {
        row.midterm = g;
      } else if (examType.includes('fin') || examType.includes('نهائي')) {
        row.final = g;
      } else {
        row.otherGrades.push(g);
      }

      row.totalScore += g.grade || 0;
      row.totalMaxGrade += g.maxGrade || 0;
    }

    return Array.from(map.values()).map((row) => {
      const totalMax = row.totalMaxGrade > 0 ? row.totalMaxGrade : 100;
      const percentage = Math.round((row.totalScore / totalMax) * 100);
      row.percentage = percentage;

      const scale = calculateGradeScale(percentage, row.final?.status);
      row.letterGrade = row.final?.letterGrade || scale.letter;

      if (row.final) {
        const finalStatus = (row.final.status || '').toLowerCase();
        if (finalStatus === 'absent' || finalStatus === 'failed' || percentage < 50) {
          row.status = 'failed';
        } else {
          row.status = 'passed';
        }
      } else if (row.midterm && !row.final) {
        row.status = 'in_progress';
      } else {
        row.status = percentage >= 50 ? 'passed' : 'failed';
      }

      return row;
    });
  }, [grades, coursesMap]);

  const filteredCourses = useMemo(() => {
    if (!gradeSearch.trim()) return groupedCourses;
    const query = gradeSearch.toLowerCase();
    return groupedCourses.filter((c) => {
      const courseMeta = coursesMap.get(c.courseCode.toUpperCase());
      const nameAr = c.courseNameAr || courseMeta?.nameAr || '';
      const nameEn = c.courseNameEn || courseMeta?.nameEn || '';
      return (
        c.courseCode.toLowerCase().includes(query) ||
        c.courseName.toLowerCase().includes(query) ||
        nameAr.toLowerCase().includes(query) ||
        nameEn.toLowerCase().includes(query) ||
        c.academicYear.toLowerCase().includes(query)
      );
    });
  }, [groupedCourses, gradeSearch, coursesMap]);

  const stats = useMemo(() => {
    const rawGpa = student?.gpa ?? student?.academicProfile?.gpa;
    const gpaDisplay = typeof rawGpa === 'number' && !isNaN(rawGpa) ? rawGpa.toFixed(2) : '—';
    const warnings =
      student?.academicWarnings ??
      student?.academicProfile?.academicWarnings ??
      (typeof rawGpa === 'number' && rawGpa < 2.0 ? 1 : 0);

    const failedFromGrades = groupedCourses.filter((c) => c.status === 'failed').length;
    const failedFromProfile = student?.academicProfile?.failedCourses?.length ?? 0;
    const failedCourses = Math.max(failedFromGrades, failedFromProfile);

    const totalFromGrades = groupedCourses.length;
    const totalFromProfile =
      (student?.academicProfile?.completedCourses?.length ?? 0) + failedFromProfile;
    const totalCourses = Math.max(totalFromGrades, totalFromProfile);

    const openComplaintsCount = complaints.filter(
      (c) => c.status !== 'resolved' && c.status !== 'closed'
    ).length;

    return {
      gpa: gpaDisplay,
      rawGpa: typeof rawGpa === 'number' ? rawGpa : null,
      warnings,
      failedCourses,
      totalCourses,
      openComplaintsCount,
    };
  }, [student, groupedCourses, complaints]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setVisibleComplaints(5);
          setGradeSearch('');
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-w-5xl rounded-xl border border-border/70 bg-card/95 p-0 text-foreground shadow-[var(--shadow-glow)] backdrop-blur max-h-[90vh] flex flex-col"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="border-b border-border/70 p-5 shrink-0">
          <DialogHeader className="text-start">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="flex flex-wrap items-center gap-2.5 text-2xl font-bold">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <div>
                    {isAr
                      ? student?.fullNameAr || student?.fullName || 'الملف الشخصي للطالب'
                      : student?.fullNameEn || student?.fullName || 'Student Profile'}
                  </div>
                  {((isAr ? student?.fullNameEn : student?.fullNameAr) &&
                    (isAr ? student?.fullNameEn : student?.fullNameAr) !==
                      (isAr ? student?.fullNameAr || student?.fullName : student?.fullNameEn || student?.fullName)) ? (
                    <div className="text-xs font-normal text-muted-foreground mt-0.5">
                      {isAr ? student?.fullNameEn : student?.fullNameAr}
                    </div>
                  ) : null}
                </div>
              </DialogTitle>
              {student && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-sm bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                    {student.studentCode}
                  </span>
                  <StatusBadge
                    label={enrollmentStatusMap[student.enrollmentStatus] ?? student.enrollmentStatus}
                    variant={student.enrollmentStatus === 'active' ? 'success' : 'warning'}
                  />
                  {userRef?.isActive === false && (
                    <span className="rounded-full bg-danger/10 text-danger border border-danger/20 text-xs px-2.5 py-0.5 font-medium">
                      {isAr ? 'حساب معطل' : 'Suspended'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {student?.studentCode
                ? isAr
                  ? `السجل الأكاديمي، المقررات، نتائج الامتحانات، وحالة التسجيل للطالب (${student.studentCode})`
                  : `Academic record, courses, exam grades, and registration details for (${student.studentCode})`
                : isAr
                  ? 'جاري تحميل بيانات الطالب...'
                  : 'Loading student profile...'}
            </DialogDescription>
          </DialogHeader>

          {/* Quick Metrics Bar (Strictly 4 Cards: GPA, Warnings, Failed Courses, Total Courses) */}
          {student && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-border/40">
              {/* Card 1: GPA with Final Grade */}
              <div className="rounded-lg bg-surface/40 p-2.5 border border-border/50 text-center sm:text-start">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? 'المعدل التراكمي (GPA)' : 'Cumulative GPA'}
                </span>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span
                    dir="ltr"
                    className={cn(
                      'text-lg font-bold font-mono inline-block',
                      stats.rawGpa !== null && stats.rawGpa < 2.0
                        ? 'text-danger'
                        : stats.rawGpa !== null && stats.rawGpa >= 3.0
                          ? 'text-success'
                          : 'text-foreground'
                    )}
                  >
                    {stats.gpa}
                    {stats.rawGpa !== null && (
                      <span className="text-xs text-muted-foreground font-normal font-sans ms-1">
                        / 4.00
                      </span>
                    )}
                  </span>
                  {stats.rawGpa !== null && (
                    <span
                      className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
                        stats.rawGpa < 2.0
                          ? 'bg-danger/10 text-danger border-danger/20'
                          : stats.rawGpa >= 3.0
                            ? 'bg-success/10 text-success border-success/20'
                            : 'bg-primary/10 text-primary border-primary/20'
                      )}
                    >
                      {isAr ? getGpaScale(stats.rawGpa).nameAr : getGpaScale(stats.rawGpa).nameEn} ({getGpaScale(stats.rawGpa).letter})
                    </span>
                  )}
                </div>
              </div>

              {/* Card 2: Academic Warnings */}
              <div className="rounded-lg bg-surface/40 p-2.5 border border-border/50 text-center sm:text-start">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? 'الإنذارات الأكاديمية' : 'Academic Warnings'}
                </span>
                <span
                  className={cn(
                    'text-lg font-bold font-mono',
                    stats.warnings > 0 ? 'text-danger' : 'text-success'
                  )}
                >
                  {stats.warnings}
                </span>
              </div>

              {/* Card 3: Failed Courses */}
              <div className="rounded-lg bg-surface/40 p-2.5 border border-border/50 text-center sm:text-start">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? 'المقررات الراسبة' : 'Failed Courses'}
                </span>
                <span
                  className={cn(
                    'text-lg font-bold font-mono',
                    stats.failedCourses > 0 ? 'text-danger' : 'text-success'
                  )}
                >
                  {stats.failedCourses}
                </span>
              </div>

              {/* Card 4: Total Courses Taken */}
              <div className="rounded-lg bg-surface/40 p-2.5 border border-border/50 text-center sm:text-start">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? 'إجمالي المقررات المسجلة' : 'Total Courses Taken'}
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {stats.totalCourses}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Content with Tabs */}
        {isLoading || !student ? (
          <div className="flex min-h-80 items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} dir={isAr ? 'rtl' : 'ltr'} className="flex-1 flex flex-col min-h-0">
            {/* Pinned Tab Bar with Compact Rounded Pill Container */}
            <div className="border-b border-border/60 bg-surface/30 px-5 py-2 shrink-0">
              <TabsList className="inline-flex h-auto items-center gap-1 rounded-full border border-border/70 bg-surface/40 p-1">
                <TabsTrigger
                  value="record"
                  className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground cursor-pointer data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/40 data-[state=active]:shadow-xs h-7.5"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 me-1.5 inline" />
                  {isAr ? 'السجل والدرجات' : 'Academic Record'}
                </TabsTrigger>
                <TabsTrigger
                  value="registration"
                  className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground cursor-pointer data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/40 data-[state=active]:shadow-xs h-7.5"
                >
                  <Layers className="h-3.5 w-3.5 me-1.5 inline" />
                  {isAr ? 'التسجيل والإرشاد' : 'Registration'}
                </TabsTrigger>
                <TabsTrigger
                  value="personal"
                  className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground cursor-pointer data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/40 data-[state=active]:shadow-xs h-7.5"
                >
                  <Users className="h-3.5 w-3.5 me-1.5 inline" />
                  {isAr ? 'البيانات ومقر الامتحان' : 'Personal & Exam'}
                </TabsTrigger>
                <TabsTrigger
                  value="complaints"
                  className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground cursor-pointer data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/40 data-[state=active]:shadow-xs h-7.5"
                >
                  <Mail className="h-3.5 w-3.5 me-1.5 inline" />
                  {isAr ? 'الشكاوى والتذاكر' : 'Complaints'}
                  {stats.openComplaintsCount > 0 && (
                    <span className="ms-1.5 px-1.5 py-0.2 rounded-full bg-warning/20 text-warning text-[9px] font-bold">
                      {stats.openComplaintsCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Tab Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* TAB 1: ACADEMIC RECORD & GRADES TABLE */}
              <TabsContent value="record" className="mt-0 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface/30 p-3 rounded-xl border border-border/60">
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={isAr ? 'بحث بكود المقرر، الاسم، أو السنة...' : 'Search course code, name, year...'}
                      value={gradeSearch}
                      onChange={(e) => setGradeSearch(e.target.value)}
                      className="ps-9 h-9 text-sm bg-background/50 border-border/70"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap self-center">
                    {isAr ? `إجمالي المقررات: ${filteredCourses.length}` : `Courses: ${filteredCourses.length}`}
                  </div>
                </div>

                {gradesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredCourses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      {gradeSearch ? (isAr ? 'لا توجد مقررات مطابقة للبحث' : 'No courses match search') : (isAr ? 'لا توجد درجات أو مقررات مسجلة لهذا الطالب' : 'No courses or grades recorded')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isAr ? 'يمكن استيراد الدرجات من تبويب "رفع البيانات" في لوحة الإدارة.' : 'Grades can be imported from the Data Uploads tab.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/70 bg-surface/20">
                    <table className="w-full text-start text-sm">
                      <thead className="bg-surface/60 border-b border-border/60 text-xs font-semibold text-muted-foreground">
                        <tr>
                          <th className="p-3 text-start">{isAr ? 'كود المقرر' : 'Code'}</th>
                          <th className="p-3 text-start">{isAr ? 'اسم المقرر' : 'Course Name'}</th>
                          <th className="p-3 text-start">{isAr ? 'السنة / الفصل' : 'Year / Term'}</th>
                          <th className="p-3 text-center">{isAr ? 'الميدتيرم' : 'Midterm'}</th>
                          <th className="p-3 text-center">{isAr ? 'الامتحان النهائي' : 'Final Exam'}</th>
                          <th className="p-3 text-center">{isAr ? 'النسبة والتقدير' : 'Percentage & Grade'}</th>
                          <th className="p-3 text-center">{isAr ? 'النتيجة النهائية' : 'Final Result'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-medium">
                        {filteredCourses.map((row) => {
                          const courseMeta = coursesMap.get(row.courseCode.toUpperCase());
                          const courseDisplayName = isAr
                            ? (row.courseNameAr || courseMeta?.nameAr || row.courseName)
                            : (row.courseNameEn || courseMeta?.nameEn || row.courseName);
                          const scale = calculateGradeScale(row.percentage, row.final?.status);

                          return (
                            <tr key={row.key} className="hover:bg-surface/40 transition-colors">
                              <td className="p-3 font-mono font-bold text-primary text-xs">
                                {row.courseCode}
                              </td>
                              <td className="p-3 text-foreground font-semibold">
                                {courseDisplayName}
                              </td>
                              <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                                {row.academicYear} · {semesterMap[row.semester] ?? row.semester}
                              </td>
                              <td className="p-3 text-center">
                                {row.midterm ? (
                                  <span dir="ltr" className="font-mono text-xs font-bold text-foreground inline-block">
                                    <span className={row.midterm.grade < row.midterm.maxGrade * 0.5 ? 'text-amber-500' : 'text-emerald-500'}>
                                      {row.midterm.grade}
                                    </span>
                                    <span className="text-muted-foreground font-normal">/{row.midterm.maxGrade}</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {row.final ? (
                                  <span dir="ltr" className="font-mono text-xs font-bold text-foreground inline-block">
                                    <span className={row.final.grade < row.final.maxGrade * 0.5 ? 'text-danger' : 'text-emerald-500'}>
                                      {row.final.grade}
                                    </span>
                                    <span className="text-muted-foreground font-normal">/{row.final.maxGrade}</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">{isAr ? 'قيد الانتظار' : 'Pending'}</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                                  <span className="font-mono text-xs font-bold text-foreground">
                                    {row.percentage}%
                                  </span>
                                  <span
                                    className={cn(
                                      'text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
                                      scale.isPass
                                        ? 'bg-primary/10 text-primary border-primary/20'
                                        : 'bg-danger/10 text-danger border-danger/20'
                                    )}
                                  >
                                    {scale.letter} · {isAr ? scale.nameAr : scale.nameEn}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {row.status === 'passed' ? (
                                  <StatusBadge
                                    label={isAr ? 'ناجح' : 'Passed'}
                                    variant="success"
                                  />
                                ) : row.status === 'failed' ? (
                                  <StatusBadge
                                    label={isAr ? 'راسب' : 'Failed'}
                                    variant="danger"
                                  />
                                ) : (
                                  <StatusBadge
                                    label={isAr ? 'قيد الدراسة' : 'In Progress'}
                                    variant="info"
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: REGISTRATION & ACADEMIC ADVISING */}
              <TabsContent value="registration" className="mt-4 space-y-4">
                <div className="rounded-xl border border-border/70 bg-surface/25 p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
                    <div>
                      <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        {isAr ? 'بيانات القيد والتسجيل الأكاديمي' : 'Enrollment & Academic Registration'}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isAr
                          ? 'تفاصيل التسجيل الحالي، الإرشاد الأكاديمي المعتمد والمقررات المسجلة لهذا الفصل.'
                          : 'Current registration details, approved advising cases, and term status.'}
                      </p>
                    </div>

                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        router.push(`/${locale}/admin/academic-advising?student=${student.studentCode}`);
                      }}
                      className="cursor-pointer font-bold text-xs gap-1.5 shadow-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isAr ? 'فتح صفحة الإرشاد والتسجيل الأكاديمي' : 'Open Academic Advising'}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoItem
                      label={isAr ? 'حالة القيد الحالية' : 'Current Enrollment'}
                      value={
                        <StatusBadge
                          label={enrollmentStatusMap[student.enrollmentStatus] ?? student.enrollmentStatus}
                          variant={student.enrollmentStatus === 'active' ? 'success' : 'warning'}
                        />
                      }
                    />
                    <InfoItem
                      label={isAr ? 'المستوى الدراسي' : 'Current Level'}
                      value={isAr ? `المستوى ${student.level}` : `Level ${student.level}`}
                    />
                    <InfoItem
                      label={isAr ? 'القسم العلمي' : 'Department'}
                      value={student.department || (isAr ? 'عام' : 'General')}
                    />
                    <InfoItem
                      label={isAr ? 'المجموعة الدراسية' : 'Group'}
                      value={student.group || '—'}
                    />
                    <InfoItem
                      label={isAr ? 'الشعبة / الفرقة' : 'Section'}
                      value={student.section || '—'}
                    />
                    <InfoItem
                      label={isAr ? 'العام الأكاديمي الحالي' : 'Academic Year'}
                      value={student.academicYear}
                    />
                    <InfoItem
                      label={isAr ? 'الفصل الدراسي' : 'Current Term'}
                      value={semesterMap[student.semester] ?? student.semester}
                    />
                    <InfoItem
                      label={isAr ? 'حالة التسجيل الأكاديمي' : 'Registration Status'}
                      value={
                        student.registrationSummary?.status === 'approved' ? (
                          <StatusBadge label={isAr ? 'معتمد / مسجل' : 'Approved'} variant="success" />
                        ) : student.registrationSummary?.status === 'pending' ? (
                          <StatusBadge label={isAr ? 'قيد المراجعة' : 'Pending'} variant="warning" />
                        ) : (
                          <StatusBadge label={isAr ? 'غير مسجل حالياً' : 'Not Registered'} variant="neutral" />
                        )
                      }
                    />
                    <InfoItem
                      label={isAr ? 'عدد الساعات المعتمدة المسجلة' : 'Registered Credit Hours'}
                      value={
                        student.registrationSummary?.totalCreditHours != null ? (
                          <span className="inline-flex items-center gap-1">
                            <bdi className="font-mono">{student.registrationSummary.totalCreditHours}</bdi>
                            <span>{isAr ? 'ساعة' : 'hrs'}</span>
                          </span>
                        ) : (
                          '—'
                        )
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 3: PERSONAL & EXAM PLACEMENT */}
              <TabsContent value="personal" className="mt-4 space-y-4">
                <section>
                  <SectionTitle icon={<Users className="h-4 w-4" />} title={isAr ? 'الهوية وبيانات التواصل' : 'Identity & Contact'} />
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <InfoItem label={isAr ? 'الاسم الكامل' : 'Full Name'} value={student.fullName} />
                    <InfoItem
                      label={isAr ? 'الرقم القومي' : 'National ID'}
                      value={
                        <SensitiveNationalId
                          value={student.nationalId || userRef?.nationalId}
                          canView={canViewSensitiveStudentData}
                        />
                      }
                    />
                    <InfoItem label={isAr ? 'البريد الأكاديمي' : 'Academic Email'} value={student.academicEmail || academicEmail?.academicEmail} />
                    <InfoItem label={isAr ? 'رقم الهاتف' : 'Phone'} value={userRef?.phone} />
                  </div>
                </section>

                <section>
                  <SectionTitle icon={<MapPin className="h-4 w-4" />} title={isAr ? 'مقر ولجنة الامتحانات' : 'Exam Placement & Seat'} />
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <InfoItem
                      label={isAr ? 'رقم الجلوس' : 'Seat Number'}
                      value={<span className="font-mono font-bold text-primary">{student.seatNumber || '—'}</span>}
                    />
                    <InfoItem label={isAr ? 'المبنى' : 'Building'} value={student.examBuilding || '—'} />
                    <InfoItem label={isAr ? 'الدور / الطابق' : 'Floor'} value={student.examFloor || '—'} />
                    <InfoItem label={isAr ? 'القاعة / المدرج' : 'Room'} value={student.examRoom || '—'} />
                  </div>
                </section>

                <section>
                  <SectionTitle icon={<Award className="h-4 w-4" />} title={isAr ? 'بيانات النظام والتوثيق' : 'System & Audit'} />
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <InfoItem label={isAr ? 'حالة الحساب' : 'Account Status'} value={userRef?.isActive === false ? (isAr ? 'معطل' : 'Disabled') : (isAr ? 'مفعل' : 'Active')} />
                    <InfoItem label={isAr ? 'آخر تسجيل دخول' : 'Last Login'} value={formatDate(userRef?.lastLoginAt, locale)} />
                    <InfoItem label={isAr ? 'تاريخ الإنشاء' : 'Created At'} value={formatDate(student.createdAt, locale)} />
                    <InfoItem label={isAr ? 'تاريخ التحديث' : 'Updated At'} value={formatDate(student.updatedAt, locale)} />
                  </div>
                </section>
              </TabsContent>

              {/* TAB 4: COMPLAINTS & TICKETS */}
              <TabsContent value="complaints" className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle icon={<Mail className="h-4 w-4" />} title={isAr ? 'الشكاوى والتذاكر الأكاديمية' : 'Complaints & Support Tickets'} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/${locale}/admin/complaints?search=${student.studentCode}`);
                    }}
                    className="text-xs cursor-pointer gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isAr ? 'عرض كافة الشكاوى' : 'View all tickets'}
                  </Button>
                </div>

                {complaintsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : complaints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      {isAr ? 'لا توجد شكاوى أو استفسارات مسجلة لهذا الطالب' : 'No complaints recorded for this student'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {complaints.slice(0, visibleComplaints).map((complaint) => (
                      <div
                        key={complaint._id}
                        className="rounded-xl border border-border/70 bg-card/70 p-3.5 text-sm cursor-pointer hover:border-primary/50 hover:bg-card/90 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        onClick={() => {
                          onOpenChange(false);
                          router.push(`/${locale}/admin/complaints?ticket=${complaint.ticketNumber}`);
                        }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">{complaint.ticketNumber}</span>
                            <StatusBadge
                              label={complaint.status}
                              variant={complaint.status === 'resolved' ? 'success' : complaint.status === 'pending' ? 'warning' : 'neutral'}
                            />
                            <span className="text-xs text-muted-foreground">· {complaint.priority}</span>
                          </div>
                          <p className="font-semibold text-foreground">{complaint.title}</p>
                          <p className="text-xs text-muted-foreground">{complaint.type} · {formatDate(complaint.createdAt, locale)}</p>
                        </div>

                        <Button variant="ghost" size="sm" className="text-xs shrink-0 self-end sm:self-center">
                          {isAr ? 'عرض التفاصيل' : 'View Details'}
                          <ExternalLink className="ms-1.5 h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    {complaints.length > visibleComplaints && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs hover:bg-primary/10 hover:text-primary mt-2 cursor-pointer"
                        onClick={() => setVisibleComplaints((prev) => prev + 5)}
                      >
                        {isAr ? 'عرض المزيد من الشكاوى' : 'Load more complaints'}
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
