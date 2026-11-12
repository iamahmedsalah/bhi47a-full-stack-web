'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  Users,
  FileSpreadsheet,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob, EXCEL_MIME_TYPE, CSV_MIME_TYPE } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataUploadProgress } from '@/components/ui/data-upload-progress';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { FilterBar } from '@/components/ui/filter-bar';
import type { BatchUploadProgressState } from '@/features/uploads/use-batch-upload';
import { extractRawSheetRows } from '@/features/uploads/pre-flight-inspector';

interface TuitionStudent {
  _id: string;
  studentCode: string;
  fullName: string;
  fullNameAr?: string;
  fullNameEn?: string;
  level: string;
  department?: string;
  isBlocked: boolean;
  tuitionFeesStatus: 'paid' | 'unpaid' | 'exempt';
  blockReason?: string;
  blockedAt?: string;
  unblockedAt?: string;
  createdAt: string;
  hasRecentChange?: boolean;
  recentChange?: {
    actionType: string;
    performedByName: string;
    changedAt: string;
  };
}

interface TuitionStats {
  total: number;
  blocked: number;
  paid: number;
  unpaid: number;
  exempt: number;
  changedInLast4Hours?: number;
}

interface StudentTuitionManagementProps {
  locale: string;
  canWrite: boolean;
}

