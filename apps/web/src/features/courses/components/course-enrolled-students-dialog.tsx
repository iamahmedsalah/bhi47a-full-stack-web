'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Search, Loader2, GraduationCap, Clock, Layers, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob, EXCEL_MIME_TYPE } from '@/lib/export-utils';

export interface EnrolledStudent {
  registrationId: string;
  studentId: string;
  studentCode: string;
  name: string;
  nameAr?: string;
  level: string;
  department?: string;
  status?: string;
  enrolledAt?: string;
}

export interface EnrolledCourseSummary {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  creditHours: number;
  department?: string;
  level?: string;
}

export interface CourseEnrolledStudentsResponse {
  course: EnrolledCourseSummary;
  totalEnrolled: number;
  filteredCount: number;
  academicYear?: string;
  semester?: string;
  students: EnrolledStudent[];
}

interface CourseEnrolledStudentsDialogProps {
  course: {
    _id: string;
    code: string;
    name: string;
    nameAr?: string;
    nameEn?: string;
    creditHours?: number;
    level?: string;
    department?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 25;

export function CourseEnrolledStudentsDialog({
  course,
  isOpen,
  onClose,
}: CourseEnrolledStudentsDialogProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const courseId = course?._id;

  const { data, isLoading, isError, error, refetch } = useQuery<CourseEnrolledStudentsResponse>({
    queryKey: ['admin-course-enrolled-students', courseId],
    queryFn: async () => {
      if (!courseId) throw new Error('Course ID is required');
      const res = await api.get<CourseEnrolledStudentsResponse>(
        `/admin/courses/${courseId}/enrolled-students`,
      );
      return res.data;
    },
    enabled: Boolean(courseId && isOpen),
    staleTime: 30000,
  });

  const students = useMemo(() => data?.students ?? [], [data?.students]);

  // Filter students by local search
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.trim().toLowerCase();
    return students.filter(
      (s) =>
        s.studentCode.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.nameAr && s.nameAr.toLowerCase().includes(q)) ||
        (s.department && s.department.toLowerCase().includes(q)) ||
        (s.level && s.level.toLowerCase().includes(q)),
    );
  }, [students, search]);

  // Reset to first page on search change
  const [previousSearch, setPreviousSearch] = useState<unknown[] | null>(null);
  if (previousSearch === null || previousSearch.some((value, index) => !Object.is(value, [search][index]))) {
    setPreviousSearch([search]);
    (() => {
    setCurrentPage(1);

    })();
  }

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedStudents = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, safeCurrentPage]);

  const handleExportExcel = async () => {
    if (!courseId) return;
    setIsExporting(true);
    try {
      const res = await api.get(
        `/admin/courses/${courseId}/enrolled-students/export`,
        { responseType: 'blob' },
      );
      const filename = `كشف_طلاب_${course?.code || 'مقرر'}.xlsx`;
      await downloadFileBlob(res, filename, EXCEL_MIME_TYPE);
      toast.success(
        isAr
          ? 'تم تصدير كشف الطلاب بنجاح (Excel)'
          : 'Enrolled students roster exported successfully (Excel)',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تصدير كشف الطلاب' : 'Failed to export students roster',
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const courseDisplayName = isAr
    ? course?.nameAr || course?.name
    : course?.nameEn || course?.name;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-2xl border-border bg-card shadow-2xl"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-border/80 bg-secondary/15 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex flex-wrap items-center gap-2">
                  <span>{isAr ? 'كشف الطلاب المسجلين بالمقرر' : 'Enrolled Students Roster'}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-squircle bg-primary/15 text-primary border border-primary/25">
                    {course?.code}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {courseDisplayName}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Metrics & Actions */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={isExporting || isLoading || students.length === 0}
                className="rounded-squircle border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold gap-1.5 cursor-pointer shadow-xs h-8 px-2.5 sm:px-3"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>
                  {isAr ? 'تحميل كشف الطلاب (Excel)' : 'Download Excel Sheet'}
                </span>
              </Button>
            </div>
          </div>

          {/* Meta Chips */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2.5">
            <span className="inline-flex items-center gap-1 rounded-squircle border border-border/80 bg-secondary/40 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium text-foreground">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
              <span>
                {isAr ? 'إجمالي المسجلين:' : 'Total Enrolled:'}{' '}
                <strong className="text-primary font-bold">
                  {data?.totalEnrolled ?? 0}
                </strong>
              </span>
            </span>

            {course?.creditHours !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-squircle border border-border/80 bg-secondary/40 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium text-muted-foreground">
                <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                <span>
                  {isAr ? 'الساعات المعتمدة:' : 'Credit Hours:'} {course.creditHours}
                </span>
              </span>
            )}

            {course?.level && (
              <span className="inline-flex items-center gap-1 rounded-squircle border border-border/80 bg-secondary/40 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium text-muted-foreground">
                <GraduationCap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                <span>{isAr ? `المستوى ${course.level}` : `Level ${course.level}`}</span>
              </span>
            )}

            {course?.department && (
              <span className="inline-flex items-center gap-1 rounded-squircle border border-border/80 bg-secondary/40 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium text-muted-foreground">
                <Layers className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                <span>{course.department}</span>
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Search Bar */}
        <div className="p-3 sm:p-4 border-b border-border/60 bg-surface/30 shrink-0">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isAr
                  ? 'بحث سريع بكود الطالب أو اسم الطالب أو المستوى...'
                  : 'Quick search by student code, name or level...'
              }
              className="ps-9 rounded-squircle bg-background border-border/80 text-xs h-9"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[260px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs sm:text-sm font-medium">
                {isAr ? 'جاري تحميل قائمة الطلاب المسجلين...' : 'Loading registered students list...'}
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 text-danger">
              <p className="text-xs sm:text-sm font-semibold">
                {getApiErrorMessage(error, isAr ? 'فشل تحميل بيانات الطلاب المسجلين' : 'Failed to load students')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                className="rounded-squircle text-xs"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </Button>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-2 text-muted-foreground text-center px-4">
              <Users className="h-9 w-9 text-muted-foreground/40 mb-1" />
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                {search.trim()
                  ? isAr
                    ? 'لم يتم العثور على طلاب مطابقين لكلمة البحث'
                    : 'No students matching your search criteria'
                  : isAr
                    ? 'لا يوجد طلاب مسجلون في هذا المقرر حتى الآن'
                    : 'No students enrolled in this course yet'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isAr
                  ? 'يمكن تسجيل الطلاب من خلال زر تسجيل الطلاب (Excel) في صفحة المقررات'
                  : 'Students can be enrolled via the Excel import action on the courses page'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop & Tablet Table View (hidden on very small mobile) */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/80 bg-background/50">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/30 text-muted-foreground">
                      <th className="py-2.5 px-3 font-semibold text-center w-12">#</th>
                      <th className="py-2.5 px-3 font-semibold text-start w-32">{isAr ? 'كود الطالب' : 'Student Code'}</th>
                      <th className="py-2.5 px-3 font-semibold text-start">{isAr ? 'اسم الطالب' : 'Student Name'}</th>
                      <th className="py-2.5 px-3 font-semibold text-center w-28">{isAr ? 'المستوى' : 'Level'}</th>
                      <th className="py-2.5 px-3 font-semibold text-center w-36">{isAr ? 'تاريخ التسجيل' : 'Enrolled At'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedStudents.map((student, idx) => {
                      const globalIndex = (safeCurrentPage - 1) * PAGE_SIZE + idx + 1;
                      const regDate = student.enrolledAt
                        ? new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-GB', {
                            dateStyle: 'short',
                            timeZone: 'Africa/Cairo',
                          }).format(new Date(student.enrolledAt))
                        : '—';

                      return (
                        <tr
                          key={student.registrationId || student.studentId || idx}
                          className="hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                            {globalIndex}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                            <bdi dir="ltr">{student.studentCode}</bdi>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {isAr ? student.nameAr || student.name : student.name}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {student.level ? (isAr ? `فرقة ${student.level}` : `L${student.level}`) : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                            {regDate}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Phone Card List View (optimized for mobile screens) */}
              <div className="sm:hidden space-y-2">
                {paginatedStudents.map((student, idx) => {
                  const globalIndex = (safeCurrentPage - 1) * PAGE_SIZE + idx + 1;
                  const regDate = student.enrolledAt
                    ? new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-GB', {
                        dateStyle: 'short',
                        timeZone: 'Africa/Cairo',
                      }).format(new Date(student.enrolledAt))
                    : '—';

                  return (
                    <div
                      key={student.registrationId || student.studentId || idx}
                      className="rounded-xl border border-border/80 bg-background/60 p-3 space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 rounded-sm px-1.5 py-0.5">
                            #{globalIndex}
                          </span>
                          <span className="font-mono font-bold text-xs text-foreground">
                            <bdi dir="ltr">{student.studentCode}</bdi>
                          </span>
                        </div>
                        <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {student.level ? (isAr ? `فرقة ${student.level}` : `L${student.level}`) : '—'}
                        </span>
                      </div>

                      <div className="font-semibold text-xs text-foreground leading-snug">
                        {isAr ? student.nameAr || student.name : student.name}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <span>{isAr ? 'تاريخ التسجيل:' : 'Registered:'}</span>
                        <span className="font-mono">{regDate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer with Pagination Controls */}
        <div className="p-3 border-t border-border/80 bg-secondary/15 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <span>
              {isAr
                ? `إجمالي المسجلين: ${filteredStudents.length} طالب`
                : `Total: ${filteredStudents.length} students`}
            </span>

            {/* Mobile Close Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="sm:hidden rounded-squircle text-xs h-7 px-2"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 self-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="h-7 w-7 p-0 rounded-squircle cursor-pointer"
                aria-label="Previous page"
              >
                {isAr ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </Button>

              <span className="px-2 text-[11px] font-medium text-foreground">
                {isAr
                  ? `صفحة ${safeCurrentPage} من ${totalPages}`
                  : `Page ${safeCurrentPage} of ${totalPages}`}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="h-7 w-7 p-0 rounded-squircle cursor-pointer"
                aria-label="Next page"
              >
                {isAr ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {/* Desktop Close Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hidden sm:inline-flex rounded-squircle text-xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
