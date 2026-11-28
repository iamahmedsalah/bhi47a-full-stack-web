'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob } from '@/lib/export-utils';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileTypeIcon } from '@/components/ui/file-type-icon';

interface CourseSyllabusPreviewDialogProps {
  courseId: string;
  courseCode: string;
  courseName: string;
  fileName?: string;
  updatedAt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
}

async function extractPdfBlob(raw: unknown): Promise<Blob> {
  const rawRecord =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;

  let sourceBlob: Blob;
  if (raw instanceof Blob) {
    sourceBlob = raw;
  } else if (rawRecord && rawRecord.data instanceof Blob) {
    sourceBlob = rawRecord.data;
  } else if (rawRecord && rawRecord.data !== undefined) {
    sourceBlob = new Blob([rawRecord.data as BlobPart], { type: 'application/pdf' });
  } else {
    sourceBlob = new Blob([raw as BlobPart], { type: 'application/pdf' });
  }

  if (sourceBlob.type.includes('application/json')) {
    const errorText = await sourceBlob.text();
    try {
      const errObj = JSON.parse(errorText) as Record<string, unknown>;
      const msg = typeof errObj.message === 'string' ? errObj.message : '';
      throw new Error(msg || 'Failed to load syllabus PDF');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Failed to load syllabus PDF') throw err;
      throw new Error(errorText || 'Failed to load syllabus PDF');
    }
  }

  if (sourceBlob.size === 0) {
    throw new Error('Syllabus PDF is empty');
  }

  return new Blob([sourceBlob], { type: 'application/pdf' });
}

function useStrictSafeObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob || typeof window === 'undefined') {
      queueMicrotask(() => setUrl(null));
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}

