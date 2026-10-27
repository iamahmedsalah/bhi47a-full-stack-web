import { prometheusTraffic, trafficPromql } from './prometheus-traffic';

describe('Prometheus traffic queries', () => {
  const previous = process.env.PROMETHEUS_URL;
  beforeEach(() => {
    process.env.PROMETHEUS_URL = 'http://metrics.invalid';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env.PROMETHEUS_URL;
    else process.env.PROMETHEUS_URL = previous;
  });

  it('queries counter increases and histogram rates in one fixed, job-scoped window', () => {
    const query = trafficPromql('15m', 'portal-api');
    expect(query).toContain(
      'rate(student_portal_http_requests_total{job="portal-api"}[15m])',
    );
    expect(query).toContain(
      'increase(student_portal_http_requests_total{job="portal-api"}[15m])',
    );
    expect(query).toContain('histogram_quantile(0.95');
    expect(() => trafficPromql('5m', '"} or up')).toThrow();
  });

  it('retains raw 401s and zero 5xx while classifying anonymous probes separately', async () => {
    const vector = (kind: string, value: string, labels = {}) => ({
      metric: { kind, ...labels },
      value: [1, value],
    });
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [
              vector('totalRequests', '100'),
              vector('requestsPerSecond', '0.3'),
              vector('p95LatencyMs', '450'),
              vector('statusCounts', '20', { status_code: '401' }),
              vector('statusCounts', '80', { status_code: '200' }),
              vector('outcomes', '20', { outcome: 'anonymous_probe' }),
              vector('outcomes', '80', { outcome: 'success' }),
              vector('routeCount', '100', {
                method: 'GET',
                route: '/api/auth/me',
              }),
              vector('routeP95', 'NaN', {
                method: 'GET',
                route: '/api/auth/me',
              }),
            ],
          },
        }),
    } as Response);
    expect(await prometheusTraffic('5m')).toMatchObject({
      source: 'prometheus',
      totalRequests: 100,
      status4xx: 20,
      status5xx: 0,
      rawErrorRatePercent: 20,
      actionableErrorRatePercent: 0,
      p95LatencyMs: 450,
      routes: [
        { route: 'GET /api/auth/me', totalRequests: 100, p95LatencyMs: null },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails over when history is absent rather than inventing zero latency', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: { resultType: 'vector', result: [] },
        }),
    } as Response);
    await expect(prometheusTraffic('5m')).rejects.toThrow('two scrapes');
  });

  it('keeps errors from older replicas actionable when classification metrics are missing', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [
              { metric: { kind: 'totalRequests' }, value: [1, '10'] },
              { metric: { kind: 'requestsPerSecond' }, value: [1, '1'] },
              {
                metric: { kind: 'statusCounts', status_code: '500' },
                value: [1, '2'],
              },
            ],
          },
        }),
    } as Response);
    expect(await prometheusTraffic('5m')).toMatchObject({
      status5xx: 2,
      actionableErrorRatePercent: 20,
      outcomes: { unclassified_error: 2 },
    });
  });
});
