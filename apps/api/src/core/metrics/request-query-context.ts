import { AsyncLocalStorage } from 'node:async_hooks';

export type DatabaseStage =
  | 'auth.session'
  | 'auth.user'
  | 'authorization.roles'
  | 'authorization.permissions'
  | 'response.serialization'
  | 'complaints.transformation'
  | 'complaints.page'
  | 'complaints.count'
  | 'complaints.enrichment'
  | 'registration.profile'
  | 'registration.period'
  | 'registration.rule'
  | 'registration.policy'
  | 'registration.term'
  | 'registration.existing'
  | 'registration.advising';

export interface RequestQueryMetrics {
  requestId: string;
  method?: string;
  route?: string;
  count: number;
  durationSeconds: number;
  stages: Map<DatabaseStage, { count: number; durationSeconds: number }>;
  reads: Map<string, Promise<unknown>>;
}

const storage = new AsyncLocalStorage<{
  request: RequestQueryMetrics;
  stage?: DatabaseStage;
}>();

export function getRequestQueryContext() {
  return storage.getStore();
}

export function runWithRequestQueryMetrics<T>(
  requestId: string,
  action: () => T,
): T {
  return storage.run(
    {
      request: {
        requestId,
        count: 0,
        durationSeconds: 0,
        stages: new Map(),
        reads: new Map(),
      },
    },
    action,
  );
}

/** Only immutable reads within this HTTP request. Never a cross-request policy cache. */
export function reuseRequestRead<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const reads = storage.getStore()?.request.reads;
  if (!reads) return load();
  const existing = reads.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = load();
  reads.set(key, pending);
  return pending;
}

export function measureSynchronousStage<T>(
  stage: DatabaseStage,
  action: () => T,
): T {
  const context = storage.getStore();
  if (!context) return action();
  const start = process.hrtime.bigint();
  try {
    return storage.run({ ...context, stage }, action);
  } finally {
    const previous = context.request.stages.get(stage);
    context.request.stages.set(stage, {
      count: (previous?.count ?? 0) + 1,
      durationSeconds:
        (previous?.durationSeconds ?? 0) +
        Number(process.hrtime.bigint() - start) / 1e9,
    });
  }
}

export async function measureDatabaseStage<T>(
  stage: DatabaseStage,
  action: () => PromiseLike<T>,
): Promise<T> {
  const context = storage.getStore();
  if (!context) return action();
  const start = process.hrtime.bigint();
  try {
    // Mongoose queries are lazy thenables: execute/await them inside the stage,
    // rather than returning them and letting the caller's context execute them.
    return await storage.run({ ...context, stage }, async () => await action());
  } finally {
    const previous = context.request.stages.get(stage);
    context.request.stages.set(stage, {
      count: (previous?.count ?? 0) + 1,
      durationSeconds:
        (previous?.durationSeconds ?? 0) +
        Number(process.hrtime.bigint() - start) / 1e9,
    });
  }
}
