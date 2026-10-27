import { AsyncLocalStorage } from 'node:async_hooks';

export type DatabaseStage =
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
  count: number;
  durationSeconds: number;
  stages: Map<DatabaseStage, { count: number; durationSeconds: number }>;
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
    { request: { requestId, count: 0, durationSeconds: 0, stages: new Map() } },
    action,
  );
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
