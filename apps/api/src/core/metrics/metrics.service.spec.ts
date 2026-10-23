import { MetricsService } from './metrics.service';

describe('metrics summary semantics', () => {
  let metrics: MetricsService;
  beforeEach(() => {
    metrics = new MetricsService();
  });
  afterEach(() => {
    metrics.onModuleDestroy();
    metrics.getRegistry().clear();
  });

  it('separates rejected requests, server failures, redirects and successes', async () => {
    for (const status of [200, 401, 500, 307])
      metrics.recordHttpRequest('POST', '/api/auth/student/login', status, 0.1);
    const result = await metrics.getSummary();
    expect(result.http).toMatchObject({
      status2xx: 1,
      status3xx: 1,
      status4xx: 1,
      status5xx: 1,
    });
    expect(result.http.routes[0]).toMatchObject({
      count: 4,
      errorCount: 2,
      clientErrorCount: 1,
      serverErrorCount: 1,
      statusCounts: { '200': 1, '401': 1, '500': 1, '307': 1 },
    });
    result.http.routes[0].statusCounts['401'] = 100;
    expect(
      (await metrics.getSummary()).http.routes[0].statusCounts['401'],
    ).toBe(1);
  });

  it('keeps a 734 ms observation visible at the documented threshold', async () => {
    metrics.recordDbQuery('complaints', 'find', 0.734, {
      filter: '{}',
      options: 'limit=100 sort={"createdAt":-1}',
    });
    const summary = await metrics.getSummary();
    expect(summary.database.slowQueryThresholdMs).toBe(100);
    expect(summary.database.recentSlowQueries[0]).toMatchObject({
      durationMs: 734,
      filter: '{}',
      options: expect.stringContaining('limit=100'),
    });
  });

  it('bounds Prometheus route labels when unmatched/scanner traffic grows', async () => {
    for (let i = 0; i < 120; i++)
      metrics.recordHttpRequest('GET', `/missing/path-${i}`, 404, 0.01);
    const counters = (await metrics.getRegistry().getMetricsAsJSON()).find(
      (metric) => metric.name === 'student_portal_http_requests_total',
    );
    expect(counters!.values.length).toBe(101);
    expect(
      counters!.values.find((value) => value.labels.route === '/other')?.value,
    ).toBe(20);
  });
});