function SyllabusPreviewViewport({
  courseId,
  courseCode,
  courseName,
  fileName,
  updatedAt,
  isAr,
  onClose,
}: {
  courseId: string;
  courseCode: string;
  courseName: string;
  fileName?: string;
  updatedAt?: string;
  isAr: boolean;
  onClose: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const resolvedFileName = fileName || `${courseCode}_syllabus.pdf`;

  const pdfQuery = useQuery<Blob>({
    queryKey: ['course-syllabus-preview', courseId, updatedAt],
    queryFn: async () => {
      const raw = await api.get(`/courses/${courseId}/syllabus/download`, {
        responseType: 'blob',
      });
      return extractPdfBlob(raw);
    },
    enabled: Boolean(courseId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const blobUrl = useStrictSafeObjectUrl(pdfQuery.data);
  const errorDetails = pdfQuery.isError ? getApiErrorDetails(pdfQuery.error) : null;
  const isMissingFile = errorDetails?.statusCode === 404;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (pdfQuery.data) {
        await downloadFileBlob(pdfQuery.data, resolvedFileName, 'application/pdf');
      } else {
        const raw = await api.get(`/courses/${courseId}/syllabus/download`, {
          responseType: 'blob',
        });
        await downloadFileBlob(raw, resolvedFileName, 'application/pdf');
      }
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          isAr ? 'تعذّر تحميل ملف المنهج' : 'Failed to download syllabus PDF',
        ),
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <DialogContent
      flush
      dir={isAr ? 'rtl' : 'ltr'}
      className={
        isExpanded
          ? 'max-w-[96vw] sm:max-w-[96vw] h-[94vh] max-h-[94vh]'
          : 'max-w-4xl h-[86vh] max-h-[90vh]'
      }
    >
      <DialogHeader className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <FileTypeIcon fileName={resolvedFileName} mimeType="application/pdf" size="lg" />
            <div className="min-w-0 space-y-1 text-start">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                  <bdi dir="ltr">{courseCode}</bdi>
                </span>
                <span className="px-2 py-0.5 rounded-squircle bg-teal-500/15 text-teal-700 dark:text-teal-300 text-[10px] font-bold">
                  {isAr ? 'منهج المقرر (PDF)' : 'Course Syllabus (PDF)'}
                </span>
              </div>
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground leading-snug break-words">
                <bdi>{courseName}</bdi>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                <bdi>{resolvedFileName}</bdi>
              </DialogDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((v) => !v)}
            className="hidden sm:inline-flex h-8 w-8 p-0 rounded-squircle text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            title={isExpanded ? (isAr ? 'تصغير النافذة' : 'Restore size') : (isAr ? 'تكبير النافذة' : 'Maximize')}
            aria-label={isExpanded ? (isAr ? 'تصغير النافذة' : 'Restore size') : (isAr ? 'تكبير النافذة' : 'Maximize')}
          >
            {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </DialogHeader>

      <DialogBody className="bg-background/40 p-3 sm:p-5 space-y-3">
        {pdfQuery.isLoading || (pdfQuery.isSuccess && !blobUrl) ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs font-semibold">
              {isAr ? 'جاري تحضير معاينة المنهج...' : 'Preparing syllabus preview...'}
            </p>
          </div>
        ) : pdfQuery.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] p-8 text-center space-y-3"
          >
            <div className="mx-auto flex size-11 items-center justify-center rounded-squircle border border-amber-500/30 bg-amber-500/15 text-amber-500">
              <AlertTriangle className="size-5" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {isMissingFile
                ? isAr
                  ? 'ملف المنهج غير متوفر حالياً على الخادم'
                  : 'Syllabus File Missing on Server'
                : isAr
                  ? 'تعذّر عرض ملف المنهج'
                  : 'Could not display syllabus PDF'}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {getApiErrorMessage(
                pdfQuery.error,
                isAr
                  ? 'الملف غير موجود في وحدة التخزين الحالية. يرجى إعادة رفع ملف الـ PDF من إعدادات المقرر.'
                  : 'The PDF file is missing from storage. Please re-upload it from course settings.',
              )}
            </p>
            {!isMissingFile && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void pdfQuery.refetch()}
                  className="rounded-squircle text-xs cursor-pointer"
                >
                  {isAr ? 'إعادة المحاولة' : 'Retry'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <FileText className="size-4 text-rose-500" />
                <span>{isAr ? 'عارض منهج المقرر (PDF)' : 'Syllabus PDF Viewer'}</span>
              </span>
              {blobUrl && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-squircle text-xs gap-1.5"
                >
                  <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5 text-primary" />
                    <span>{isAr ? 'فتح في تبويب مستقل' : 'Open in new tab'}</span>
                  </a>
                </Button>
              )}
            </div>
            {blobUrl && (
              <iframe
                src={blobUrl}
                title={resolvedFileName}
                className="w-full h-[60vh] rounded-xl border border-border/80 bg-white shadow-xs"
              />
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {!pdfQuery.isError && (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleDownload()}
            disabled={isDownloading || pdfQuery.isLoading}
            className="rounded-squircle bg-primary text-white hover:bg-primary-hover text-xs font-semibold gap-1.5 cursor-pointer"
          >
            {isDownloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>{isAr ? 'تحميل المنهج (PDF)' : 'Download Syllabus (PDF)'}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="rounded-squircle text-xs cursor-pointer"
        >
          {isAr ? 'إغلاق' : 'Close'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CourseSyllabusPreviewDialog({
  courseId,
  courseCode,
  courseName,
  fileName,
  updatedAt,
  open,
  onOpenChange,
  locale,
}: CourseSyllabusPreviewDialogProps) {
  const isAr = locale === 'ar';

  return (
    <Dialog open={open && Boolean(courseId)} onOpenChange={onOpenChange}>
      {open && courseId ? (
        <SyllabusPreviewViewport
          key={`${courseId}:${updatedAt ?? ''}`}
          courseId={courseId}
          courseCode={courseCode}
          courseName={courseName}
          fileName={fileName}
          updatedAt={updatedAt}
          isAr={isAr}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}
