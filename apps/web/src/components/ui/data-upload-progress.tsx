'use client';

import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Clock,
  Gauge,
  Layers,
  StopCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BatchUploadProgressState } from '@/features/uploads/use-batch-upload';

interface DataUploadProgressProps {
  state: BatchUploadProgressState;
  locale?: string;
  onAbort?: () => void;
  onRetryNow?: () => void;
}

export function DataUploadProgress({
  state,
  locale = 'ar',
  onAbort,
  onRetryNow,
}: DataUploadProgressProps) {
  const isAr = locale === 'ar';
  const {
    phase,
    percentage,
    currentBatch,
    totalBatches,
    processedRows,
    totalRows,
    elapsedSeconds,
    estimatedSecondsLeft,
    rowsPerSecond,
    isNetworkInterrupted,
    retrySecondsLeft,
  } = state;

  const getPhaseTitle = () => {
    switch (phase) {
      case 'inspecting':
        return isAr
          ? 'جاري فحص وتدقيق بنية الملف وتطابق الأعمدة...'
          : 'Validating file structure and column headers...';
      case 'uploading':
        return isAr
          ? 'جاري رفع وحفظ دفعات البيانات بالخادم...'
          : 'Uploading and committing batches to database...';
      case 'processing':
        return isAr
          ? 'جاري تدقيق السجلات واحتساب المؤشرات الأكاديمية...'
          : 'Finalizing records & calculating academic progress...';
      case 'completed':
        return isAr ? 'اكتملت عملية الاستيراد بنجاح!' : 'Import completed successfully!';
      case 'error':
        return isAr ? 'حدث خطأ أثناء معالجة البيانات' : 'An error occurred during import';
      default:
        return isAr ? 'جاري التحضير...' : 'Preparing upload...';
    }
  };

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="w-full bg-card/80 backdrop-blur-xs border border-border/70 rounded-2xl p-5 shadow-xs space-y-4">
      {/* 1. Header with Status & Percentage */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {phase === 'completed' ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : phase === 'error' ? (
            <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground truncate">
              {getPhaseTitle()}
            </h4>
            <p className="text-xs text-muted-foreground">
              {phase === 'uploading' && totalBatches > 1 ? (
                <span>
                  {isAr ? 'الدفعة' : 'Batch'}{' '}
                  <bdi className="font-semibold text-foreground">{currentBatch}</bdi> /{' '}
                  <bdi>{totalBatches}</bdi>
                  {' • '}
                  {isAr ? 'تم حفظ' : 'Committed'}{' '}
                  <bdi className="font-semibold text-foreground">{processedRows}</bdi> /{' '}
                  <bdi>{totalRows}</bdi> {isAr ? 'صف' : 'rows'}
                </span>
              ) : (
                <span>
                  {isAr
                    ? 'يرجى عدم إغلاق الصفحة أثناء المعالجة'
                    : 'Please do not close this window during processing'}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Live Percentage Badge */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 rounded-squircle font-mono font-bold text-base">
          <bdi>{percentage}%</bdi>
        </div>
      </div>

      {/* 2. Visual Progress Bar */}
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-muted/70 rounded-full overflow-hidden p-0.5 border border-border/40">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              phase === 'completed'
                ? 'bg-emerald-500 shadow-xs shadow-emerald-500/40'
                : phase === 'error'
                  ? 'bg-rose-500'
                  : 'bg-linear-to-r from-teal-600 via-teal-500 to-emerald-500 shadow-xs shadow-teal-500/30'
            }`}
            style={{ width: `${Math.max(2, Math.min(100, percentage))}%` }}
          />
        </div>
      </div>

      {/* 3. Live Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs text-muted-foreground">
        {/* Batches metric */}
        {totalBatches > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-squircle bg-muted/40 border border-border/40">
            <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">
              {isAr ? 'الدفعات' : 'Batches'}:{' '}
              <bdi className="font-medium text-foreground">
                {currentBatch}/{totalBatches}
              </bdi>
            </span>
          </div>
        )}

        {/* Processed count */}
        {totalRows > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-squircle bg-muted/40 border border-border/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">
              {isAr ? 'الصفوف' : 'Rows'}:{' '}
              <bdi className="font-medium text-foreground">
                {processedRows}/{totalRows}
              </bdi>
            </span>
          </div>
        )}

        {/* Elapsed Time */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-squircle bg-muted/40 border border-border/40">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="truncate">
            {isAr ? 'المنقضي' : 'Elapsed'}:{' '}
            <bdi className="font-medium text-foreground font-mono">
              {formatSeconds(elapsedSeconds)}
            </bdi>
          </span>
        </div>

        {/* Speed / ETA */}
        {estimatedSecondsLeft !== null ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-squircle bg-muted/40 border border-border/40">
            <Gauge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">
              {isAr ? 'المتبقي' : 'ETA'}:{' '}
              <bdi className="font-medium text-foreground font-mono">
                ~{formatSeconds(estimatedSecondsLeft)}
              </bdi>
            </span>
          </div>
        ) : rowsPerSecond > 0 ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-squircle bg-muted/40 border border-border/40">
            <Gauge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">
              <bdi className="font-medium text-foreground">{rowsPerSecond}</bdi>{' '}
              {isAr ? 'صف/ث' : 'r/s'}
            </span>
          </div>
        ) : null}
      </div>

      {/* 4. Network Interruption / Auto-Recovery Alert */}
      {isNetworkInterrupted && (
        <div className="flex items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold">
                {isAr
                  ? 'انقطع الاتصال مؤقتاً! جاري استئناف المعالجة تلقائياً...'
                  : 'Connection interrupted! Retrying automatically...'}
              </p>
              <p className="opacity-80">
                {isAr ? 'إعادة المحاولة بعد' : 'Retrying in'}{' '}
                <bdi className="font-bold">{retrySecondsLeft}</bdi>{' '}
                {isAr ? 'ثوانٍ' : 'seconds'}
              </p>
            </div>
          </div>

          {onRetryNow && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetryNow}
              className="h-7 text-xs border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 rounded-squircle"
            >
              <RefreshCw className="w-3 h-3 me-1" />
              <span>{isAr ? 'إعادة المحاولة الآن' : 'Retry Now'}</span>
            </Button>
          )}
        </div>
      )}

      {/* 5. Abort / Cancel Action */}
      {phase !== 'completed' && phase !== 'error' && onAbort && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAbort}
            className="text-xs h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/30 rounded-squircle cursor-pointer px-3"
          >
            <StopCircle className="w-3.5 h-3.5 me-1.5 text-rose-500" />
            <span>{isAr ? 'إلغاء العملية' : 'Cancel Operation'}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
