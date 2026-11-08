'use client';

import { useState } from 'react';
import {
  Check,
  Loader2,
  UploadCloud,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useMaterialUploads,
  type MaterialUploadTask,
} from './material-upload-provider';
import { isUploadActive } from './material-upload-queue';

export function MaterialUploadCard({
  task,
  locale,
}: {
  task: MaterialUploadTask;
  locale: string;
}) {
  const { cancel, retry, dismiss } = useMaterialUploads();
  const isAr = locale === 'ar';
  const labels = isAr
    ? {
        queued: 'في انتظار الرفع',
        uploading: 'جاري رفع الملف',
        saving: 'تم الإرسال — جاري التحقق والحفظ',
        completed: 'تم الحفظ بنجاح',
        failed: 'فشل الرفع',
        cancelled: 'تم إلغاء الرفع',
      }
    : {
        queued: 'Queued',
        uploading: 'Uploading',
        saving: 'Sent — verifying and saving',
        completed: 'Saved successfully',
        failed: 'Upload failed',
        cancelled: 'Upload cancelled',
      };
  return (
    <article
      className="min-w-0 rounded-xl border border-border bg-card p-3 text-start"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="flex items-start gap-2">
        {task.status === 'completed' ? (
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
        ) : isUploadActive(task) ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : (
          <UploadCloud className="mt-1 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{task.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            <bdi>{task.fileName}</bdi>
          </p>
        </div>
        {!isUploadActive(task) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            aria-label={isAr ? 'إخفاء' : 'Dismiss'}
            onClick={() => dismiss(task.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div
        className="my-2 flex h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={
          isAr
            ? `تقدم رفع ${task.fileName}`
            : `Upload progress for ${task.fileName}`
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={task.progress ?? undefined}
        aria-valuetext={`${task.progress === null ? '' : `${task.progress}% · `}${labels[task.status]}`}
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-200 ${task.progress === null ? 'w-1/3 animate-pulse' : ''}`}
          style={
            task.progress === null ? undefined : { width: `${task.progress}%` }
          }
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span aria-live="polite">{labels[task.status]}</span>
        <bdi dir="ltr">
          {task.progress === null ? '…' : `${task.progress}%`}
        </bdi>
      </div>
      {task.status === 'uploading' && task.bytesPerSecond > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          <bdi dir="ltr">
            {(task.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s
          </bdi>
          {task.secondsRemaining !== null && (
            <>
              {' '}
              · {isAr ? 'متبقي تقريباً' : 'About'}{' '}
              <bdi>{task.secondsRemaining}</bdi> {isAr ? 'ثانية' : 's left'}
            </>
          )}
        </p>
      )}
      {task.error && <p className="mt-2 text-xs text-danger">{task.error}</p>}
      <div className="mt-2 flex gap-2">
        {(task.status === 'queued' || task.status === 'uploading') && (
          <Button variant="secondary" size="sm" onClick={() => cancel(task.id)}>
            {isAr ? 'إلغاء الرفع' : 'Cancel upload'}
          </Button>
        )}
        {task.status === 'failed' && (
          <Button variant="secondary" size="sm" onClick={() => retry(task.id)}>
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        )}
      </div>
    </article>
  );
}

export function MaterialUploadNotifications({
  locale,
  courseId,
}: {
  locale: string;
  courseId?: string;
}) {
  const { tasks } = useMaterialUploads();
  const visible = tasks.filter(
    (task) => !courseId || task.courseId === courseId,
  );
  if (!visible.length) return null;
  return (
    <section
      className="space-y-2"
      aria-label={locale === 'ar' ? 'رفع الملفات' : 'File uploads'}
    >
      <h3 className="text-sm font-semibold">
        {locale === 'ar' ? 'رفع الملفات' : 'File uploads'}
      </h3>
      {visible.map((task) => (
        <MaterialUploadCard key={task.id} task={task} locale={locale} />
      ))}
    </section>
  );
}

export function MaterialUploadTray({ locale }: { locale: string }) {
  const { tasks } = useMaterialUploads();
  const [minimized, setMinimized] = useState(false);
  const active = tasks.filter(isUploadActive);
  if (!active.length) return null;
  const current = active.find((task) => task.status !== 'queued') ?? active[0];
  const isAr = locale === 'ar';
  return (
    <aside
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed bottom-24 end-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-primary/30 bg-card p-3 shadow-xl"
      aria-label={isAr ? 'الملفات قيد الرفع' : 'Uploads in progress'}
    >
      <button
        type="button"
        onClick={() => setMinimized((value) => !value)}
        aria-expanded={!minimized}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary" />
          {isAr ? 'رفع الملفات' : 'File uploads'} <bdi>({active.length})</bdi>
        </span>
        {minimized ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {!minimized && (
        <div className="mt-2 space-y-2">
          <MaterialUploadCard task={current} locale={locale} />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? 'يمكنك إغلاق النافذة ومتابعة العمل. لا تغلق علامة تبويب المتصفح أثناء الرفع.'
              : 'Close the dialog and keep working. Keep this browser tab open.'}
          </p>
        </div>
      )}
    </aside>
  );
}
