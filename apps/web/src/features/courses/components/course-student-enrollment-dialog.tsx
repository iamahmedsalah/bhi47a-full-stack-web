'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UserCheck,
  Filter,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob, EXCEL_MIME_TYPE } from '@/lib/export-utils';
import { toast } from 'sonner';

export interface CourseStudentEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses?: Array<{
    _id: string;
    code: string;
    name: string;
    nameAr?: string;
    level?: string;
    semester?: string;
  }>;
  selectedCourseId?: string | null;
  locale: string;
  onSuccess?: () => void;
}

interface EnrollmentResult {
  courseId: string;
  courseCode: string;
  courseName: string;
  totalRows: number;
  enrolledCount: number;
  alreadyEnrolledCount: number;
  skippedBlockedCount: number;
  errorCount: number;
  errors: string[];
}

export function CourseStudentEnrollmentDialog({
  open,
  onOpenChange,
  courses: initialCourses = [],
  selectedCourseId: initialCourseId,
  locale,
  onSuccess,
}: CourseStudentEnrollmentDialogProps) {
  const isAr = locale === 'ar';

  const [courseId, setCourseId] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2026-2027');
  const [semester, setSemester] = useState<'first' | 'second' | 'summer'>('first');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [skipBlocked, setSkipBlocked] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [result, setResult] = useState<EnrollmentResult | null>(null);

  // Load all institute courses independently so all levels (1..4) and semesters are selectable
  const allCoursesQuery = useQuery({
    queryKey: ['admin-all-courses-for-enrollment'],
    queryFn: async () => {
      const res = await api.get<{
        items: Array<{
          _id: string;
          code: string;
          name: string;
          nameAr?: string;
          level?: string;
          semester?: string;
        }>;
      }>('/admin/courses', {
        params: { limit: 500 },
      });
      return res.data?.items || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const availableCourses =
    allCoursesQuery.data && allCoursesQuery.data.length > 0
      ? allCoursesQuery.data
      : initialCourses;

  // Filter courses by selected level and semester filters
  const filteredCourses = availableCourses.filter((c) => {
    if (filterLevel !== 'all' && String(c.level) !== filterLevel) return false;
    if (filterSemester !== 'all' && c.semester !== filterSemester) return false;
    return true;
  });

  useEffect(() => {
    if (initialCourseId && availableCourses.length > 0) {
      setCourseId(initialCourseId);
      const match = availableCourses.find((c) => c._id === initialCourseId);
      if (match) {
        if (match.level) setFilterLevel(String(match.level));
        if (match.semester) {
          setFilterSemester(match.semester);
          if (['first', 'second', 'summer'].includes(match.semester)) {
            setSemester(match.semester as 'first' | 'second' | 'summer');
          }
        }
      }
    } else if (filteredCourses.length > 0 && !courseId) {
      setCourseId(filteredCourses[0]._id);
    }
  }, [initialCourseId, availableCourses, filteredCourses.length]);

  // Reset file and result when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setResult(null);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [open]);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const res = await api.get('/admin/courses/enrollment-template', {
        params: { format: 'xlsx' },
        responseType: 'blob',
      });
      await downloadFileBlob(
        res,
        'course-students-enrollment-template.xlsx',
        EXCEL_MIME_TYPE,
      );
      toast.success(
        isAr
          ? 'تم تنزيل نموذج تسجيل الطلاب في المقرر بنجاح'
          : 'Enrollment template downloaded successfully',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تحميل النموذج' : 'Failed to download template',
        ),
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setUploadProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!courseId) {
      toast.error(isAr ? 'يرجى اختيار المقرر أولاً' : 'Please select a course');
      return;
    }
    if (!selectedFile) {
      toast.error(isAr ? 'يرجى اختيار ملف Excel للرفع' : 'Please select an Excel file');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(15);
      setResult(null);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
      }, 400);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await api.post<EnrollmentResult>(
        `/admin/courses/${courseId}/enroll-students-excel`,
        formData,
        {
          params: {
            academicYear,
            semester,
            skipBlocked,
          },
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = res.data ?? (res as unknown as EnrollmentResult);
      setResult(data);

      toast.success(
        isAr
          ? `تم تسجيل ${data.enrolledCount} طالب بنجاح في مقرر ${data.courseCode}`
          : `Successfully enrolled ${data.enrolledCount} students in ${data.courseCode}`,
      );

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setUploadProgress(0);
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'حدث خطأ أثناء تسجيل الطلاب بالمقرر' : 'Failed to enroll students',
        ),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="glass max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 p-6 text-start"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <DialogHeader className="border-b border-border/70 pb-4 text-start">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {isAr
                  ? 'تسجيل الطلاب في المقرر عبر شيت Excel'
                  : 'Enroll Students into Course via Excel'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'تسجيل مجموعة من الطلاب دفعة واحدة في مقرر دراسي لجميع الفرق والفصول الدراسية'
                  : 'Batch-enroll students into a course across all academic levels and semesters'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Level and Semester Filters to easily find courses from ANY level */}
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Filter className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? 'تصفية المواد المتاحة للاختيار:' : 'Filter Available Courses:'}</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">
                  {isAr ? 'الفرقة الدراسية' : 'Academic Level'}
                </label>
                <Select
                  value={filterLevel}
                  onValueChange={(val) => {
                    setFilterLevel(val);
                    // auto select first matching course if any
                    const matched = availableCourses.filter(
                      (c) => (val === 'all' || String(c.level) === val) && (filterSemester === 'all' || c.semester === filterSemester),
                    );
                    if (matched.length > 0) setCourseId(matched[0]._id);
                  }}
                >
                  <SelectTrigger disabled={isUploading} className="h-8 rounded-squircle border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                    <SelectItem value="all">{isAr ? 'جميع الفرق الدراسية (الكل)' : 'All Levels'}</SelectItem>
                    <SelectItem value="1">{isAr ? 'الفرقة الأولى (Level 1)' : 'Level 1'}</SelectItem>
                    <SelectItem value="2">{isAr ? 'الفرقة الثانية (Level 2)' : 'Level 2'}</SelectItem>
                    <SelectItem value="3">{isAr ? 'الفرقة الثالثة (Level 3)' : 'Level 3'}</SelectItem>
                    <SelectItem value="4">{isAr ? 'الفرقة الرابعة (Level 4)' : 'Level 4'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">
                  {isAr ? 'فصل المقرر الدراسي' : 'Course Semester'}
                </label>
                <Select
                  value={filterSemester}
                  onValueChange={(val) => {
                    setFilterSemester(val);
                    const matched = availableCourses.filter(
                      (c) => (filterLevel === 'all' || String(c.level) === filterLevel) && (val === 'all' || c.semester === val),
                    );
                    if (matched.length > 0) setCourseId(matched[0]._id);
                  }}
                >
                  <SelectTrigger disabled={isUploading} className="h-8 rounded-squircle border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                    <SelectItem value="all">{isAr ? 'جميع الفصول (الكل)' : 'All Semesters'}</SelectItem>
                    <SelectItem value="first">{isAr ? 'الفصل الدراسي الأول' : 'First Semester'}</SelectItem>
                    <SelectItem value="second">{isAr ? 'الفصل الدراسي الثاني' : 'Second Semester'}</SelectItem>
                    <SelectItem value="summer">{isAr ? 'الفصل الصيفي' : 'Summer Semester'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Target Course Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'المقرر الدراسي المستهدف *' : 'Target Course *'}
              </label>
              <span className="text-[11px] text-muted-foreground">
                {isAr
                  ? `(${filteredCourses.length} مادة دراسية متاحة)`
                  : `(${filteredCourses.length} courses available)`}
              </span>
            </div>

            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger disabled={isUploading} className="w-full rounded-squircle border-border bg-secondary/40 text-sm">
                <SelectValue
                  placeholder={
                    filteredCourses.length === 0
                      ? isAr
                        ? 'لا توجد مواد مطابقة للفلتر المختار'
                        : 'No courses match filter'
                      : isAr
                        ? 'اختر المقرر المطلوب تسجيل الطلاب به'
                        : 'Select target course'
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-60 border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                {filteredCourses.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    <span className="font-mono text-xs font-bold text-primary">
                      {c.code}
                    </span>{' '}
                    - {isAr ? c.nameAr || c.name : c.name}{' '}
                    <span className="text-[10px] text-muted-foreground">
                      ({isAr ? `الفرقة ${c.level || 1}` : `L${c.level || 1}`})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Academic Year and Registration Term Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'العام الأكاديمي' : 'Academic Year'}
              </label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger disabled={isUploading} className="w-full rounded-squircle border-border bg-secondary/40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="2026-2027">2026-2027</SelectItem>
                  <SelectItem value="2025-2026">2025-2026</SelectItem>
                  <SelectItem value="2024-2025">2024-2025</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'الفصل الدراسي للتسجيل' : 'Registration Semester'}
              </label>
              <Select
                value={semester}
                onValueChange={(val) => setSemester(val as 'first' | 'second' | 'summer')}
              >
                <SelectTrigger disabled={isUploading} className="w-full rounded-squircle border-border bg-secondary/40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                  <SelectItem value="first">
                    {isAr ? 'الفصل الأول (الترم الأول)' : 'First Semester'}
                  </SelectItem>
                  <SelectItem value="second">
                    {isAr ? 'الفصل الثاني (الترم الثاني)' : 'Second Semester'}
                  </SelectItem>
                  <SelectItem value="summer">
                    {isAr ? 'الفصل الصيفي' : 'Summer Semester'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Template Info & Download */}
          <div className="flex flex-col gap-2 rounded-xl border border-teal-500/25 bg-teal-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">
                  {isAr ? 'نموذج شيت التسجيل المعتمد (.xlsx)' : 'Standard Enrollment Template'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? 'الأعمدة: كود الطالب | الفرقة | الحجب (مفعل / محجوب) | اسم الطالب (اختياري)'
                    : 'Columns: Student Code | Level | Status (مفعل / محجوب) | Name (Optional)'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="h-8 shrink-0 rounded-squircle border-teal-500/30 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300 gap-1.5 text-xs font-semibold"
            >
              {isDownloadingTemplate ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'تحميل النموذج' : 'Download Template'}</span>
            </Button>
          </div>

          {/* Skip Blocked Toggle */}
          <label className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-secondary/30 p-3 cursor-pointer hover:bg-secondary/50 transition-colors">
            <input
              type="checkbox"
              checked={skipBlocked}
              onChange={(e) => setSkipBlocked(e.target.checked)}
              disabled={isUploading}
              className="h-4 w-4 rounded text-primary focus:ring-primary"
            />
            <div className="space-y-0.5 text-start">
              <span className="text-xs font-semibold text-foreground">
                {isAr
                  ? 'استبعاد الطلاب المحجوبين لعدم سداد المصروفات تلقائياً (الحجب = محجوب)'
                  : 'Automatically skip students blocked for unpaid tuition (Status = محجوب)'}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {isAr
                  ? 'عند التفعيل، لن يتم تسجيل الطلاب الموسومين بـ "محجوب" في هذا المقرر الدراسي'
                  : 'When checked, students marked as blocked in the sheet will be skipped from enrollment'}
              </p>
            </div>
          </label>

          {/* File Upload Zone */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              {isAr ? 'ملف شيت الطلاب (.xlsx / .csv) *' : 'Students Sheet File (.xlsx / .csv) *'}
            </label>
            <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-surface/40 p-5 text-center transition-all hover:border-primary/50 hover:bg-primary/5">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={isUploading}
                className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <UploadCloud className="h-8 w-8 text-primary/70 mb-2" />
              {selectedFile ? (
                <div className="flex items-center gap-2 rounded-squircle bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{selectedFile.name}</span>
                  <span className="text-muted-foreground text-[10px]">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    {isAr
                      ? 'اضغط هنا أو اسحب الملف للإفلات'
                      : 'Click to browse or drag and drop file here'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {isAr
                      ? 'يدعم ملفات Excel (.xlsx, .xls) أو ملفات CSV حتى 10 ميجابايت'
                      : 'Supports Excel (.xlsx, .xls) or CSV files up to 10MB'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {isAr ? 'جاري معالجة وتسجيل الطلاب بالمقرر...' : 'Processing and enrolling students...'}
                </span>
                <span className="font-mono text-primary">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Results Summary Box */}
          {result && (
            <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/5 p-4 animate-in fade-in-50">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {isAr
                    ? `تقرير تسجيل الطلاب في المقرر (${result.courseCode})`
                    : `Registration Report for (${result.courseCode})`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-card/80 p-2 text-center border border-border/60">
                  <span className="text-muted-foreground text-[10px] block">
                    {isAr ? 'إجمالي الصفوف' : 'Total Rows'}
                  </span>
                  <span className="font-bold text-foreground text-sm">
                    {result.totalRows}
                  </span>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-center border border-emerald-500/20">
                  <span className="text-emerald-700 dark:text-emerald-400 text-[10px] block font-semibold">
                    {isAr ? 'تم تسجيلهم حديثاً' : 'Newly Enrolled'}
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                    {result.enrolledCount}
                  </span>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-2 text-center border border-blue-500/20">
                  <span className="text-blue-700 dark:text-blue-400 text-[10px] block font-semibold">
                    {isAr ? 'مسجلين مسبقاً' : 'Already Enrolled'}
                  </span>
                  <span className="font-bold text-blue-700 dark:text-blue-400 text-sm">
                    {result.alreadyEnrolledCount}
                  </span>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2 text-center border border-amber-500/20">
                  <span className="text-amber-700 dark:text-amber-400 text-[10px] block font-semibold">
                    {isAr ? 'محجوب / مستبعد' : 'Skipped Blocked'}
                  </span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 text-sm">
                    {result.skippedBlockedCount}
                  </span>
                </div>
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>
                      {isAr
                        ? `تنبيهات وأخطاء (${result.errorCount})`
                        : `Warnings & Errors (${result.errorCount})`}
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-danger/90 max-h-28 overflow-y-auto">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-5 flex items-center gap-2 rtl:sm:justify-start">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || !selectedFile || !courseId}
            className="rounded-squircle bg-primary px-5 font-semibold text-white shadow-md hover:bg-primary-hover gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{isAr ? 'جارٍ تسجيل الطلاب...' : 'Enrolling Students...'}</span>
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4" />
                <span>{isAr ? 'بدء تسجيل الطلاب بالمقرر' : 'Start Enrollment'}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="rounded-squircle text-muted-foreground hover:bg-secondary/60"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
