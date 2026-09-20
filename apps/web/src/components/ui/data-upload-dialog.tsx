'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import readXlsxFile from 'read-excel-file';
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

export interface UploadResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

interface DataPreview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface DataUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  uploadType: string;
  expectedColumns: string[];
  onSuccess?: (result: UploadResult) => void;
}

function parseXmlSpreadsheet(xmlText: string): { headers: string[]; rows: string[][] } | null {
  try {
    if (!xmlText.includes('<Workbook') && !xmlText.includes('<?xml')) {
      return null;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError.length > 0) return null;

    const rowElements = Array.from(doc.getElementsByTagName('Row'));
    if (!rowElements.length) return null;

    const parsedRows: string[][] = [];
    for (const rowEl of rowElements) {
      const cellElements = Array.from(rowEl.getElementsByTagName('Cell'));
      const rowData = cellElements.map((c) => {
        const dataEl = c.getElementsByTagName('Data')[0];
        return (dataEl?.textContent ?? c.textContent ?? '').trim();
      });
      if (rowData.some((val) => val.length > 0)) {
        parsedRows.push(rowData);
      }
    }

    if (parsedRows.length === 0) return null;
    return {
      headers: parsedRows[0],
      rows: parsedRows.slice(1),
    };
  } catch {
    return null;
  }
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
  const isAr = params?.locale === 'ar';

  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStartTime, setUploadStartTime] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [error, setError] = React.useState('');

  // Excel Preview state
  const [preview, setPreview] = React.useState<DataPreview | null>(null);
  const [isParsingPreview, setIsParsingPreview] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'preview' | 'columns'>('columns');

  // Error search filter
  const [errorSearch, setErrorSearch] = React.useState('');

  const estimatedSecondsLeft = React.useMemo(() => {
    if (!isUploading || !uploadStartTime || uploadProgress <= 0 || uploadProgress >= 100) {
      return null;
    }
    const elapsedMs = Date.now() - uploadStartTime;
    const totalEstMs = (elapsedMs / uploadProgress) * 100;
    const remainingMs = totalEstMs - elapsedMs;
    const secs = Math.ceil(remainingMs / 1000);
    return Math.max(1, secs);
  }, [isUploading, uploadStartTime, uploadProgress]);

  const resetState = () => {
    setFile(null);
    setIsDragging(false);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStartTime(null);
    setResult(null);
    setError('');
    setPreview(null);
    setIsParsingPreview(false);
    setActiveTab('columns');
    setErrorSearch('');
  };

  const parseFilePreview = async (selectedFile: File) => {
    setIsParsingPreview(true);
    try {
      const isExcelByName = /\.(xlsx|xls|xlsb|ods)$/i.test(selectedFile.name);
      const buffer = await selectedFile.arrayBuffer();
      const firstBytes = new Uint8Array(buffer.slice(0, 4));
      const isZipArchive = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b; // 'PK' magic bytes

      // 1. Try reading binary Excel or Zip archive via read-excel-file
      if (isExcelByName || isZipArchive) {
        try {
          const rows = await readXlsxFile(selectedFile);
          if (rows && rows.length > 0) {
            const headers = rows[0].map((h) => String(h ?? '').trim());
            const dataRows = rows.slice(1).map((r) =>
              r.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())),
            );
            setPreview({
              headers,
              rows: dataRows.slice(0, 15),
              totalRows: dataRows.length,
            });
            setActiveTab('preview');
            return;
          }
        } catch {
          // If readXlsxFile fails (e.g. password-protected or XML disguised as xls), proceed to XML check
        }
      }

      // 2. Try XML Spreadsheet 2003 (only if text is real XML, NOT a binary zip)
      const text = new TextDecoder('utf-8').decode(buffer);
      if ((text.includes('<Workbook') || text.includes('<?xml')) && !text.startsWith('PK')) {
        const xmlParsed = parseXmlSpreadsheet(text);
        if (xmlParsed && xmlParsed.headers.length > 0) {
          setPreview({
            headers: xmlParsed.headers,
            rows: xmlParsed.rows.slice(0, 15),
            totalRows: xmlParsed.rows.length,
          });
          return;
        }
      }

      // 3. Fallback for plain text CSV/TSV only if not binary
      if (!isZipArchive && !text.startsWith('PK')) {
        const lines = text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0 && !l.trim().startsWith('<?xml') && !l.trim().startsWith('<Workbook'));
        if (lines.length > 0) {
          const headers = lines[0]
            .split(/[,;\t]/)
            .map((h) => h.trim().replace(/^["']|["']$/g, ''));
          const dataRows = lines
            .slice(1)
            .map((line) =>
              line.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, '')),
            );
          setPreview({
            headers,
            rows: dataRows.slice(0, 15),
            totalRows: dataRows.length,
          });
          return;
        }
      }

      setPreview(null);
    } catch {
      setPreview(null);
    } finally {
      setIsParsingPreview(false);
    }
  };

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    const isAllowed = /\.(xlsx|xls|csv)$/i.test(nextFile.name);
    if (!isAllowed) {
      setError(
        isAr
          ? 'يرجى اختيار ملف بصيغة XLSX أو XLS أو CSV.'
          : 'Please choose an XLSX, XLS, or CSV file.',
      );
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError(
        isAr
          ? 'يجب أن يكون حجم الملف 10 ميجابايت أو أقل.'
          : 'File must be 10 MB or smaller.',
      );
      return;
    }
    setError('');
    setResult(null);
    setFile(nextFile);
    void parseFilePreview(nextFile);
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStartTime(Date.now());
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', uploadType);

    const totalRowsCount = preview?.totalRows || 100;
    let simulatedProgress = 0;
    let timer: NodeJS.Timeout | null = null;

    try {
      // Estimated processing time: ~2.5ms per row (min 2s, max 12s)
      const estimatedDurationMs = Math.max(2000, Math.min(12000, totalRowsCount * 2.5));
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
              20,
              Math.round((progressEvent.loaded * 20) / progressEvent.total),
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
            ? `تم استيراد ${res.data.successCount} صف بنجاح`
            : `Imported ${res.data.successCount} row(s) successfully`,
        );
      }
      if (res.data.failedCount > 0) {
        toast.error(
          isAr
            ? `فشل استيراد ${res.data.failedCount} صف`
            : `Failed to import ${res.data.failedCount} row(s)`,
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

  const downloadTemplate = () => {
    const sampleRow: Record<string, string> = {};
    expectedColumns.forEach((col) => {
      const lower = col.toLowerCase();
      if (lower.includes('code')) sampleRow[col] = 'CS101';
      else if (lower.includes('namear')) sampleRow[col] = 'مقدمة في علوم الحاسب';
      else if (lower.includes('nameen')) sampleRow[col] = 'Intro to Computer Science';
      else if (lower.includes('name')) sampleRow[col] = 'مقدمة في علوم الحاسب';
      else if (lower.includes('level')) sampleRow[col] = '1';
      else if (lower.includes('semester')) sampleRow[col] = 'first';
      else if (lower.includes('credithours')) sampleRow[col] = '3';
      else sampleRow[col] = 'مثال';
    });

    downloadExcel([sampleRow], expectedColumns, `${uploadType}_template`);
    toast.success(isAr ? 'تم تحميل نموذج Excel' : 'Excel template downloaded');
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
      `import_errors_${uploadType}_${new Date().toISOString().slice(0, 10)}`,
    );
  };

  // Header column matching analysis
  const headerMatchInfo = React.useMemo(() => {
    if (!preview || !preview.headers.length) return null;
    const normalizedParsed = preview.headers.map((h) =>
      h.toLowerCase().trim().replace(/[\s_\-]/g, ''),
    );

    const matched: string[] = [];
    const missing: string[] = [];

    expectedColumns.forEach((col) => {
      const normCol = col.toLowerCase().trim().replace(/[\s_\-]/g, '');
      const isFound = normalizedParsed.some(
        (ph) => ph === normCol || ph.includes(normCol) || normCol.includes(ph),
      );
      if (isFound) matched.push(col);
      else missing.push(col);
    });

    return { matched, missing };
  }, [preview, expectedColumns]);

  // Filtered errors for search
  const filteredErrors = React.useMemo(() => {
    if (!result?.errors) return [];
    if (!errorSearch.trim()) return result.errors;
    const query = errorSearch.trim().toLowerCase();
    return result.errors.filter((e) => e.toLowerCase().includes(query));
  }, [result?.errors, errorSearch]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-4xl rounded-2xl border border-border/70 bg-card/95 text-foreground shadow-[var(--shadow-glow)] backdrop-blur max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
        <DialogHeader className="border-b border-border/70 pb-4 text-start min-w-0 w-full">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">{title}</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">{description}</DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
            >
              <Download className="h-3.5 w-3.5" />
              {isAr ? 'تنزيل نموذج Excel' : 'Download Template'}
            </Button>
          </div>
        </DialogHeader>

        {/* Upload Zone & Header Column Info */}
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] min-w-0 w-full">
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              selectFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              'flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/35 p-6 text-center transition-all hover:border-primary/60 hover:bg-primary/5 min-w-0 w-full',
              isDragging && 'border-primary bg-primary/10',
              file && 'border-success/50 bg-success/5',
            )}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10 text-success" />
                <p className="mt-3 max-w-full truncate text-sm font-bold text-foreground">{file.name}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                  {preview && <span>• {preview.totalRows} {isAr ? 'صف' : 'rows'}</span>}
                </div>
                <p className="mt-2 text-xs text-primary font-medium hover:underline">
                  {isAr ? 'انقر لتغيير الملف' : 'Click to change file'}
                </p>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-primary" />
                <p className="mt-3 text-sm font-bold text-foreground">
                  {isAr ? 'اسحب الملف هنا أو انقر للتصفح' : 'Drop file here or click to browse'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAr
                    ? 'الصيغ المدعومة: .xlsx, .xls, .csv حتى 10 ميجابايت'
                    : 'Supported: .xlsx, .xls, .csv up to 10 MB'}
                </p>
              </>
            )}
          </label>

          {/* Expected Columns Info & Header Match */}
          <div className="flex flex-col rounded-xl border border-border/70 bg-surface/30 p-4 text-start min-w-0 w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? 'الأعمدة المتوقعة' : 'Expected Columns'}
              </h3>
              {headerMatchInfo && (
                <span className="text-xs font-semibold text-success">
                  {headerMatchInfo.matched.length}/{expectedColumns.length} {isAr ? 'مطابق' : 'matched'}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? 'يدعم النظام رؤوس الأعمدة بالعربية والإنجليزية تلقائياً.'
                : 'Supports English & Arabic headers automatically.'}
            </p>

            <div className="mt-3 flex-1 flex flex-wrap gap-1.5 overflow-y-auto max-h-44 pr-1">
              {expectedColumns.map((column) => {
                const isMatched = headerMatchInfo?.matched.includes(column);
                return (
                  <span
                    key={column}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-squircle border px-2.5 py-1 text-xs font-semibold font-mono transition-all',
                      isMatched
                        ? 'border-success/40 bg-success/15 text-success'
                        : 'border-primary/25 bg-primary/10 text-primary',
                    )}
                  >
                    {isMatched && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    {column}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Excel Preview Section */}
        {file && (
          <div className="rounded-xl border border-border/70 bg-card/60 p-3 text-start min-w-0 w-full max-w-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('columns')}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-bold transition-all',
                    activeTab === 'columns'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-surface',
                  )}
                >
                  {isAr ? 'ملخص الملف' : 'Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all',
                    activeTab === 'preview'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-surface',
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {isAr ? 'معاينة البيانات' : 'Data Preview'}
                  {preview && (
                    <span className="ms-1 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
                      {preview.totalRows}
                    </span>
                  )}
                </button>
              </div>

              {isParsingPreview && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {isAr ? 'جاري تحليل الملف...' : 'Parsing preview...'}
                </div>
              )}
            </div>

            {activeTab === 'columns' && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                  <span className="text-muted-foreground block text-[11px] font-sans">{isAr ? 'عدد الصفوف' : 'Total Rows'}</span>
                  <span className="text-base font-bold text-foreground">{preview?.totalRows ?? 0}</span>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                  <span className="text-muted-foreground block text-[11px] font-sans">{isAr ? 'الأعمدة المكتشفة' : 'Detected Columns'}</span>
                  <span className="text-base font-bold text-foreground">{preview?.headers.length ?? 0}</span>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                  <span className="text-muted-foreground block text-[11px] font-sans">{isAr ? 'الأعمدة المتطابقة' : 'Matched Columns'}</span>
                  <span className="text-base font-bold text-success">{headerMatchInfo?.matched.length ?? 0}</span>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                  <span className="text-muted-foreground block text-[11px] font-sans">{isAr ? 'الأعمدة الناقصة' : 'Missing Columns'}</span>
                  <span className="text-base font-bold text-warning">{headerMatchInfo?.missing.length ?? 0}</span>
                </div>
              </div>
            )}

            {activeTab === 'preview' && preview && (
              <div className="mt-3 w-full min-w-0 max-w-full overflow-x-auto max-h-60 rounded-lg border border-border/50 overscroll-x-contain">
                <table className="w-full text-xs text-start border-collapse table-auto min-w-max">
                  <thead className="bg-surface sticky top-0 border-b border-border text-foreground font-semibold z-10">
                    <tr>
                      <th className="p-2 border-r border-border/50 text-center w-12 shrink-0 bg-surface">#</th>
                      {preview.headers.map((h, i) => (
                        <th key={`${h}-${i}`} className="p-2 border-r border-border/50 font-mono whitespace-nowrap text-xs bg-surface">
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {preview.rows.map((row, rIdx) => (
                      <tr key={`r-${rIdx}`} className="hover:bg-surface/50">
                        <td className="p-2 text-center text-muted-foreground border-r border-border/50 bg-surface/30 font-medium">
                          {rIdx + 1}
                        </td>
                        {row.map((cell, cIdx) => (
                          <td
                            key={`c-${rIdx}-${cIdx}`}
                            className="p-2 truncate max-w-[180px] border-r border-border/50 whitespace-nowrap"
                            title={cell}
                          >
                            {cell || <span className="text-muted-foreground/40 italic">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Upload Progress Bar with Percentage and Live ETA */}
        {isUploading && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-start space-y-2.5 w-full min-w-0">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span>{isAr ? 'جاري رفع واستيراد البيانات...' : 'Uploading and processing file...'}</span>
              </div>
              <span className="font-mono text-primary font-bold shrink-0">{uploadProgress}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-primary transition-all duration-150 ease-out rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>
                {preview?.totalRows
                  ? isAr
                    ? `جاري معالجة صف ${Math.min(preview.totalRows, Math.round((preview.totalRows * uploadProgress) / 100))} من ${preview.totalRows}`
                    : `Row ${Math.min(preview.totalRows, Math.round((preview.totalRows * uploadProgress) / 100))} of ${preview.totalRows}`
                  : null}
              </span>
              {estimatedSecondsLeft !== null && uploadProgress < 100 && (
                <span className="text-primary font-semibold">
                  {isAr
                    ? estimatedSecondsLeft <= 1
                      ? 'متبقي أقل من ثانية...'
                      : `متبقي حوالي ${estimatedSecondsLeft} ثانية`
                    : estimatedSecondsLeft <= 1
                      ? '< 1s remaining...'
                      : `~${estimatedSecondsLeft}s remaining`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Import Results & Structured Error Handling */}
        {result && (
          <div className="rounded-xl border border-border/70 bg-surface/35 p-4 text-start space-y-3 min-w-0 w-full overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                {result.failedCount === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                )}
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    {isAr ? 'نتيجة استيراد الملف' : 'Import Results'}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? `تم استيراد ${result.successCount} بنجاح، وفشل ${result.failedCount} من أصل ${result.successCount + result.failedCount} صف.`
                      : `${result.successCount} imported, ${result.failedCount} failed out of ${result.successCount + result.failedCount} rows.`}
                  </p>
                </div>
              </div>

              {/* Progress pill */}
              <div className="flex items-center gap-2">
                <span className="rounded-squircle bg-success/15 border border-success/30 px-3 py-1 text-xs font-bold text-success">
                  {result.successCount} {isAr ? 'ناجح' : 'Passed'}
                </span>
                {result.failedCount > 0 && (
                  <span className="rounded-squircle bg-danger/15 border border-danger/30 px-3 py-1 text-xs font-bold text-danger">
                    {result.failedCount} {isAr ? 'راسب / خطأ' : 'Failed'}
                  </span>
                )}
              </div>
            </div>

            {/* Error list header & action buttons */}
            {result.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-danger">
                    <XCircle className="h-4 w-4" />
                    <span>
                      {isAr
                        ? `قائمة تفاصيل الأخطاء (${result.errors.length})`
                        : `Error Details (${result.errors.length})`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyErrorsToClipboard}
                      className="h-7 text-[11px] gap-1 px-2.5 border-border hover:bg-surface"
                    >
                      <Copy className="h-3 w-3" />
                      {isAr ? 'نسخ الأخطاء' : 'Copy Errors'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={downloadErrorReport}
                      className="h-7 text-[11px] gap-1 px-2.5 border-border hover:bg-surface text-danger"
                    >
                      <FileText className="h-3 w-3" />
                      {isAr ? 'تصدير تقرير الأخطاء' : 'Download Error Log'}
                    </Button>
                  </div>
                </div>

                {/* Error search bar */}
                {result.errors.length > 3 && (
                  <div className="relative">
                    <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={errorSearch}
                      onChange={(e) => setErrorSearch(e.target.value)}
                      placeholder={isAr ? 'بحث في الأخطاء...' : 'Search errors...'}
                      className="w-full rounded-lg border border-border bg-card/80 ps-8 pe-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                {/* Styled Error Cards Container */}
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl border border-danger/25 bg-danger/5 p-2.5">
                  {filteredErrors.map((errItem, idx) => {
                    const rowMatch = errItem.match(/السطر\s*(\d+)/i) || errItem.match(/Row\s*(\d+)/i);
                    const rowNum = rowMatch ? rowMatch[1] : null;
                    const cleanMsg = errItem.replace(/^السطر\s*\d+:\s*/i, '').replace(/^Row\s*\d+:\s*/i, '');

                    return (
                      <div
                        key={`${errItem}-${idx}`}
                        className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-card/80 p-2.5 text-xs transition-colors hover:border-danger/40"
                      >
                        {rowNum ? (
                          <span className="shrink-0 rounded-md bg-danger/15 border border-danger/30 px-2 py-0.5 font-mono text-[11px] font-bold text-danger">
                            {isAr ? `سطر ${rowNum}` : `Row ${rowNum}`}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md bg-danger/15 border border-danger/30 px-2 py-0.5 font-mono text-[11px] font-bold text-danger">
                            #{idx + 1}
                          </span>
                        )}
                        <p className="flex-1 font-sans text-danger leading-relaxed">{cleanMsg}</p>
                      </div>
                    );
                  })}

                  {filteredErrors.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {isAr ? 'لا توجد نتائج مطابقة للبحث' : 'No matching errors found'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border/70 pt-4 flex gap-2 justify-end min-w-0 w-full">
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
          <Button
            type="button"
            disabled={!file || isUploading}
            onClick={uploadFile}
            className="bg-primary hover:bg-primary-hover font-semibold text-white gap-2"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isAr ? 'بدء استيراد البيانات' : 'Import Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
