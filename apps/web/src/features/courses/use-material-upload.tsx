'use client';

import { useEffect, useRef, useState } from 'react';
import type { AxiosRequestConfig } from 'axios';
import { Button } from '@/components/ui/button';

export function useMaterialUpload() {
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => controller.current?.abort();
  const begin = (): AxiosRequestConfig => {
    controller.current?.abort();
    controller.current = new AbortController();
    setProgress(0);
    return {
      signal: controller.current.signal,
      onUploadProgress: (event) => setProgress(event.total ? Math.min(100, Math.round(event.loaded * 100 / event.total)) : 0),
    };
  };
  const finish = () => { controller.current = null; setProgress(null); };
  return { begin, finish, cancel, progress };
}

export function MaterialUploadProgress({ progress, onCancel, isAr }: { progress: number | null; onCancel: () => void; isAr: boolean }) {
  if (progress === null) return null;
  return <div className="flex items-center justify-between gap-3" role="status">
    <span className="text-sm text-muted-foreground">{isAr ? 'جاري رفع الملف وحفظه' : 'Uploading and saving file'}: {progress}%</span>
    <Button type="button" variant="secondary" onClick={onCancel}>{isAr ? 'إلغاء الرفع' : 'Cancel upload'}</Button>
  </div>;
}
