import { HttpTrafficWindow, classifyHttpOutcome } from './http-traffic-window';

describe('window traffic semantics', () => {
  it('measures the 26-second tail and reports overflow without a fabricated percentile', () => {
    const traffic = new HttpTrafficWindow(() => 60_000);
    traffic.record('GET', '/api/admin/complaints', 200, 26.4, 'success');
    expect(traffic.summary('5m')).toMatchObject({
      overTenSeconds: 1,
      latencyOverflowRequests: 0,
      latencyUpperBoundMs: 120_000,
    });
    expect(traffic.summary('5m').p95LatencyMs).toBeGreaterThan(26_000);
    traffic.record('GET', '/api/admin/complaints', 200, 130, 'success');
    expect(traffic.summary('5m')).toMatchObject({
      p95LatencyMs: null,
      p99LatencyMs: null,
      latencyOverflowRequests: 1,
      routes: [
        expect.objectContaining({
          p95LatencyMs: null,
          latencyOverflowRequests: 1,
        }),
      ],
    });
  });
  it('expires old traffic, reports idle RPS as zero and keeps security rejections separate from 5xx', () => {
    let now = 60_000;
    const traffic = new HttpTrafficWindow(() => now);
    traffic.record('GET', '/api/auth/me', 401, 0.01, 'anonymous_probe');
    traffic.record('GET', '/api/auth/me', 401, 0.02, 'session_rejected');
    traffic.record('GET', '/api/admin/complaints', 200, 0.4, 'success');
    now += 60_000;
    const first = traffic.summary('5m');
    expect(first).toMatchObject({
      totalRequests: 3,
      status4xx: 2,
      status5xx: 0,
      actionableErrorRatePercent: 0,
    });
    expect(first.requestsPerSecond).toBeCloseTo(3 / 60);
    expect(first.p95LatencyMs).toBeGreaterThan(250);
    now += 6 * 60_000;
    expect(traffic.summary('5m')).toMatchObject({
      totalRequests: 0,
      requestsPerSecond: 0,
      p95LatencyMs: null,
    });
    expect(traffic.summary('15m').totalRequests).toBe(3);
    now += 25 * 3600_000;
    expect(traffic.summary('24h').totalRequests).toBe(0);
  });

  it('uses finite classifications without declaring every 401 an anonymous probe', () => {
    expect(classifyHttpOutcome('GET', '/api/auth/me', 401, false)).toBe(
      'anonymous_probe',
    );
    expect(classifyHttpOutcome('GET', '/api/auth/me', 401, true)).toBe(
      'session_rejected',
    );
    expect(
      classifyHttpOutcome('POST', '/api/auth/admin/login', 401, false),
    ).toBe('authentication_rejected');
    expect(classifyHttpOutcome('GET', '/api/admin/complaints', 403, true)).toBe(
      'permission_denied',
    );
    expect(classifyHttpOutcome('GET', '/api/auth/me', 500, false)).toBe(
      'server_error',
    );
  });

  it('excludes the partial minute at the start of a full window and uses its actual denominator', () => {
    let now = 0;
    const traffic = new HttpTrafficWindow(() => now);
    traffic.record('GET', '/old', 200, 0.1, 'success');
    now = 120_000;
    traffic.record('GET', '/current', 200, 0.1, 'success');
    now = 330_000;
    expect(traffic.summary('5m')).toMatchObject({
      totalRequests: 1,
      observedSeconds: 270,
    });
    expect(traffic.summary('5m').requestsPerSecond).toBeCloseTo(1 / 270);
  });
});
