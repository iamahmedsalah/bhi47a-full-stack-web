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
  Search,
  UploadCloud,
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

  // Upload file to backend
  const handleUploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStartTime(Date.now());
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', catalogType);

    const totalRowsCount = preview?.totalRows || 100;
    let simulatedProgress = 0;
    let timer: NodeJS.Timeout | null = null;

    try {
      const estimatedDurationMs = Math.max(2000, Math.min(10000, totalRowsCount * 2.5));
      const intervalMs = 60;
      const stepIncrement = (95 * intervalMs) / estimatedDurationMs;

      timer = setInterval(() => {
        simulatedProgress = Math.min(95, simulatedProgress + stepIncrement);
        setUploadProgress(Math.round(simulatedProgress));
      }, intervalMs);

      const res = await api.post<UploadResult>('/admin/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const bytePercent = Math.min(
              25,
              Math.round((progressEvent.loaded * 25) / progressEvent.total),
            );
            if (simulatedProgress < bytePercent) {
              simulatedProgress = bytePercent;
              setUploadProgress(bytePercent);
            }
          }
        },
      });

      if (timer) clearInterval(timer);
      setUploadProgress(100);
      setResult(res.data);
      onSuccess?.(res.data);

      if (res.data.successCount > 0) {
        toast.success(
          isAr
            ? `تم استيراد ${res.data.successCount} سجل بنجاح إلى قاعدة البيانات`
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
    } catch (uploadError) {
      if (timer) clearInterval(timer);
      setError(getApiErrorMessage(uploadError, isAr ? 'فشل التحميل' : 'Upload failed'));
    } finally {
      if (timer) clearInterval(timer);
      setIsUploading(false);
    }
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

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  {isAr ? 'جاري استيراد ومعالجة البيانات...' : 'Importing & processing records...'}
                </span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-linear-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
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
