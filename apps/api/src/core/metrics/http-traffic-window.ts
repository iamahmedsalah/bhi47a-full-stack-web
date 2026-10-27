export const TRAFFIC_WINDOWS = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '24h': 86400,
} as const;
export type TrafficWindow = keyof typeof TRAFFIC_WINDOWS;
export const HTTP_LATENCY_BUCKETS = [
  0.01,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  Infinity,
];
export type HttpOutcome =
  | 'success'
  | 'redirect'
  | 'anonymous_probe'
  | 'session_rejected'
  | 'authentication_rejected'
  | 'permission_denied'
  | 'validation_rejected'
  | 'rate_limited'
  | 'unexpected_client_error'
  | 'unclassified_error'
  | 'server_error';

export function classifyHttpOutcome(
  method: string,
  route: string,
  status: number,
  hasCookie: boolean,
): HttpOutcome {
  if (status >= 500) return 'server_error';
  if (status === 401) {
    if (method === 'GET' && route === '/api/auth/me')
      return hasCookie ? 'session_rejected' : 'anonymous_probe';
    return route.startsWith('/api/auth/')
      ? 'authentication_rejected'
      : 'session_rejected';
  }
  if (status === 403) return 'permission_denied';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation_rejected';
  if (status >= 400) return 'unexpected_client_error';
  return status >= 300 ? 'redirect' : 'success';
}

export interface TrafficStat {
  count: number;
  duration: number;
  buckets: number[];
  statuses: Record<string, number>;
  outcomes: Partial<Record<HttpOutcome, number>>;
}
const empty = (): TrafficStat => ({
  count: 0,
  duration: 0,
  buckets: HTTP_LATENCY_BUCKETS.map(() => 0),
  statuses: {},
  outcomes: {},
});

function merge(target: TrafficStat, source: TrafficStat) {
  target.count += source.count;
  target.duration += source.duration;
  source.buckets.forEach((count, index) => {
    target.buckets[index] += count;
  });
  for (const [key, count] of Object.entries(source.statuses))
    target.statuses[key] = (target.statuses[key] ?? 0) + count;
  for (const [key, count] of Object.entries(source.outcomes)) {
    const outcome = key as HttpOutcome;
    target.outcomes[outcome] = (target.outcomes[outcome] ?? 0) + count;
  }
}

/** Histogram interpolation, matching Prometheus semantics; never an exact sample percentile. */
export function trafficPercentile(
  stat: TrafficStat,
  quantile: number,
): number | null {
  if (!stat.count) return null;
  const rank = quantile * stat.count;
  let below = 0;
  for (let i = 0; i < stat.buckets.length; i++) {
    const count = stat.buckets[i];
    if (below + count >= rank) {
      const low = i === 0 ? 0 : HTTP_LATENCY_BUCKETS[i - 1];
      const high = HTTP_LATENCY_BUCKETS[i];
      return (
        1000 *
        (Number.isFinite(high)
          ? low + ((high - low) * (rank - below)) / count
          : low)
      );
    }
    below += count;
  }
  return null;
}

export function summarizeTraffic(stat: TrafficStat, seconds: number) {
  const group = (prefix: string) =>
    Object.entries(stat.statuses).reduce(
      (sum, [status, count]) => sum + (status.startsWith(prefix) ? count : 0),
      0,
    );
  const status4xx = group('4');
  const status5xx = group('5');
  // Explicit triage definition. Security/validation outcomes remain visible separately.
  const actionable =
    (stat.outcomes.unexpected_client_error ?? 0) +
    (stat.outcomes.server_error ?? 0);
  return {
    totalRequests: stat.count,
    requestsPerSecond: stat.count / seconds,
    avgLatencyMs: stat.count ? (stat.duration * 1000) / stat.count : null,
    p50LatencyMs: trafficPercentile(stat, 0.5),
    p95LatencyMs: trafficPercentile(stat, 0.95),
    p99LatencyMs: trafficPercentile(stat, 0.99),
    status2xx: group('2'),
    status3xx: group('3'),
    status4xx,
    status5xx,
    rawErrorRatePercent: stat.count
      ? (100 * (status4xx + status5xx)) / stat.count
      : 0,
    actionableErrorRatePercent: stat.count
      ? (100 * actionable) / stat.count
      : 0,
    statusCounts: stat.statuses,
    outcomes: stat.outcomes,
  };
}

/** Bounded per-minute aggregates. Counters used by Prometheus remain independent. */
export class HttpTrafficWindow {
  private readonly startedAt: number;
  private readonly minutes = new Map<number, Map<string, TrafficStat>>();
  constructor(private readonly now = Date.now) {
    this.startedAt = now();
  }

  record(
    method: string,
    route: string,
    status: number,
    seconds: number,
    outcome: HttpOutcome,
  ) {
    const minute = Math.floor(this.now() / 60000) * 60000;
    for (const time of this.minutes.keys())
      if (time < minute - 86400000) this.minutes.delete(time);
    const routes = this.minutes.get(minute) ?? new Map<string, TrafficStat>();
    this.minutes.set(minute, routes);
    const key = `${method} ${route}`;
    const stat = routes.get(key) ?? empty();
    routes.set(key, stat);
    stat.count++;
    stat.duration += seconds;
    stat.buckets[HTTP_LATENCY_BUCKETS.findIndex((upper) => seconds <= upper)]++;
    stat.statuses[status] = (stat.statuses[status] ?? 0) + 1;
    stat.outcomes[outcome] = (stat.outcomes[outcome] ?? 0) + 1;
  }

  summary(window: TrafficWindow) {
    const now = this.now();
    const start = Math.max(
      this.startedAt,
      Math.ceil((now - TRAFFIC_WINDOWS[window] * 1000) / 60000) * 60000,
    );
    const seconds = Math.max(1, (now - start) / 1000);
    const total = empty();
    const routes = new Map<string, TrafficStat>();
    for (const [time, entries] of this.minutes) {
      if (time + 60000 <= start || time > now) continue;
      for (const [route, stat] of entries) {
        merge(total, stat);
        const combined = routes.get(route) ?? empty();
        merge(combined, stat);
        routes.set(route, combined);
      }
    }
    return {
      source: 'process' as 'process' | 'prometheus',
      window,
      observedSeconds: seconds,
      resolutionSeconds: 60,
      ...summarizeTraffic(total, seconds),
      routes: [...routes]
        .map(([route, stat]) => ({ route, ...summarizeTraffic(stat, seconds) }))
        .sort((a, b) => (b.p95LatencyMs ?? 0) - (a.p95LatencyMs ?? 0)),
    };
  }
}
