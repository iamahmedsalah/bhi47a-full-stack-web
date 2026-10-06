'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadExcel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { PreFlightResult, UploadCatalogType, UploadResult } from '@/features/uploads/types';
import {
  UPLOAD_CATALOGS,
  downloadCsvTemplate,
  downloadOfficialTemplate,
} from '@/features/uploads/upload-catalog';
import { inspectAndValidateFile } from '@/features/uploads/pre-flight-inspector';
import { ExcelPreviewGrid } from '@/features/uploads/components/excel-preview-grid';

function isNetworkError(err: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!err) return false;
  if (
    err.code === 'ERR_NETWORK' ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ETIMEDOUT'
  ) {
    return true;
  }
  if (
    err.message &&
    /network|offline|internet|timeout|failed to fetch/i.test(err.message)
  ) {
    return true;
  }
  if (!err.response && Boolean(err.request)) return true;
  return false;
}

export interface DataUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  uploadType: string;
  expectedColumns?: string[];
  onSuccess?: (result: UploadResult) => void;
}

export function DataUploadDialog({
  open,
  onOpenChange,
  title,
  description,
  uploadType,
  expectedColumns,
  onSuccess,
}: DataUploadDialogProps) {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const catalogType = (
    uploadType in UPLOAD_CATALOGS ? uploadType : 'students'
  ) as UploadCatalogType;
  const catalog = UPLOAD_CATALOGS[catalogType];

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Pre-flight inspection state
  const [isInspecting, setIsInspecting] = useState(false);
  const [preview, setPreview] = useState<PreFlightResult | null>(null);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  // Resilient batching & network recovery state
  const [batchInfo, setBatchInfo] = useState<{
    currentBatch: number;
    totalBatches: number;
    processedRows: number;
    totalRows: number;
  } | null>(null);
  const [isNetworkInterrupted, setIsNetworkInterrupted] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
  const isAbortedRef = React.useRef(false);
  const retryTriggerRef = React.useRef<(() => void) | null>(null);

  // Error search filter
  const [errorSearch, setErrorSearch] = useState('');

  const resetState = () => {
    setFile(null);
    setIsDragging(false);
    setIsDownloadingTemplate(false);
    setIsInspecting(false);
    setPreview(null);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStartTime(null);
    setResult(null);
    setError('');
    setErrorSearch('');
    setBatchInfo(null);
    setIsNetworkInterrupted(false);
    setRetrySecondsLeft(0);
    isAbortedRef.current = false;
  };

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  // Handle file selection and live pre-flight inspection
  const handleSelectFile = async (selectedFile?: File | null) => {
    if (!selectedFile) return;

    const isAllowed = /\.(xlsx|xls|csv)$/i.test(selectedFile.name);
    if (!isAllowed) {
      setError(
        isAr
          ? 'يرجى اختيار ملف بصيغة XLSX أو XLS أو CSV.'
          : 'Please select an XLSX, XLS, or CSV file.',
      );
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(
        isAr
          ? 'يجب أن يكون حجم الملف 10 ميجابايت أو أقل.'
          : 'File must be 10 MB or smaller.',
      );
      return;
    }

    setError('');
    setResult(null);
    setFile(selectedFile);
    setIsInspecting(true);

    try {
      const inspectRes = await inspectAndValidateFile(
        selectedFile,
        catalogType,
        isAr,
      );
      setPreview(inspectRes);
      toast.success(
        isAr
          ? `تم فحص الملف: ${inspectRes.totalRows} صف (${inspectRes.validRows} صالح)`
          : `Workbook inspected: ${inspectRes.totalRows} rows (${inspectRes.validRows} valid)`,
      );
    } catch (inspectErr: any) {
      setPreview(null);
      setError(
        inspectErr?.message ||
        (isAr
          ? 'تعذر قراءة أو فحص ملف الإكسيل. يرجى التأكد من صلاحية الملف.'
          : 'Failed to inspect Excel workbook. Please check file formatting.'),
      );
    } finally {
      setIsInspecting(false);
    }
  };

  // Download official .xlsx template
  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadOfficialTemplate(catalogType, isAr ? 'ar' : 'en');
      toast.success(
        isAr ? 'تم تحميل نموذج Excel المعتمد (.xlsx)' : 'Official template downloaded (.xlsx)',
      );
    } catch {
      toast.error(
        isAr ? 'فشل تحميل نموذج Excel' : 'Failed to download Excel template',
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Download official .csv template
  const handleDownloadCsv = () => {
    try {
      downloadCsvTemplate(catalogType, isAr ? 'ar' : 'en');
      toast.success(
        isAr ? 'تم تحميل نموذج CSV المعتمد (.csv)' : 'CSV template downloaded (.csv)',
      );
    } catch {
      toast.error(
        isAr ? 'فشل تحميل نموذج CSV' : 'Failed to download CSV template',
      );
    }
  };

  // Resilient Upload file to backend (Batching + Auto-Retry on network drop)
  const handleUploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStartTime(Date.now());
    setError('');
    setResult(null);
    setIsNetworkInterrupted(false);
    setRetrySecondsLeft(0);
    isAbortedRef.current = false;

    const rows = preview?.parsedRows || [];
    const totalRowsCount =
      rows.length > 0 ? rows.length : (preview?.totalRows || 0);

    // MODE A: Resilient Incremental Batches (when parsed rows are available)
    if (rows.length > 0) {
      const BATCH_SIZE = 150;
      const batches: Record<string, unknown>[][] = [];
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        batches.push(rows.slice(i, i + BATCH_SIZE));
      }
      const totalBatches = batches.length;
      const sessionId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      let cumulativeSuccess = 0;
      const cumulativeErrors: string[] = [];

      for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
        if (isAbortedRef.current) break;

        const batchRows = batches[bIdx];
        const processedSoFar = bIdx * BATCH_SIZE;

        setBatchInfo({
          currentBatch: bIdx + 1,
          totalBatches,
          processedRows: Math.min(
            processedSoFar + batchRows.length,
            totalRowsCount,
          ),
          totalRows: totalRowsCount,
        });

        // Set live progress percentage
        const currentPercentage = Math.round((bIdx / totalBatches) * 100);
        setUploadProgress(currentPercentage);

        let batchCommitted = false;
        let attempt = 0;

        while (!batchCommitted && !isAbortedRef.current) {
          attempt++;
          try {
            const res = await api.post<{
              success: boolean;
              batchIndex: number;
              totalBatches: number;
              successCount: number;
              failedCount: number;
              errors: string[];
            }>('/admin/uploads/batch', {
              type: catalogType,
              rows: batchRows,
              batchIndex: bIdx,
              totalBatches,
              uploadSessionId: sessionId,
            });

            cumulativeSuccess += res.data.successCount;
            if (res.data.errors?.length) {
              cumulativeErrors.push(...res.data.errors);
            }

            setIsNetworkInterrupted(false);
            setRetrySecondsLeft(0);
            batchCommitted = true;
            // Update progress on batch completion
            setUploadProgress(Math.round(((bIdx + 1) / totalBatches) * 100));
          } catch (err: any) {
            if (isNetworkError(err) && !isAbortedRef.current) {
              setIsNetworkInterrupted(true);
              const waitSec = Math.min(10, 3 + attempt * 2);
              setRetrySecondsLeft(waitSec);

              await new Promise<void>((resolve) => {
                let timer: NodeJS.Timeout | null = null;
                let onlineHandler: (() => void) | null = null;

                const cleanup = () => {
                  if (timer) clearInterval(timer);
                  if (onlineHandler)
                    window.removeEventListener('online', onlineHandler);
                  retryTriggerRef.current = null;
                };

                retryTriggerRef.current = () => {
                  cleanup();
                  resolve();
                };

                let remaining = waitSec;
                timer = setInterval(() => {
                  remaining--;
                  setRetrySecondsLeft(remaining);
                  if (remaining <= 0 || isAbortedRef.current) {
                    cleanup();
                    resolve();
                  }
                }, 1000);

                onlineHandler = () => {
                  cleanup();
                  resolve();
                };
                window.addEventListener('online', onlineHandler);
              });
            } else {
              cumulativeErrors.push(
                isAr
                  ? `الدفعة ${bIdx + 1}: ${getApiErrorMessage(err)}`
                  : `Batch ${bIdx + 1}: ${getApiErrorMessage(err)}`,
              );
              batchCommitted = true;
            }
          }
        }
      }

      setUploadProgress(100);
      setBatchInfo(null);
      setIsUploading(false);

      const finalResult: UploadResult = {
        success: true,
        successCount: cumulativeSuccess,
        failedCount: cumulativeErrors.length,
        errors: cumulativeErrors,
      };

      setResult(finalResult);
      onSuccess?.(finalResult);

      if (cumulativeSuccess > 0) {
        toast.success(
          isAr
            ? `تم استيراد ${cumulativeSuccess} سجل بنجاح إلى قاعدة البيانات`
            : `Successfully imported ${cumulativeSuccess} record(s)`,
        );
      }
      if (cumulativeErrors.length > 0) {
        toast.error(
          isAr
            ? `تعذر استيراد ${cumulativeErrors.length} سجل`
            : `Failed to import ${cumulativeErrors.length} record(s)`,
        );
      }
      return;
    }

    // MODE B: Single File Fallback (with live upload percentage and network retry)
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', catalogType);

    let uploadCommitted = false;
    let attempt = 0;

    while (!uploadCommitted && !isAbortedRef.current) {
      attempt++;
      try {
        const res = await api.post<UploadResult>('/admin/uploads', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const bytePercent = Math.round(
                (progressEvent.loaded * 95) / progressEvent.total,
              );
              setUploadProgress(bytePercent);
            }
          },
        });

        setUploadProgress(100);
        setResult(res.data);
        onSuccess?.(res.data);
        uploadCommitted = true;

        if (res.data.successCount > 0) {
          toast.success(
            isAr
              ? `تم استيراد ${res.data.successCount} سجل بنجاح`
              : `Successfully imported ${res.data.successCount} record(s)`,
          );
        }
        if (res.data.failedCount > 0) {
          toast.error(
            isAr
              ? `تعذر استيراد ${res.data.failedCount} سجل`
              : `Failed to import ${res.data.failedCount} record(s)`,
          );
        }
      } catch (err: any) {
        if (isNetworkError(err) && !isAbortedRef.current && attempt <= 5) {
          setIsNetworkInterrupted(true);
          const waitSec = Math.min(10, 3 + attempt * 2);
          setRetrySecondsLeft(waitSec);

          await new Promise<void>((resolve) => {
            let timer: NodeJS.Timeout | null = null;
            let onlineHandler: (() => void) | null = null;

            const cleanup = () => {
              if (timer) clearInterval(timer);
              if (onlineHandler)
                window.removeEventListener('online', onlineHandler);
              retryTriggerRef.current = null;
            };

            retryTriggerRef.current = () => {
              cleanup();
              resolve();
            };

            let remaining = waitSec;
            timer = setInterval(() => {
              remaining--;
              setRetrySecondsLeft(remaining);
              if (remaining <= 0 || isAbortedRef.current) {
                cleanup();
                resolve();
              }
            }, 1000);

            onlineHandler = () => {
              cleanup();
              resolve();
            };
            window.addEventListener('online', onlineHandler);
          });
        } else {
          setError(
            getApiErrorMessage(err, isAr ? 'فشل التحميل' : 'Upload failed'),
          );
          uploadCommitted = true;
        }
      }
    }

    setIsUploading(false);
  };

  const copyErrorsToClipboard = () => {
    if (!result?.errors.length) return;
    const text = result.errors.join('\n');
    void navigator.clipboard.writeText(text);
    toast.success(isAr ? 'تم نسخ قائمة الأخطاء للحافظة' : 'Errors copied to clipboard');
  };

  const downloadErrorReport = () => {
    if (!result?.errors.length) return;
    const reportData = result.errors.map((errText, idx) => ({
      index: idx + 1,
      errorMessage: errText,
    }));
    downloadExcel(
      reportData,
      ['#', isAr ? 'تفاصيل الخطأ' : 'Error Details'],
      `import_errors_${catalogType}_${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const filteredErrors = useMemo(() => {
    if (!result?.errors) return [];
    if (!errorSearch.trim()) return result.errors;
    const q = errorSearch.trim().toLowerCase();
    return result.errors.filter((e) => e.toLowerCase().includes(q));
  }, [result?.errors, errorSearch]);

  const displayColumnsList = useMemo(() => {
    if (expectedColumns && expectedColumns.length > 0) {
      return expectedColumns;
    }
    if (catalog) {
      return catalog.fields.map((f) => (isAr ? f.labelAr : f.labelEn));
    }
    return [];
  }, [expectedColumns, catalog, isAr]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-4xl rounded-2xl border border-border/70 bg-card/95 text-foreground shadow-[var(--shadow-glow)] backdrop-blur max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/70 pb-4 text-start min-w-0 w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {title || (isAr ? catalog?.titleAr : catalog?.titleEn)}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                {description || (isAr ? catalog?.descAr : catalog?.descEn)}
              </DialogDescription>
            </div>

            {/* Template Download Actions: Only XLSX and CSV */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                disabled={isDownloadingTemplate}
                className="text-xs h-8.5 font-medium border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 cursor-pointer flex items-center gap-1.5"
                title={isAr ? 'تحميل نموذج Excel المعتمد (.xlsx)' : 'Download Excel template (.xlsx)'}
              >
                {isDownloadingTemplate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                )}
                <span>{isAr ? 'نموذج Excel' : 'Excel Template'}</span>
                <bdi dir="ltr" className="text-[10px] opacity-75 font-mono">(.xlsx)</bdi>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadCsv}
                className="text-xs h-8.5 font-medium border-border/70 hover:bg-muted text-foreground cursor-pointer flex items-center gap-1.5"
                title={isAr ? 'تحميل نموذج CSV يدعم الإكسيل (.csv)' : 'Download CSV template (.csv)'}
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>{isAr ? 'نموذج CSV' : 'CSV Template'}</span>
                <bdi dir="ltr" className="text-[10px] opacity-75 font-mono">(.csv)</bdi>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Expected Columns Pills */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-foreground">
              <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>{isAr ? 'الأعمدة المتوقعة في الملف:' : 'Expected Columns in File:'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayColumnsList.map((colName, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-card border border-border text-foreground font-medium"
                >
                  {colName}
                </span>
              ))}
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void handleSelectFile(dropped);
            }}
            className={cn(
              'relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center group',
              isDragging
                ? 'border-teal-500 bg-teal-500/10'
                : 'border-border/80 hover:border-teal-500/60 hover:bg-muted/30',
              file && 'border-emerald-500/40 bg-emerald-500/5',
            )}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="text-start">
                  <p className="text-xs font-bold text-foreground truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </p>
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB • {isAr ? 'جاهز للفحص' : 'Ready'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <UploadCloud className="w-8 h-8 text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 group-hover:scale-110 transition-all mb-2" />
                <p className="text-xs font-bold text-foreground">
                  {isAr
                    ? 'اضغط لاختيار ملف أو اسحب الملف وأفلته هنا'
                    : 'Click to select or drag & drop spreadsheet here'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  .xlsx, .xls, .csv (الحد الأقصى 10 ميجابايت)
                </p>
              </div>
            )}

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void handleSelectFile(selected);
              }}
            />

            {file && !isUploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  resetState();
                }}
                className="absolute top-3 end-3 p-1 rounded-full bg-muted text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                title={isAr ? 'إلغاء الملف' : 'Remove file'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Inspection Loader */}
          {isInspecting && (
            <div className="p-4 rounded-xl border border-border/70 bg-card/60 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>{isAr ? 'جاري فحص وتدقيق بيانات الملف...' : 'Inspecting workbook data...'}</span>
            </div>
          )}

          {/* Pre-flight Preview Grid */}
          {preview && !isInspecting && (
            <div className="pt-2 border-t border-border/70">
              <ExcelPreviewGrid preview={preview} type={catalogType} isAr={isAr} />
            </div>
          )}

          {/* Upload Progress Bar & Resilient Network Status */}
          {isUploading && (
            <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  {batchInfo
                    ? isAr
                      ? `معالجة الدفعة ${batchInfo.currentBatch} من ${batchInfo.totalBatches} (${batchInfo.processedRows} من ${batchInfo.totalRows} سجل)...`
                      : `Processing batch ${batchInfo.currentBatch} of ${batchInfo.totalBatches} (${batchInfo.processedRows} of ${batchInfo.totalRows} records)...`
                    : isAr
                      ? 'جاري نقل وتدقيق بيانات الملف...'
                      : 'Transferring & validating records...'}
                </span>
                <span className="font-mono text-sm font-bold text-teal-600 dark:text-teal-400">
                  {uploadProgress}%
                </span>
              </div>

              {/* Glowing progress bar */}
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden p-0.5 border border-border/50">
                <div
                  className="bg-linear-to-r from-teal-500 via-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(20,184,166,0.5)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              {/* Network Interruption Alert with Auto-Retry */}
              {isNetworkInterrupted && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs flex flex-col gap-2.5 animate-pulse">
                  <div className="flex items-start gap-2">
                    <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-bold">
                        {isAr
                          ? 'انقطع اتصال الإنترنت. تم حفظ ما تم استيراده بأمان.'
                          : 'Internet connection interrupted. Processed records are safely saved.'}
                      </p>
                      <p className="text-[11px] mt-0.5 opacity-90">
                        {isAr
                          ? `جاري إعادة المحاولة تلقائياً خلال ${retrySecondsLeft} ثانية أو فور عودة الإنترنت...`
                          : `Auto-retrying in ${retrySecondsLeft}s or as soon as connection is restored...`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        isAbortedRef.current = true;
                        retryTriggerRef.current?.();
                      }}
                      className="h-7 text-xs border-amber-500/40 text-amber-800 dark:text-amber-200"
                    >
                      {isAr ? 'إيقاف المتبقي' : 'Stop Remaining'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => retryTriggerRef.current?.()}
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {isAr ? 'إعادة المحاولة الآن' : 'Retry Now'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{isAr ? 'حدث خطأ أثناء العملية' : 'An error occurred'}</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Post-Upload Result Report */}
          {result && (
            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>{isAr ? 'تقرير نتيجة الاستيراد' : 'Import Results Summary'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <p className="font-medium">{isAr ? 'تم استيراده بنجاح' : 'Imported'}</p>
                  <p className="text-lg font-bold">{result.successCount} سجل</p>
                </div>
                <div
                  className={cn(
                    'p-3 rounded-lg border',
                    result.failedCount > 0
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : 'border-border/70 bg-muted/40 text-muted-foreground',
                  )}
                >
                  <p className="font-medium">{isAr ? 'فشل استيراده' : 'Failed'}</p>
                  <p className="text-lg font-bold">{result.failedCount} سجل</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      {isAr ? 'قائمة بالأخطاء الواردة:' : 'Detailed Error List:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={copyErrorsToClipboard}
                        className="text-[11px] h-7 px-2"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{isAr ? 'نسخ' : 'Copy'}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={downloadErrorReport}
                        className="text-[11px] h-7 px-2"
                      >
                        <Download className="w-3 h-3" />
                        <span>{isAr ? 'تصدير' : 'Export'}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={errorSearch}
                      onChange={(e) => setErrorSearch(e.target.value)}
                      placeholder={isAr ? 'بحث في أخطاء الاستيراد...' : 'Filter errors...'}
                      className="w-full text-xs ps-8 pe-3 py-1.5 rounded-lg border border-border/70 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {filteredErrors.map((errText, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
                        <span className="font-mono text-[11px]">{errText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-start gap-2 border-t border-border/70 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="text-xs h-9 cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>

          <Button
            type="button"
            onClick={handleUploadFile}
            disabled={!file || isUploading || isInspecting || (preview !== null && !preview.canCommit)}
            className="text-xs h-9 bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer shadow-xs"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isAr ? 'جاري الرفع...' : 'Uploading...'}</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>
                  {preview?.validRows
                    ? isAr
                      ? `رفع ${preview.validRows} سجل إلى النظام`
                      : `Commit ${preview.validRows} record(s)`
                    : isAr
                      ? 'رفع البيانات إلى النظام'
                      : 'Upload & Commit'}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