export function StudentTuitionManagement({
  locale,
  canWrite,
}: StudentTuitionManagementProps) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const searchParams = useSearchParams();

  // Filters State (persisted across refreshes)
  const [page, setPage] = useState(() => Number(searchParams?.get('tuitionPage')) || 1);
  const [search, setSearch] = useState(() => searchParams?.get('tuitionSearch') || '');
  const [selectedLevel, setSelectedLevel] = useState<string>(() => searchParams?.get('tuitionLevel') || 'all');
  const [selectedBlockStatus, setSelectedBlockStatus] = useState<string>(() => searchParams?.get('tuitionBlock') || 'all');
  const [selectedTuitionStatus, setSelectedTuitionStatus] = useState<string>(() => searchParams?.get('tuitionStatus') || 'all');
  const [filterRecentChanges, setFilterRecentChanges] = useState<boolean>(() => searchParams?.get('tuitionRecent') === 'true');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('tab') === 'tuition') {
          if (page > 1) url.searchParams.set('tuitionPage', String(page));
          else url.searchParams.delete('tuitionPage');

          if (search) url.searchParams.set('tuitionSearch', search);
          else url.searchParams.delete('tuitionSearch');

          if (selectedLevel !== 'all') url.searchParams.set('tuitionLevel', selectedLevel);
          else url.searchParams.delete('tuitionLevel');

          if (selectedBlockStatus !== 'all') url.searchParams.set('tuitionBlock', selectedBlockStatus);
          else url.searchParams.delete('tuitionBlock');

          if (selectedTuitionStatus !== 'all') url.searchParams.set('tuitionStatus', selectedTuitionStatus);
          else url.searchParams.delete('tuitionStatus');

          if (filterRecentChanges) url.searchParams.set('tuitionRecent', 'true');
          else url.searchParams.delete('tuitionRecent');

          window.history.replaceState(null, '', url.toString());
        }
      } catch {}
    }
  }, [page, search, selectedLevel, selectedBlockStatus, selectedTuitionStatus, filterRecentChanges]);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progressState, setProgressState] = useState<BatchUploadProgressState>({
    isUploading: false,
    phase: 'idle',
    percentage: 0,
    currentBatch: 0,
    totalBatches: 0,
    processedRows: 0,
    totalRows: 0,
    elapsedSeconds: 0,
    estimatedSecondsLeft: null,
    rowsPerSecond: 0,
    isNetworkInterrupted: false,
    retrySecondsLeft: 0,
  });
  const [uploadResult, setUploadResult] = useState<{
    totalRows: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);

  // Bulk confirmation dialogs
  const [isBulkBlockOpen, setIsBulkBlockOpen] = useState(false);
  const [isBulkUnblockOpen, setIsBulkUnblockOpen] = useState(false);

  // 1. Fetch Summary Statistics
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery<TuitionStats>({
    queryKey: ['admin-tuition-stats'],
    queryFn: async () => {
      const res = await api.get<TuitionStats>('/admin/students/tuition/stats');
      return res.data;
    },
  });

  // 2. Fetch Students Tuition List
  const {
    data: listData,
    isLoading: isListLoading,
    isFetching,
    refetch: refetchList,
  } = useQuery<{
    items: TuitionStudent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: [
      'admin-tuition-list',
      page,
      search,
      selectedLevel,
      selectedBlockStatus,
      selectedTuitionStatus,
      filterRecentChanges,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        limit: 20,
      };
      if (search.trim()) params.search = search.trim();
      if (selectedLevel !== 'all') params.level = selectedLevel;
      if (selectedBlockStatus !== 'all') params.isBlocked = selectedBlockStatus;
      if (selectedTuitionStatus !== 'all') params.tuitionFeesStatus = selectedTuitionStatus;
      if (filterRecentChanges) params.changedInLastHours = 'true';

      const res = await api.get('/admin/students/tuition/list', { params });
      return res.data;
    },
  });

  const students = listData?.items || [];
  const totalStudents = listData?.total || 0;
  const totalPages = listData?.totalPages || 1;

  // Single Toggle Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({
      studentId,
      isBlocked,
      tuitionFeesStatus,
    }: {
      studentId: string;
      isBlocked: boolean;
      tuitionFeesStatus?: 'paid' | 'unpaid';
    }) => {
      const res = await api.patch(`/admin/students/tuition/${studentId}/status`, {
        isBlocked,
        tuitionFeesStatus,
        blockReason: isBlocked ? 'عدم سداد المصروفات الدراسية' : undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || (isAr ? 'تم تحديث حالة الطالب بنجاح' : 'Status updated successfully'));
      void queryClient.invalidateQueries({ queryKey: ['admin-tuition-list'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-tuition-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل تحديث حالة الطالب' : 'Failed to update status'));
    },
  });

  // Bulk Toggle Mutation
  const bulkToggleMutation = useMutation({
    mutationFn: async ({
      studentIds,
      isBlocked,
    }: {
      studentIds: string[];
      isBlocked: boolean;
    }) => {
      const res = await api.post('/admin/students/tuition/bulk-toggle', {
        studentIds,
        isBlocked,
        tuitionFeesStatus: isBlocked ? 'unpaid' : 'paid',
        blockReason: isBlocked ? 'عدم سداد المصروفات الدراسية' : undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || (isAr ? 'تم تحديث الطلاب المحددين بنجاح' : 'Bulk update successful'));
      setSelectedIds([]);
      setIsBulkBlockOpen(false);
      setIsBulkUnblockOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-tuition-list'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-tuition-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل التحديث الجماعي' : 'Bulk update failed'));
    },
  });

  // Download Template
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    try {
      setIsDownloadingTemplate(true);
      const res = await api.get('/admin/students/tuition/template', {
        params: { format },
        responseType: 'blob',
      });
      await downloadFileBlob(
        res,
        format === 'csv'
          ? 'tuition-fees-template.csv'
          : 'tuition-fees-and-block-template.xlsx',
        format === 'csv' ? CSV_MIME_TYPE : EXCEL_MIME_TYPE,
      );
      toast.success(isAr ? 'تم تحميل نموذج كشف المصروفات بنجاح' : 'Tuition template downloaded');
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل تحميل النموذج' : 'Failed to download template'));
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Export Filtered Tuition to Excel
  const handleExportTuition = async () => {
    try {
      setIsExporting(true);
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (selectedLevel !== 'all') params.level = selectedLevel;
      if (selectedBlockStatus !== 'all') params.isBlocked = selectedBlockStatus;
      if (selectedTuitionStatus !== 'all') params.tuitionFeesStatus = selectedTuitionStatus;
      if (filterRecentChanges) params.changedInLastHours = 'true';

      const res = await api.get('/admin/students/tuition/export', {
        params,
        responseType: 'blob',
      });
      const timestamp = new Date().toISOString().slice(0, 10);
      await downloadFileBlob(
        res,
        `tuition-and-block-report-${timestamp}.xlsx`,
        EXCEL_MIME_TYPE,
      );
      toast.success(
        isAr
          ? 'تم تصدير كشف المصروفات والحجب بنجاح'
          : 'Tuition and block report exported successfully',
      );
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'فشل تصدير كشف المصروفات' : 'Failed to export tuition report',
        ),
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Upload Excel File with Real Client Batching & Progress
  const handleUploadExcel = async () => {
    if (!uploadFile) {
      toast.error(isAr ? 'يرجى اختيار ملف Excel أو CSV أولاً' : 'Please select a file first');
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);
      const startTime = Date.now();

      setProgressState({
        isUploading: true,
        phase: 'uploading',
        percentage: 5,
        currentBatch: 0,
        totalBatches: 1,
        processedRows: 0,
        totalRows: 0,
        elapsedSeconds: 0,
        estimatedSecondsLeft: null,
        rowsPerSecond: 0,
        isNetworkInterrupted: false,
        retrySecondsLeft: 0,
      });

      // 1. Try client-side parsing into row batches for real batch progress
      let parsedHeaders: string[] = [];
      let parsedRawRows: (string | number | boolean | null)[][] = [];
      try {
        const sheetResult = await extractRawSheetRows(uploadFile);
        parsedHeaders = sheetResult.headers;
        parsedRawRows = sheetResult.rawRows;
      } catch {
        // Fallback to server-side multipart processing if client parsing encounters unsupported format
      }

      if (parsedHeaders.length > 0 && parsedRawRows.length > 0) {
        // Map raw cells into row objects keyed by header names
        const objectRows: Record<string, any>[] = parsedRawRows
          .map((row) => {
            const obj: Record<string, any> = {};
            parsedHeaders.forEach((h, idx) => {
              if (h) obj[h] = row[idx];
            });
            return obj;
          })
          .filter((obj) =>
            Object.values(obj).some(
              (v) => v !== null && v !== undefined && String(v).trim() !== '',
            ),
          );

        if (objectRows.length > 0) {
          const BATCH_SIZE = 150;
          const chunks: Record<string, any>[][] = [];
          for (let i = 0; i < objectRows.length; i += BATCH_SIZE) {
            chunks.push(objectRows.slice(i, i + BATCH_SIZE));
          }

          let accumulatedUpdated = 0;
          let accumulatedErrors = 0;
          const collectedErrors: string[] = [];

          for (let b = 0; b < chunks.length; b++) {
            const currentChunk = chunks[b];
            const batchNum = b + 1;

            const res = await api.post<{
              totalRows: number;
              updatedCount: number;
              errorCount: number;
              errors: string[];
            }>('/admin/students/tuition/batch', {
              rows: currentChunk,
              batchIndex: b,
              totalBatches: chunks.length,
            });

            const data = res.data ?? (res as unknown as {
              totalRows: number;
              updatedCount: number;
              errorCount: number;
              errors: string[];
            });

            accumulatedUpdated += data.updatedCount ?? 0;
            accumulatedErrors += data.errorCount ?? 0;
            if (data.errors && Array.isArray(data.errors)) {
              collectedErrors.push(...data.errors);
            }

            const processedCount = Math.min(objectRows.length, batchNum * BATCH_SIZE);
            const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
            const pct = Math.round((batchNum / chunks.length) * 100);
            const speed = Math.round((processedCount / elapsed) * 10) / 10;
            const remainingBatches = chunks.length - batchNum;
            const estSeconds =
              remainingBatches > 0
                ? Math.max(0, Math.round((remainingBatches * elapsed) / batchNum))
                : 0;

            setProgressState({
              isUploading: true,
              phase: 'processing',
              percentage: pct,
              currentBatch: batchNum,
              totalBatches: chunks.length,
              processedRows: processedCount,
              totalRows: objectRows.length,
              elapsedSeconds: elapsed,
              estimatedSecondsLeft: estSeconds,
              rowsPerSecond: speed,
              isNetworkInterrupted: false,
              retrySecondsLeft: 0,
            });
          }

          const finalElapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
          setProgressState({
            isUploading: false,
            phase: 'completed',
            percentage: 100,
            currentBatch: chunks.length,
            totalBatches: chunks.length,
            processedRows: objectRows.length,
            totalRows: objectRows.length,
            elapsedSeconds: finalElapsed,
            estimatedSecondsLeft: 0,
            rowsPerSecond: Math.round((objectRows.length / finalElapsed) * 10) / 10,
            isNetworkInterrupted: false,
            retrySecondsLeft: 0,
          });

          setUploadResult({
            totalRows: objectRows.length,
            updatedCount: accumulatedUpdated,
            errorCount: accumulatedErrors,
            errors: collectedErrors,
          });

          if (accumulatedUpdated > 0) {
            toast.success(
              isAr
                ? `تم تحديث حالة المصروفات والحجب لـ ${accumulatedUpdated} طالب بنجاح!`
                : `Updated tuition & block status for ${accumulatedUpdated} students successfully!`,
            );
            void queryClient.invalidateQueries({ queryKey: ['admin-tuition-list'] });
            void queryClient.invalidateQueries({ queryKey: ['admin-tuition-stats'] });
            void queryClient.invalidateQueries({ queryKey: ['students'] });
          } else if (accumulatedErrors > 0) {
            toast.error(isAr ? 'حدثت أخطاء أثناء التحديث' : 'Errors occurred during import');
          }
          return;
        }
      }

      // 2. Fallback to single multipart upload if client parsing not viable
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await api.post<{
        totalRows: number;
        updatedCount: number;
        errorCount: number;
        errors: string[];
      }>('/admin/students/tuition/upload-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data ?? (res as unknown as {
        totalRows: number;
        updatedCount: number;
        errorCount: number;
        errors: string[];
      });

      const total = data.totalRows || data.updatedCount;
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

      setUploadResult(data);
      if (data.updatedCount > 0) {
        toast.success(
          isAr
            ? `تم تحديث حالة المصروفات والحجب لـ ${data.updatedCount} طالب بنجاح!`
            : `Updated tuition & block status for ${data.updatedCount} students successfully!`,
        );
        void queryClient.invalidateQueries({ queryKey: ['admin-tuition-list'] });
        void queryClient.invalidateQueries({ queryKey: ['admin-tuition-stats'] });
        void queryClient.invalidateQueries({ queryKey: ['students'] });
      } else if (data.errorCount > 0) {
        toast.error(isAr ? 'حدثت أخطاء في بعض السطور' : 'Errors occurred during import');
      }
    } catch (err) {
      setProgressState((prev) => ({
        ...prev,
        isUploading: false,
        phase: 'error',
      }));
      toast.error(getApiErrorMessage(err, isAr ? 'فشل استيراد الملف' : 'Failed to import file'));
    } finally {
      setIsUploading(false);
    }
  };

  // Selection helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(students.map((s) => s._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Summary Statistics Cards */}
      <StatCardRow>
        <StatCard
          title={isAr ? 'إجمالي الطلاب المقيدين' : 'Total Students'}
          value={isStatsLoading ? '...' : (stats?.total ?? 0).toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          color="#0D9488"
          subtitle={isAr ? 'المسجلين بالمنظومة' : 'Active Registry'}
        />
        <StatCard
          title={isAr ? 'مسددي المصروفات (مفعل)' : 'Paid Tuition (Active)'}
          value={isStatsLoading ? '...' : (stats?.paid ?? 0).toLocaleString()}
          icon={<ShieldCheck className="h-5 w-5" />}
          color="#10B981"
          subtitle={isAr ? 'مسموح لهم بالخدمات والكويزات' : 'Full system & quiz access'}
        />
        <StatCard
          title={isAr ? 'غير مسددين (محجوب)' : 'Unpaid (Blocked)'}
          value={isStatsLoading ? '...' : (stats?.blocked ?? 0).toLocaleString()}
          icon={<ShieldAlert className="h-5 w-5" />}
          color="#F43F5E"
          subtitle={isAr ? 'محجوب عنهم الكويزات والمنهج' : 'Syllabus & quizzes withheld'}
        />
        <StatCard
          title={isAr ? 'حالات الإعفاء' : 'Fee Exemptions'}
          value={isStatsLoading ? '...' : (stats?.exempt ?? 0).toLocaleString()}
          icon={<CreditCard className="h-5 w-5" />}
          color="#0EA5E9"
          subtitle={isAr ? 'معفيون بقرار إداري' : 'Special grant / exempt'}
        />
        <StatCard
          title={isAr ? 'تعديلات آخر 4 ساعات' : 'Recent 4h Changes'}
          value={isStatsLoading ? '...' : (stats?.changedInLast4Hours ?? 0).toLocaleString()}
          icon={<Clock className="h-5 w-5" />}
          color="#F59E0B"
          subtitle={isAr ? 'تحديثات الحجب وسداد المصروفات' : 'Tuition & block updates'}
        />
      </StatCardRow>

      {/* 2. Action Header: Bulk Excel Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground font-medium">
          {isAr
            ? 'تصفية وبحث الطلاب للتحكم في سداد الرسوم وحجب الحسابات'
            : 'Filter and manage student tuition payment and account access'}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Filtered Tuition */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportTuition}
            disabled={isExporting}
            className="h-9 rounded-squircle border-border text-xs font-semibold gap-1.5 cursor-pointer bg-card/60 hover:bg-secondary/70"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{isAr ? 'تصدير الكشف (.xlsx)' : 'Export List (.xlsx)'}</span>
          </Button>

          {/* Download Template */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleDownloadTemplate('xlsx')}
            disabled={isDownloadingTemplate}
            className="h-9 rounded-squircle border-border text-xs font-semibold gap-1.5 cursor-pointer bg-card/60 hover:bg-secondary/70"
          >
            {isDownloadingTemplate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 text-teal-500" />
            )}
            <span>{isAr ? 'تحميل شيت النموذج (.xlsx)' : 'Download Template'}</span>
          </Button>

          {/* Upload Excel Button */}
          {canWrite && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setUploadFile(null);
                setUploadResult(null);
                setProgressState((prev) => ({
                  ...prev,
                  phase: 'idle',
                  percentage: 0,
                  processedRows: 0,
                }));
                setIsUploadOpen(true);
              }}
              className="h-9 rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 shadow-sm cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{isAr ? 'استيراد كشف المصروفات والحجب' : 'Upload Tuition Sheet'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. FilterBar matching Students Directory */}
      <FilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={isAr ? 'بحث بالكود أو الاسم...' : 'Search by code or name...'}
      >
        {/* Level Filter */}
        <Select
          value={selectedLevel}
          onValueChange={(val) => {
            setSelectedLevel(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[150px] text-xs h-10 rounded-squircle">
            <SelectValue placeholder={isAr ? 'المستوى' : 'Level'} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-xs" dir={isAr ? 'rtl' : 'ltr'}>
            <SelectItem value="all">{isAr ? 'جميع المستويات' : 'All Levels'}</SelectItem>
            <SelectItem value="1">{isAr ? 'المستوى الأول' : 'Level 1'}</SelectItem>
            <SelectItem value="2">{isAr ? 'المستوى الثاني' : 'Level 2'}</SelectItem>
            <SelectItem value="3">{isAr ? 'المستوى الثالث' : 'Level 3'}</SelectItem>
            <SelectItem value="4">{isAr ? 'المستوى الرابع' : 'Level 4'}</SelectItem>
          </SelectContent>
        </Select>

        {/* Block Status Filter */}
        <Select
          value={selectedBlockStatus}
          onValueChange={(val) => {
            setSelectedBlockStatus(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[160px] text-xs h-10 rounded-squircle">
            <SelectValue placeholder={isAr ? 'حالة الحجب' : 'Block Status'} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-xs" dir={isAr ? 'rtl' : 'ltr'}>
            <SelectItem value="all">{isAr ? 'الحجب: الكل' : 'All Block Status'}</SelectItem>
            <SelectItem value="false">{isAr ? 'مفعل (نشط)' : 'Active (Unblocked)'}</SelectItem>
            <SelectItem value="true">{isAr ? 'محجوب (غير مسدد)' : 'Blocked (Unpaid)'}</SelectItem>
          </SelectContent>
        </Select>

        {/* Tuition Status Filter */}
        <Select
          value={selectedTuitionStatus}
          onValueChange={(val) => {
            setSelectedTuitionStatus(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full border-border bg-secondary/50 lg:w-[160px] text-xs h-10 rounded-squircle">
            <SelectValue placeholder={isAr ? 'حالة المصروفات' : 'Tuition Status'} />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-xs" dir={isAr ? 'rtl' : 'ltr'}>
            <SelectItem value="all">{isAr ? 'المصروفات: الكل' : 'All Tuition'}</SelectItem>
            <SelectItem value="paid">{isAr ? 'مسدد بالكامل' : 'Paid'}</SelectItem>
            <SelectItem value="unpaid">{isAr ? 'غير مسدد' : 'Unpaid'}</SelectItem>
            <SelectItem value="exempt">{isAr ? 'معفى من الرسوم' : 'Exempt'}</SelectItem>
          </SelectContent>
        </Select>

        {/* 4h Changes Quick Filter Toggle */}
        <Button
          type="button"
          variant={filterRecentChanges ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setFilterRecentChanges((prev) => !prev);
            setPage(1);
          }}
          className={`h-10 px-3 rounded-squircle text-xs font-semibold gap-1.5 cursor-pointer shrink-0 transition-colors ${
            filterRecentChanges
              ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-sm'
              : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
          }`}
          title={isAr ? 'تصفية الطلاب الذين طرأت عليهم تعديلات خلال آخر 4 ساعات' : 'Filter students modified in last 4 hours'}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{isAr ? 'تعديلات 4س' : '4h Changes'}</span>
          {typeof stats?.changedInLast4Hours === 'number' && stats.changedInLast4Hours > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                filterRecentChanges
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              }`}
            >
              {stats.changedInLast4Hours}
            </span>
          )}
        </Button>

        {/* Refresh Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void refetchList();
            void refetchStats();
          }}
          disabled={isFetching}
          className="h-10 w-10 p-0 rounded-squircle text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0 border-border bg-secondary/50"
          title={isAr ? 'تحديث البيانات' : 'Refresh'}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </FilterBar>

      {/* 3. Bulk Action Bar (Visible when rows selected) */}
      {selectedIds.length > 0 && canWrite && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold text-primary">
              {isAr
                ? `تم تحديد ${selectedIds.length} طالب`
                : `${selectedIds.length} students selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setIsBulkBlockOpen(true)}
              disabled={bulkToggleMutation.isPending}
              className="h-7 rounded-squircle bg-rose-600 text-[11px] font-bold text-white hover:bg-rose-700 gap-1"
            >
              <ShieldAlert className="h-3 w-3" />
              <span>{isAr ? 'حجب المحددين' : 'Block Selected'}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setIsBulkUnblockOpen(true)}
              disabled={bulkToggleMutation.isPending}
              className="h-7 rounded-squircle bg-emerald-600 text-[11px] font-bold text-white hover:bg-emerald-700 gap-1"
            >
              <ShieldCheck className="h-3 w-3" />
              <span>{isAr ? 'إلغاء حجب المحددين' : 'Unblock Selected'}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="h-7 rounded-squircle text-[11px] text-muted-foreground hover:bg-secondary/60"
            >
              {isAr ? 'إلغاء التحديد' : 'Clear'}
            </Button>
          </div>
        </div>
      )}

      {/* 4. Tuition Table */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-border/80 bg-secondary/30 font-semibold text-muted-foreground">
              <tr>
                {canWrite && (
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={students.length > 0 && selectedIds.length === students.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-start">{isAr ? 'كود الطالب' : 'Student Code'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'اسم الطالب' : 'Student Name'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'المستوى / القسم' : 'Level / Dept'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'حالة المصروفات' : 'Tuition Status'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'حالة الحجب' : 'Block Status'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'السبب وتاريخ التحديث' : 'Reason / Updated'}</th>
                {canWrite && (
                  <th className="px-4 py-3 text-center">{isAr ? 'إجراء سريع' : 'Quick Action'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isListLoading ? (
                <tr>
                  <td colSpan={canWrite ? 8 : 7} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary mb-2" />
                    <span>{isAr ? 'جاري تحميل سجلات المصروفات...' : 'Loading tuition records...'}</span>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 8 : 7} className="py-12 text-center text-muted-foreground">
                    <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-semibold">
                      {isAr ? 'لا توجد سجلات مطابقة للبحث' : 'No matching tuition records found'}
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const isSelected = selectedIds.includes(student._id);
                  const isBlocked = student.isBlocked === true;

                  return (
                    <tr
                      key={student._id}
                      className={`transition-colors hover:bg-secondary/30 ${
                        isSelected ? 'bg-primary/5' : ''
                      } ${isBlocked ? 'bg-rose-500/[0.02]' : ''}`}
                    >
                      {canWrite && (
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(student._id)}
                            className="h-3.5 w-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Student Code */}
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        <span className="bg-secondary/50 px-2 py-0.5 rounded-squircle border border-border/50">
                          {student.studentCode}
                        </span>
                      </td>

                      {/* Full Name */}
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>
                          <span>{isAr ? student.fullNameAr || student.fullName : student.fullName}</span>
                          {student.fullNameAr && !isAr && (
                            <span className="block text-[10px] text-muted-foreground">{student.fullNameAr}</span>
                          )}
                        </div>
                      </td>

                      {/* Level & Department */}
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">
                            {isAr ? `المستوى ${student.level || 1}` : `L${student.level || 1}`}
                          </span>
                          {student.department && (
                            <span className="text-[10px] bg-secondary/60 px-1.5 py-0.5 rounded border border-border/40">
                              {student.department}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tuition Status Badge */}
                      <td className="px-4 py-3">
                        {student.tuitionFeesStatus === 'paid' ? (
                          <span className="inline-flex items-center gap-1 rounded-squircle bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {isAr ? 'مسدد المصروفات' : 'Paid'}
                          </span>
                        ) : student.tuitionFeesStatus === 'exempt' ? (
                          <span className="inline-flex items-center gap-1 rounded-squircle bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                            {isAr ? 'معفي من المصروفات' : 'Exempt'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-squircle bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            {isAr ? 'غير مسدد' : 'Unpaid'}
                          </span>
                        )}
                      </td>

                      {/* Account Block Status */}
                      <td className="px-4 py-3">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-squircle bg-rose-600/15 px-2.5 py-1 text-[11px] font-black text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="h-3 w-3 text-rose-500" />
                            <span>{isAr ? 'محجوب' : 'Blocked'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-squircle bg-emerald-600/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3 text-emerald-500" />
                            <span>{isAr ? 'مفعل' : 'Active'}</span>
                          </span>
                        )}
                      </td>

                      {/* Reason & Date / Recent Audit Info */}
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">
                        <div className="space-y-1">
                          {isBlocked ? (
                            <span className="text-rose-500/90 font-medium block">
                              {student.blockReason || (isAr ? 'عدم سداد المصروفات' : 'Unpaid tuition')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 block">—</span>
                          )}

                          {student.hasRecentChange && student.recentChange && (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium" title={student.recentChange.changedAt}>
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              <span>
                                {isAr
                                  ? `تعديل حديث: ${student.recentChange.performedByName || 'مشرف'}`
                                  : `Updated: ${student.recentChange.performedByName || 'Staff'}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Quick Action Button */}
                      {canWrite && (
                        <td className="px-4 py-3 text-center">
                          {isBlocked ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  studentId: student._id,
                                  isBlocked: false,
                                  tuitionFeesStatus: 'paid',
                                })
                              }
                              disabled={toggleStatusMutation.isPending}
                              className="h-7 rounded-squircle border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 text-[11px] font-bold gap-1 cursor-pointer"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>{isAr ? 'إلغاء الحجب' : 'Unblock'}</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  studentId: student._id,
                                  isBlocked: true,
                                  tuitionFeesStatus: 'unpaid',
                                })
                              }
                              disabled={toggleStatusMutation.isPending}
                              className="h-7 rounded-squircle border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 text-[11px] font-bold gap-1 cursor-pointer"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              <span>{isAr ? 'حجب' : 'Block'}</span>
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/80 px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              {isAr
                ? `صفحة ${page} من ${totalPages} (إجمالي ${totalStudents} طالب)`
                : `Page ${page} of ${totalPages} (${totalStudents} students)`}
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 rounded-squircle text-xs"
              >
                {isAr ? 'السابق' : 'Previous'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 rounded-squircle text-xs"
              >
                {isAr ? 'التالي' : 'Next'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Upload Excel Dialog with Batching Progress */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent
          className="glass max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl border border-white/10 p-6 text-start"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader className="border-b border-border/70 pb-3 text-start">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Upload className="h-5 w-5 text-primary" />
              <span>{isAr ? 'استيراد وتحديث كشف المصروفات والحجب' : 'Upload Tuition & Block Status'}</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {isAr
                ? 'تحديث حالة سداد المصروفات وحجب الطلاب دفعة واحدة عبر ملف Excel مع التحقق الآمن'
                : 'Batch-update tuition fees and account block status via Excel sheet'}
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            {/* Template Info Card */}
            <div className="flex items-center justify-between rounded-xl border border-teal-500/25 bg-teal-500/5 p-3 text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-muted-foreground">
                  {isAr
                    ? 'الأعمدة: كود الطالب | المستوى | حالة المصروفات | الحجب'
                    : 'Columns: Student Code | Level | Tuition Status | Block'}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDownloadTemplate('xlsx')}
                disabled={isDownloadingTemplate}
                className="h-7 text-[11px] font-semibold text-teal-700 hover:bg-teal-500/10 dark:text-teal-300 gap-1 rounded-squircle"
              >
                <Download className="h-3 w-3" />
                <span>{isAr ? 'النموذج' : 'Template'}</span>
              </Button>
            </div>

            {/* File Drag & Drop */}
            <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-surface/40 p-5 text-center transition-all hover:border-primary/50 hover:bg-primary/5">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setUploadFile(f);
                    setUploadResult(null);
                    setProgressState((prev) => ({
                      ...prev,
                      phase: 'idle',
                      percentage: 0,
                      processedRows: 0,
                    }));
                  }
                }}
                disabled={isUploading}
                className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <FileSpreadsheet className="h-8 w-8 text-primary/70 mb-2" />
              {uploadFile ? (
                <div className="flex items-center gap-2 rounded-squircle bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <span>{uploadFile.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({(uploadFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {isAr ? 'اضغط لاختيار ملف Excel أو اسحبه هنا' : 'Click or drag Excel file here'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isAr ? 'يدعم ملفات (.xlsx, .csv) حتى 10 ميجابايت' : 'Supports .xlsx, .csv up to 10MB'}
                  </p>
                </div>
              )}
            </div>

            {/* Unified Batch/Upload Progress Bar */}
            {(isUploading || progressState.phase === 'completed') && (
              <div className="mt-2">
                <DataUploadProgress state={progressState} locale={locale} />
              </div>
            )}

            {/* Results Feedback */}
            {uploadResult && (
              <div
                className={`rounded-xl border p-3.5 text-xs space-y-2 animate-in fade-in ${
                  uploadResult.errorCount > 0 && uploadResult.updatedCount === 0
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {uploadResult.updatedCount > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                  )}
                  <span>
                    {isAr
                      ? `تمت معالجة ${uploadResult.totalRows} صف: تم تحديث ${uploadResult.updatedCount} طالب بنجاح`
                      : `Processed ${uploadResult.totalRows} rows: ${uploadResult.updatedCount} students updated`}
                  </span>
                </div>

                {uploadResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1 text-[11px] text-rose-300 border-t border-rose-500/20 pt-2">
                    <p className="font-bold">
                      {isAr ? 'أخطاء وتنبيهات في بعض السطور:' : 'Row warnings/errors:'}
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                      {uploadResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2 border-t border-border/80 pt-4 rtl:sm:justify-start">
            <Button
              type="button"
              disabled={!uploadFile || isUploading}
              onClick={handleUploadExcel}
              className="rounded-squircle bg-primary text-xs font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'بدء التحديث والاستيراد' : 'Start Update'}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsUploadOpen(false)}
              className="rounded-squircle text-xs cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Block Confirmation */}
      <ConfirmDialog
        open={isBulkBlockOpen}
        onOpenChange={setIsBulkBlockOpen}
        title={isAr ? 'تأكيد حجب الطلاب المحددين' : 'Confirm Bulk Block'}
        description={
          isAr
            ? `هل أنت متأكد من حجب ${selectedIds.length} طالب لعدم سداد المصروفات الدراسية؟ سيتم منعهم من الوصول للكويزات وتحميل المناهج حتى تسوية المصروفات.`
            : `Are you sure you want to block ${selectedIds.length} selected students? They will be restricted from quizzes and syllabus access until tuition is settled.`
        }
        confirmLabel={isAr ? 'حجب الحسابات' : 'Block Accounts'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        onConfirm={() =>
          bulkToggleMutation.mutate({
            studentIds: selectedIds,
            isBlocked: true,
          })
        }
        destructive
      />

      {/* Bulk Unblock Confirmation */}
      <ConfirmDialog
        open={isBulkUnblockOpen}
        onOpenChange={setIsBulkUnblockOpen}
        title={isAr ? 'تأكيد إلغاء حجب وتفعيل الطلاب' : 'Confirm Bulk Unblock'}
        description={
          isAr
            ? `هل أنت متأكد من إلغاء حجب وتفعيل ${selectedIds.length} طالب؟ سيتم تمكين وصولهم لكافة الخدمات والكويزات.`
            : `Are you sure you want to unblock ${selectedIds.length} selected students? All portal services will be restored.`
        }
        confirmLabel={isAr ? 'إلغاء الحجب والتفعيل' : 'Unblock & Activate'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        onConfirm={() =>
          bulkToggleMutation.mutate({
            studentIds: selectedIds,
            isBlocked: false,
          })
        }
      />
    </div>
  );
}
