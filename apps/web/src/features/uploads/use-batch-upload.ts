'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import api, { getApiErrorMessage } from '@/lib/api';
import type { UploadCatalogType, UploadResult } from './types';

export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.name === 'AxiosError' && (!err.response || err.code === 'ERR_NETWORK')) {
    return true;
  }
  if (
    err.code === 'ECONNABORTED' ||
    err.code === 'ERR_CANCELED' ||
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

export type UploadPhase =
  | 'idle'
  | 'inspecting'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'error';

export interface BatchUploadProgressState {
  isUploading: boolean;
  phase: UploadPhase;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
  elapsedSeconds: number;
  estimatedSecondsLeft: number | null;
  rowsPerSecond: number;
  isNetworkInterrupted: boolean;
  retrySecondsLeft: number;
}

export interface UseBatchUploadOptions {
  onSuccess?: (result: UploadResult) => void;
  onError?: (errorMessage: string) => void;
  batchSize?: number;
}

export function useBatchUpload(options: UseBatchUploadOptions = {}) {
  const { onSuccess, onError, batchSize = 100 } = options;

  const [isUploading, setIsUploading] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [percentage, setPercentage] = useState(0);
  const [batchInfo, setBatchInfo] = useState<{
    currentBatch: number;
    totalBatches: number;
    processedRows: number;
    totalRows: number;
  } | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedSecondsLeft, setEstimatedSecondsLeft] = useState<number | null>(null);
  const [rowsPerSecond, setRowsPerSecond] = useState(0);

  const [isNetworkInterrupted, setIsNetworkInterrupted] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);

  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isAbortedRef = useRef(false);
  const retryTriggerRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    setIsUploading(false);
    setPhase('idle');
    setPercentage(0);
    setBatchInfo(null);
    setElapsedSeconds(0);
    setEstimatedSecondsLeft(null);
    setRowsPerSecond(0);
    setIsNetworkInterrupted(false);
    setRetrySecondsLeft(0);
    setResult(null);
    setErrorMsg('');
    isAbortedRef.current = false;
    startTimeRef.current = null;
  }, [stopTimer]);

  const abortUpload = useCallback(() => {
    isAbortedRef.current = true;
    stopTimer();
    setIsUploading(false);
    setPhase('idle');
    if (retryTriggerRef.current) {
      retryTriggerRef.current();
    }
  }, [stopTimer]);

  const retryNow = useCallback(() => {
    if (retryTriggerRef.current) {
      retryTriggerRef.current();
    }
  }, []);

  // Update elapsed time and calculate ETA
  useEffect(() => {
    if (isUploading && !isNetworkInterrupted) {
      timerRef.current = setInterval(() => {
        if (!startTimeRef.current) return;
        const now = Date.now();
        const elapsed = Math.max(1, Math.floor((now - startTimeRef.current) / 1000));
        setElapsedSeconds(elapsed);

        setBatchInfo((curr) => {
          if (curr && curr.processedRows > 0) {
            const speed = Math.round((curr.processedRows / elapsed) * 10) / 10;
            setRowsPerSecond(speed);
            const remainingRows = Math.max(0, curr.totalRows - curr.processedRows);
            if (speed > 0) {
              const eta = Math.ceil(remainingRows / speed);
              setEstimatedSecondsLeft(eta);
            }
          }
          return curr;
        });
      }, 1000);
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isUploading, isNetworkInterrupted, stopTimer]);

  const startUpload = useCallback(
    async (params: {
      file: File;
      type: UploadCatalogType;
      parsedRows?: Record<string, unknown>[];
      isAr?: boolean;
    }) => {
      const { file, type, parsedRows, isAr = true } = params;

      reset();
      setIsUploading(true);
      isAbortedRef.current = false;
      startTimeRef.current = Date.now();

      // MODE A: Resilient Batching from parsedRows
      if (parsedRows && parsedRows.length > 0) {
        setPhase('uploading');
        const totalRowsCount = parsedRows.length;
        const batches: Record<string, unknown>[][] = [];
        for (let i = 0; i < parsedRows.length; i += batchSize) {
          batches.push(parsedRows.slice(i, i + batchSize));
        }
        const totalBatches = batches.length;
        const sessionId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        let cumulativeSuccess = 0;
        const cumulativeErrors: string[] = [];

        for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
          if (isAbortedRef.current) break;

          const batchRows = batches[bIdx];
          const processedSoFar = bIdx * batchSize;
          const currentProcessed = Math.min(
            processedSoFar + batchRows.length,
            totalRowsCount,
          );

          setBatchInfo({
            currentBatch: bIdx + 1,
            totalBatches,
            processedRows: currentProcessed,
            totalRows: totalRowsCount,
          });

          // Scaled percentage from 5% to 95%
          const currentPercentage = Math.min(
            95,
            Math.max(5, Math.round((bIdx / totalBatches) * 90) + 5),
          );
          setPercentage(currentPercentage);

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
                type,
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

              // Step progress on batch success
              const completedPercent = Math.min(
                95,
                Math.round(((bIdx + 1) / totalBatches) * 90) + 5,
              );
              setPercentage(completedPercent);
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
                    if (onlineHandler) {
                      window.removeEventListener('online', onlineHandler);
                    }
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

        if (isAbortedRef.current) {
          setPhase('idle');
          setIsUploading(false);
          return;
        }

        setPhase('processing');
        setPercentage(98);

        const finalResult: UploadResult = {
          success: true,
          successCount: cumulativeSuccess,
          failedCount: cumulativeErrors.length,
          errors: cumulativeErrors,
        };

        setPercentage(100);
        setPhase('completed');
        setIsUploading(false);
        setBatchInfo(null);
        setResult(finalResult);
        onSuccess?.(finalResult);
        return;
      }

      // MODE B: Single File Fallback with Axios onUploadProgress
      setPhase('uploading');
      setPercentage(5);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      let uploadCommitted = false;
      let attempt = 0;

      while (!uploadCommitted && !isAbortedRef.current) {
        attempt++;
        try {
          const res = await api.post<UploadResult>('/admin/uploads', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                // Scale upload bytes up to 75%
                const bytePercent = Math.min(
                  75,
                  Math.round((progressEvent.loaded * 75) / progressEvent.total),
                );
                setPercentage(Math.max(5, bytePercent));
                if (bytePercent >= 70) {
                  setPhase('processing');
                }
              }
            },
          });

          setPercentage(100);
          setPhase('completed');
          setResult(res.data);
          onSuccess?.(res.data);
          uploadCommitted = true;
          setIsUploading(false);
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
                if (onlineHandler) {
                  window.removeEventListener('online', onlineHandler);
                }
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
            const msg = getApiErrorMessage(err, isAr ? 'فشل رفع الملف' : 'Upload failed');
            setErrorMsg(msg);
            setPhase('error');
            onError?.(msg);
            uploadCommitted = true;
            setIsUploading(false);
          }
        }
      }
    },
    [batchSize, reset, onSuccess, onError],
  );

  const progressState: BatchUploadProgressState = {
    isUploading,
    phase,
    percentage,
    currentBatch: batchInfo?.currentBatch ?? 0,
    totalBatches: batchInfo?.totalBatches ?? 0,
    processedRows: batchInfo?.processedRows ?? 0,
    totalRows: batchInfo?.totalRows ?? 0,
    elapsedSeconds,
    estimatedSecondsLeft,
    rowsPerSecond,
    isNetworkInterrupted,
    retrySecondsLeft,
  };

  return {
    isUploading,
    phase,
    percentage,
    batchInfo,
    progressState,
    result,
    errorMsg,
    startUpload,
    abortUpload,
    retryNow,
    reset,
  };
}
