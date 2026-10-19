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
  BookOpen,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob, EXCEL_MIME_TYPE } from '@/lib/export-utils';
import { toast } from 'sonner';
import { readSheet as readXlsxFile } from 'read-excel-file/browser';
import { DataUploadProgress } from '@/components/ui/data-upload-progress';
import type { BatchUploadProgressState } from '@/features/uploads/use-batch-upload';

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progressState, setProgressState] = useState<BatchUploadProgressState>({
    isUploading: false,
    phase: 'idle',
    percentage: 0,
    currentBatch: 1,
    totalBatches: 1,
    processedRows: 0,
    totalRows: 0,
    elapsedSeconds: 0,
    estimatedSecondsLeft: null,
    rowsPerSecond: 0,
    isNetworkInterrupted: false,
    retrySecondsLeft: 0,
  });
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

  // Filter courses by selected level and registration semester
  const filteredCourses = availableCourses.filter((c) => {
    if (filterLevel !== 'all' && String(c.level) !== filterLevel) return false;
    if (semester && c.semester && c.semester !== 'both' && c.semester !== semester) return false;
    return true;
  });

  useEffect(() => {
    if (initialCourseId && availableCourses.length > 0) {
      setCourseId(initialCourseId);
      const match = availableCourses.find((c) => c._id === initialCourseId);
      if (match) {
        if (match.level) setFilterLevel(String(match.level));
        if (match.semester && ['first', 'second', 'summer'].includes(match.semester)) {
          setSemester(match.semester as 'first' | 'second' | 'summer');
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
      setProgressState((prev) => ({
        ...prev,
        isUploading: false,
        phase: 'idle',
        percentage: 0,
        processedRows: 0,
      }));
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
      setProgressState((prev) => ({
        ...prev,
        phase: 'idle',
        percentage: 0,
        processedRows: 0,
      }));
    }
  };

  const handleUpload = async () => {
    if (!courseId) {
      toast.error(isAr ? 'يرجى اختيار المقرر أولاً' : 'Please select a course');
      return;
    }
    if (!selectedFile) {
      toast.error(
        isAr ? 'يرجى اختيار ملف Excel للرفع' : 'Please select an Excel file',
      );
      return;
    }

    try {
      setIsUploading(true);
      setResult(null);

      const startTime = Date.now();
      let timer: NodeJS.Timeout | null = null;

      // Start live real-time elapsed counter
      timer = setInterval(() => {
        const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
        setProgressState((prev) => {
          if (!prev.isUploading) return prev;
          const speed =
            prev.processedRows > 0
              ? Math.round((prev.processedRows / elapsed) * 10) / 10
              : 0;
          const remainingRows = Math.max(0, prev.totalRows - prev.processedRows);
          const eta =
            speed > 0 && remainingRows > 0
              ? Math.ceil(remainingRows / speed)
              : null;
          return {
            ...prev,
            elapsedSeconds: elapsed,
            rowsPerSecond: speed,
            estimatedSecondsLeft: eta,
          };
        });
      }, 1000);

      // Attempt client-side parse for accurate batching and real row counts
      let parsedRows: Record<string, any>[] = [];
      const isExcel = /\.(xlsx|xls|ods)$/i.test(selectedFile.name);

      if (isExcel) {
        setProgressState({
          isUploading: true,
          phase: 'inspecting',
          percentage: 5,
          currentBatch: 1,
          totalBatches: 1,
          processedRows: 0,
          totalRows: 0,
          elapsedSeconds: 0,
          estimatedSecondsLeft: null,
          rowsPerSecond: 0,
          isNetworkInterrupted: false,
          retrySecondsLeft: 0,
        });

        try {
          const rawSheet = await readXlsxFile(selectedFile);
          if (rawSheet && rawSheet.length > 1) {
            const headers = rawSheet[0].map((h) => String(h ?? '').trim());
            for (let i = 1; i < rawSheet.length; i++) {
              const row = rawSheet[i];
              if (
                row &&
                row.some(
                  (cell) =>
                    cell !== null &&
                    cell !== undefined &&
                    String(cell).trim() !== '',
                )
              ) {
                const rowObj: Record<string, any> = {};
                headers.forEach((h, colIdx) => {
                  if (h) rowObj[h] = row[colIdx] ?? '';
                });
                parsedRows.push(rowObj);
              }
            }
          }
        } catch {
          // If readXlsxFile fails on unusual binary, fallback will be used
          parsedRows = [];
        }
      }

      // If client parsed rows successfully, process in batches of 150 rows
      if (parsedRows.length > 0) {
        const BATCH_SIZE = 150;
        const totalRowsCount = parsedRows.length;
        const batches: Record<string, any>[][] = [];
        for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
          batches.push(parsedRows.slice(i, i + BATCH_SIZE));
        }

        const totalBatches = batches.length;
        let cumulativeEnrolled = 0;
        let cumulativeAlready = 0;
        let cumulativeSkipped = 0;
        let cumulativeErrors: string[] = [];
        let finalCourseCode = '';
        let finalCourseName = '';

        for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
          const currentBatchRows = batches[bIdx];
          const processedSoFar = bIdx * BATCH_SIZE;
          const currentProcessed = Math.min(
            processedSoFar + currentBatchRows.length,
            totalRowsCount,
          );
          const percent = Math.min(
            99,
            Math.max(5, Math.round((currentProcessed / totalRowsCount) * 100)),
          );

          setProgressState((prev) => ({
            ...prev,
            isUploading: true,
            phase: 'uploading',
            percentage: percent,
            currentBatch: bIdx + 1,
            totalBatches,
            processedRows: currentProcessed,
            totalRows: totalRowsCount,
          }));

          const batchRes = await api.post<EnrollmentResult>(
            `/admin/courses/${courseId}/enroll-students-batch`,
            {
              academicYear,
              semester,
              rows: currentBatchRows,
            },
          );

          const data =
            batchRes.data ?? (batchRes as unknown as EnrollmentResult);
          finalCourseCode = data.courseCode || finalCourseCode;
          finalCourseName = data.courseName || finalCourseName;
          cumulativeEnrolled += data.enrolledCount || 0;
          cumulativeAlready += data.alreadyEnrolledCount || 0;
          cumulativeSkipped += data.skippedBlockedCount || 0;
          if (data.errors && data.errors.length > 0) {
            cumulativeErrors = [...cumulativeErrors, ...data.errors];
          }
        }

        if (timer) clearInterval(timer);
        const finalElapsed = Math.max(
          1,
          Math.floor((Date.now() - startTime) / 1000),
        );
        const finalSpeed =
          Math.round((totalRowsCount / finalElapsed) * 10) / 10;

        setProgressState({
          isUploading: false,
          phase: 'completed',
          percentage: 100,
          currentBatch: totalBatches,
          totalBatches,
          processedRows: totalRowsCount,
          totalRows: totalRowsCount,
          elapsedSeconds: finalElapsed,
          estimatedSecondsLeft: 0,
          rowsPerSecond: finalSpeed,
          isNetworkInterrupted: false,
          retrySecondsLeft: 0,
        });

        const combinedResult: EnrollmentResult = {
          courseId,
          courseCode: finalCourseCode,
          courseName: finalCourseName,
          totalRows: totalRowsCount,
          enrolledCount: cumulativeEnrolled,
          alreadyEnrolledCount: cumulativeAlready,
          skippedBlockedCount: cumulativeSkipped,
          errorCount: cumulativeErrors.length,
          errors: cumulativeErrors.slice(0, 20),
        };

        setResult(combinedResult);
        toast.success(
          isAr
            ? `تم تسجيل ${cumulativeEnrolled} طالب بنجاح في مقرر ${finalCourseCode || ''}`
            : `Successfully enrolled ${cumulativeEnrolled} students in ${finalCourseCode || ''}`,
        );

        if (onSuccess) onSuccess();
        return;
      }

      // Fallback: multipart Excel upload to fast server endpoint
      setProgressState({
        isUploading: true,
        phase: 'uploading',
        percentage: 30,
        currentBatch: 1,
        totalBatches: 1,
        processedRows: 0,
        totalRows: 0,
        elapsedSeconds: 0,
        estimatedSecondsLeft: null,
        rowsPerSecond: 0,
        isNetworkInterrupted: false,
        retrySecondsLeft: 0,
      });

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await api.post<EnrollmentResult>(
        `/admin/courses/${courseId}/enroll-students-excel`,
        formData,
        {
          params: { academicYear, semester },
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const bytePercent = Math.min(
                85,
                Math.max(
                  15,
                  Math.round(
                    (progressEvent.loaded * 85) / progressEvent.total,
                  ),
                ),
              );
              setProgressState((prev) => ({
                ...prev,
                percentage: bytePercent,
                phase: bytePercent >= 80 ? 'processing' : 'uploading',
              }));
            }
          },
        },
      );

      if (timer) clearInterval(timer);
      const data = res.data ?? (res as unknown as EnrollmentResult);
      const total =
        data.totalRows || data.enrolledCount + data.alreadyEnrolledCount;
      const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const speed = Math.round((total / elapsed) * 10) / 10;

      setProgressState({
        isUploading: false,
        phase: 'completed',
        percentage: 100,
        currentBatch: 1,
        totalBatches: 1,
        processedRows: total,
        totalRows: total,
        elapsedSeconds: elapsed,
        estimatedSecondsLeft: 0,
        rowsPerSecond: speed,
        isNetworkInterrupted: false,
        retrySecondsLeft: 0,
      });

      setResult(data);
      toast.success(
        isAr
          ? `تم تسجيل ${data.enrolledCount} طالب بنجاح في مقرر ${data.courseCode}`
          : `Successfully enrolled ${data.enrolledCount} students in ${data.courseCode}`,
      );

      if (onSuccess) onSuccess();
    } catch (err) {
      setProgressState((prev) => ({
        ...prev,
        isUploading: false,
        phase: 'error',
        percentage: 0,
      }));
      toast.error(
        getApiErrorMessage(
          err,
          isAr
            ? 'حدث خطأ أثناء تسجيل الطلاب بالمقرر'
            : 'Failed to enroll students',
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
          {/* Unified Configuration Card */}
          <div className="rounded-xl border border-border/80 bg-secondary/15 p-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {/* 1. Academic Year */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-foreground">
                  {isAr ? 'العام الأكاديمي' : 'Academic Year'}
                </label>
                <Select value={academicYear} onValueChange={setAcademicYear}>
                  <SelectTrigger disabled={isUploading} className="h-8 rounded-squircle border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                    <SelectItem value="2026-2027">2026-2027</SelectItem>
                    <SelectItem value="2025-2026">2025-2026</SelectItem>
                    <SelectItem value="2024-2025">2024-2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. Registration Semester */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-foreground">
                  {isAr ? 'الفصل الدراسي' : 'Semester'}
                </label>
                <Select
                  value={semester}
                  onValueChange={(val) => {
                    const s = val as 'first' | 'second' | 'summer';
                    setSemester(s);
                    const matched = availableCourses.filter(
                      (c) =>
                        (filterLevel === 'all' || String(c.level) === filterLevel) &&
                        (!c.semester || c.semester === 'both' || c.semester === s),
                    );
                    if (matched.length > 0) setCourseId(matched[0]._id);
                  }}
                >
                  <SelectTrigger disabled={isUploading} className="h-8 rounded-squircle border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                    <SelectItem value="first">{isAr ? 'الفصل الدراسي الأول' : 'First Semester'}</SelectItem>
                    <SelectItem value="second">{isAr ? 'الفصل الدراسي الثاني' : 'Second Semester'}</SelectItem>
                    <SelectItem value="summer">{isAr ? 'الفصل الصيفي' : 'Summer Semester'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Level Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-foreground">
                  {isAr ? 'الفرقة الدراسية' : 'Level'}
                </label>
                <Select
                  value={filterLevel}
                  onValueChange={(val) => {
                    setFilterLevel(val);
                    const matched = availableCourses.filter(
                      (c) =>
                        (val === 'all' || String(c.level) === val) &&
                        (!c.semester || c.semester === 'both' || c.semester === semester),
                    );
                    if (matched.length > 0) setCourseId(matched[0]._id);
                  }}
                >
                  <SelectTrigger disabled={isUploading} className="h-8 rounded-squircle border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card" dir={isAr ? 'rtl' : 'ltr'}>
                    <SelectItem value="all">{isAr ? 'جميع الفرق (الكل)' : 'All Levels'}</SelectItem>
                    <SelectItem value="1">{isAr ? 'الفرقة الأولى' : 'Level 1'}</SelectItem>
                    <SelectItem value="2">{isAr ? 'الفرقة الثانية' : 'Level 2'}</SelectItem>
                    <SelectItem value="3">{isAr ? 'الفرقة الثالثة' : 'Level 3'}</SelectItem>
                    <SelectItem value="4">{isAr ? 'الفرقة الرابعة' : 'Level 4'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target Course Selector */}
            <div className="space-y-1 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? 'المقرر الدراسي المستهدف *' : 'Target Course *'}</span>
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {isAr
                    ? `(${filteredCourses.length} مادة دراسية متاحة)`
                    : `(${filteredCourses.length} courses available)`}
                </span>
              </div>

              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger disabled={isUploading} className="w-full rounded-squircle border-border bg-card text-xs h-9">
                  <SelectValue
                    placeholder={
                      filteredCourses.length === 0
                        ? isAr
                          ? 'لا توجد مواد مطابقة للخيارات المحددة'
                          : 'No courses match criteria'
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

          {/* Upload Progress Bar (Unified Batch Architecture) */}
          {progressState.isUploading && (
            <div className="pt-1">
              <DataUploadProgress state={progressState} locale={locale} />
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
