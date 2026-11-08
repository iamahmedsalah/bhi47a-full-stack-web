'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import api, { getApiErrorMessage } from '@/lib/api';
import {
  MaterialUploadQueue,
  isUploadActive,
  type MaterialUploadRequest,
  type MaterialUploadTask,
} from './material-upload-queue';
import { MaterialUploadTray } from './material-upload-status';

const Context = createContext<MaterialUploadQueue | null>(null);

export function MaterialUploadProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const { user } = useAuth();
  return (
    <UploadSession key={user?._id ?? 'anonymous'} locale={locale}>
      {children}
    </UploadSession>
  );
}

function UploadSession({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';
  const [queue] = useState(
    () =>
      new MaterialUploadQueue({
        settled: (task) => {
          for (const queryKey of [
            ['course-materials', task.courseId],
            ['courses'],
            ['student-syllabi'],
            ['staff-assigned-courses'],
          ]) {
            void queryClient.invalidateQueries({ queryKey });
          }
          if (task.status === 'completed')
            toast.success(
              isAr ? 'تم رفع الملف وحفظه بنجاح' : 'File uploaded and saved',
              { description: task.fileName },
            );
          if (task.status === 'failed')
            toast.error(task.error, { description: task.fileName });
        },
        error: (error, task) =>
          task.status === 'saving' &&
          !(error as { response?: unknown; statusCode?: number })?.statusCode &&
          !(error as { response?: unknown })?.response
            ? isAr
              ? 'انقطع الاتصال أثناء الحفظ. تحقق من المرفقات قبل إعادة المحاولة.'
              : 'Connection lost while saving. Check course materials before retrying.'
            : getApiErrorMessage(
                error,
                isAr
                  ? 'فشل رفع الملف. يمكنك إعادة المحاولة من الإشعارات.'
                  : 'Upload failed. Retry from notifications.',
              ),
      }),
  );
  useEffect(() => {
    queue.activate();
    return () => queue.dispose();
  }, [queue]);
  return (
    <Context.Provider value={queue}>
      {children}
      <UploadLeaveWarning />
      <MaterialUploadTray locale={locale} />
    </Context.Provider>
  );
}

export function useMaterialUploadActions() {
  const queue = useContext(Context);
  if (!queue) throw new Error('MaterialUploadProvider is required');
  return {
    start: (request: MaterialUploadRequest) => queue.start(request),
    cancel: queue.cancel,
    retry: queue.retry,
    dismiss: queue.dismiss,
  };
}

export function useMaterialUploads() {
  const queue = useContext(Context);
  if (!queue) throw new Error('MaterialUploadProvider is required');
  const tasks = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  return {
    tasks,
    start: (request: MaterialUploadRequest) => queue.start(request),
    cancel: queue.cancel,
    retry: queue.retry,
    dismiss: queue.dismiss,
  };
}

export function useStartBookUpload() {
  const { start } = useMaterialUploadActions();
  return (courseId: string, label: string, file: File) =>
    start({
      key: `book:${courseId}:${file.name}:${file.size}:${file.lastModified}`,
      courseId,
      label,
      fileName: file.name,
      fileSize: file.size,
      request: (config) => {
        const form = new FormData();
        form.append('file', file);
        return api.post(`/admin/courses/${courseId}/syllabus`, form, config);
      },
    });
}

function UploadLeaveWarning() {
  const { tasks } = useMaterialUploads();
  const uploading = tasks.some(isUploadActive);
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);
  return null;
}

export type { MaterialUploadTask };
