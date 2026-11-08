import type { AxiosRequestConfig } from 'axios';

export type UploadStatus =
  'queued' | 'uploading' | 'saving' | 'completed' | 'failed' | 'cancelled';
export interface MaterialUploadTask {
  id: string;
  key: string;
  courseId: string;
  label: string;
  fileName: string;
  fileSize: number;
  status: UploadStatus;
  progress: number | null;
  loaded: number;
  bytesPerSecond: number;
  secondsRemaining: number | null;
  error?: string;
}
export interface MaterialUploadRequest {
  key: string;
  courseId: string;
  label: string;
  fileName: string;
  fileSize: number;
  request: (config: AxiosRequestConfig) => Promise<unknown>;
}
export const isUploadActive = (task: MaterialUploadTask) =>
  task.status === 'queued' ||
  task.status === 'uploading' ||
  task.status === 'saving';

/** Owns requests independently of any dialog, with one transfer at a time. */
export class MaterialUploadQueue {
  private tasks: MaterialUploadTask[] = [];
  private requests = new Map<string, MaterialUploadRequest>();
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private activeId: string | undefined;
  private disposed = false;
  private options: {
    settled: (task: MaterialUploadTask) => void;
    error: (error: unknown, task: MaterialUploadTask) => string;
  };

  constructor(options: MaterialUploadQueue['options']) {
    this.options = options;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.tasks;
  activate() {
    this.disposed = false;
  }
  private update(id: string, patch: Partial<MaterialUploadTask>) {
    this.tasks = this.tasks.map((task) =>
      task.id === id ? { ...task, ...patch } : task,
    );
    this.listeners.forEach((listener) => listener());
  }
  start(input: MaterialUploadRequest) {
    if (this.disposed) return;
    const duplicate = this.tasks.find(
      (task) => task.key === input.key && isUploadActive(task),
    );
    if (duplicate) return duplicate.id;
    const id = crypto.randomUUID();
    this.requests.set(id, input);
    this.tasks = [
      ...this.tasks,
      {
        id,
        key: input.key,
        courseId: input.courseId,
        label: input.label,
        fileName: input.fileName,
        fileSize: input.fileSize,
        status: 'queued',
        progress: 0,
        loaded: 0,
        bytesPerSecond: 0,
        secondsRemaining: null,
      },
    ];
    this.listeners.forEach((listener) => listener());
    void this.pump();
    return id;
  }
  cancel = (id: string) => {
    const task = this.tasks.find((item) => item.id === id);
    if (!task || !isUploadActive(task) || task.status === 'saving') return;
    this.update(id, { status: 'cancelled', secondsRemaining: null });
    this.requests.delete(id);
    this.controllers.get(id)?.abort();
  };
  retry = (id: string) => {
    const task = this.tasks.find((item) => item.id === id);
    if (task?.status !== 'failed' || !this.requests.has(id)) return;
    this.update(id, {
      status: 'queued',
      progress: 0,
      loaded: 0,
      bytesPerSecond: 0,
      secondsRemaining: null,
      error: undefined,
    });
    void this.pump();
  };
  dismiss = (id: string) => {
    if (this.tasks.some((task) => task.id === id && isUploadActive(task)))
      return;
    this.requests.delete(id);
    this.tasks = this.tasks.filter((task) => task.id !== id);
    this.listeners.forEach((listener) => listener());
  };
  dispose() {
    this.disposed = true;
    this.controllers.forEach((controller) => controller.abort());
    this.requests.clear();
  }
  private async pump() {
    if (this.activeId || this.disposed) return;
    const task = this.tasks.find((item) => item.status === 'queued');
    if (!task) return;
    const input = this.requests.get(task.id);
    if (!input) return;
    const controller = new AbortController();
    this.activeId = task.id;
    this.controllers.set(task.id, controller);
    const startedAt = performance.now();
    this.update(task.id, { status: 'uploading' });
    try {
      await input.request({
        signal: controller.signal,
        onUploadProgress: (event) => {
          if (this.disposed || controller.signal.aborted) return;
          const total = event.total;
          const progress = total
            ? event.loaded >= total
              ? 100
              : Math.min(99, Math.floor((event.loaded * 100) / total))
            : null;
          const bytesPerSecond =
            event.loaded /
            Math.max((performance.now() - startedAt) / 1000, 0.001);
          this.update(task.id, {
            loaded: event.loaded,
            progress,
            bytesPerSecond,
            secondsRemaining:
              total && bytesPerSecond
                ? Math.ceil(Math.max(0, total - event.loaded) / bytesPerSecond)
                : null,
            status: total && event.loaded >= total ? 'saving' : 'uploading',
          });
        },
      });
      if (!this.disposed && !controller.signal.aborted) {
        this.update(task.id, {
          status: 'completed',
          progress: 100,
          secondsRemaining: null,
        });
        this.requests.delete(task.id);
      }
    } catch (error) {
      if (!this.disposed && !controller.signal.aborted) {
        const current = this.tasks.find((item) => item.id === task.id)!;
        this.update(task.id, {
          status: 'failed',
          secondsRemaining: null,
          error: this.options.error(error, current),
        });
      }
    } finally {
      this.controllers.delete(task.id);
      if (this.activeId === task.id) this.activeId = undefined;
      const current = this.tasks.find((item) => item.id === task.id);
      if (!this.disposed && current) this.options.settled(current);
      void this.pump();
    }
  }
}
