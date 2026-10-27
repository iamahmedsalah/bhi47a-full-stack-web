import { MetricsService } from './metrics.service';
import {
  getRequestQueryContext,
  measureDatabaseStage,
  runWithRequestQueryMetrics,
} from './request-query-context';

describe('request database telemetry isolation', () => {
  it('executes lazy query thenables inside their named stage', async () => {
    let observedStage: string | undefined;
    const query = {
      then(resolve: (value: string) => void) {
        observedStage = getRequestQueryContext()?.stage;
        resolve('done');
      },
    } as unknown as PromiseLike<string>;
    const result = await runWithRequestQueryMetrics('lazy-query', () =>
      measureDatabaseStage('complaints.page', () => query),
    );
    expect(result).toBe('done');
    expect(observedStage).toBe('complaints.page');
  });

  it('keeps concurrent requests and parallel stages separate, including failed stages', async () => {
    const metrics = new MetricsService();
    try {
      const results = await Promise.all(
        ['request-a', 'request-b'].map((id) =>
          runWithRequestQueryMetrics(id, async () => {
            await Promise.all([
              measureDatabaseStage('complaints.page', async () => {
                await Promise.resolve();
                metrics.recordDbQuery('complaints', 'find', 0.2, {
                  filter: '{}',
                });
              }),
              measureDatabaseStage('complaints.count', async () => {
                await Promise.resolve();
                metrics.recordDbQuery('complaints', 'countDocuments', 0.01);
              }),
            ]);
            await expect(
              measureDatabaseStage('complaints.enrichment', () =>
                Promise.reject(new Error('expected')),
              ),
            ).rejects.toThrow('expected');
            return getRequestQueryContext()!.request;
          }),
        ),
      );
      expect(getRequestQueryContext()).toBeUndefined();
      for (const [i, result] of results.entries()) {
        expect(result.requestId).toBe(i === 0 ? 'request-a' : 'request-b');
        expect(result.count).toBe(2);
        expect(result.durationSeconds).toBeCloseTo(0.21);
        expect(result.stages.size).toBe(3);
        metrics.recordHttpRequest('GET', '/api/admin/complaints', 200, 0.25);
        metrics.recordRequestDatabaseMetrics(
          'GET',
          '/api/admin/complaints',
          result,
        );
      }
      const exported = await metrics.getMetrics();
      expect(exported).toContain(
        'student_portal_http_db_queries_sum{method="GET",route="/api/admin/complaints"} 4',
      );
      expect(exported).not.toContain('request-a');
      expect(exported).not.toContain('request-b');
      const slow = (await metrics.getSummary()).database.recentSlowQueries;
      expect(slow.map((row) => row.requestId).sort()).toEqual([
        'request-a',
        'request-b',
      ]);
      expect(slow.every((row) => row.stage === 'complaints.page')).toBe(true);
    } finally {
      metrics.onModuleDestroy();
      metrics.getRegistry().clear();
    }
  });
});
