import {
  TRAFFIC_WINDOWS,
  HTTP_LATENCY_MAX_SECONDS,
  type TrafficWindow,
  type HttpTrafficWindow,
  type HttpOutcome,
} from './http-traffic-window';

export function trafficPromql(window: TrafficWindow, job?: string) {
  // Only server configuration chooses the scrape job; no arbitrary client PromQL.
  if (job && !/^[\w.-]+$/.test(job)) throw new Error('Invalid metrics job');
  const selector = (extra = '') =>
    `{${[job ? `job="${job}"` : '', extra].filter(Boolean).join(',')}}`;
  const requests = (extra = '') =>
    `student_portal_http_requests_total${selector(extra)}[${window}]`;
  const latency = `student_portal_http_request_duration_seconds_bucket${selector()}[${window}]`;
  const outcomes = `student_portal_http_outcomes_total${selector()}[${window}]`;
  const expressions: Record<string, string> = {
    // A rolling deployment may contain old bucket schemas. Compare window
    // coverage per series before aggregating incompatible histograms.
    latencyBucketsCompatible: `sum(count_over_time(student_portal_http_request_duration_seconds_bucket${selector(`le="${HTTP_LATENCY_MAX_SECONDS}"`)}[${window}])) == bool sum(count_over_time(student_portal_http_request_duration_seconds_bucket${selector('le="+Inf"')}[${window}]))`,
    successfulOverflow: `sum(increase(student_portal_http_request_duration_seconds_bucket${selector('status_code=~"2..",le="+Inf"')}[${window}])) - sum(increase(student_portal_http_request_duration_seconds_bucket${selector(`status_code=~"2..",le="${HTTP_LATENCY_MAX_SECONDS}"`)}[${window}]))`,
    latencyOverflowRequests: `sum(increase(student_portal_http_request_duration_seconds_bucket${selector('le="+Inf"')}[${window}])) - sum(increase(student_portal_http_request_duration_seconds_bucket${selector(`le="${HTTP_LATENCY_MAX_SECONDS}"`)}[${window}]))`,
    overTenSeconds: `sum(increase(student_portal_http_request_duration_seconds_bucket${selector('le="+Inf"')}[${window}])) - sum(increase(student_portal_http_request_duration_seconds_bucket${selector('le="10"')}[${window}]))`,
    routeOverflow: `sum by (method, route) (increase(student_portal_http_request_duration_seconds_bucket${selector('le="+Inf"')}[${window}])) - sum by (method, route) (increase(student_portal_http_request_duration_seconds_bucket${selector(`le="${HTTP_LATENCY_MAX_SECONDS}"`)}[${window}]))`,
    routeOverTen: `sum by (method, route) (increase(student_portal_http_request_duration_seconds_bucket${selector('le="+Inf"')}[${window}])) - sum by (method, route) (increase(student_portal_http_request_duration_seconds_bucket${selector('le="10"')}[${window}]))`,
    totalRequests: `sum(increase(${requests()}))`,
    requestsPerSecond: `sum(rate(${requests()}))`,
    avgLatencyMs: `1000 * sum(rate(student_portal_http_request_duration_seconds_sum${selector()}[${window}])) / sum(rate(student_portal_http_request_duration_seconds_count${selector()}[${window}]))`,
    outcomes: `sum by (outcome) (increase(${outcomes}))`,
    routeCount: `sum by (method, route) (increase(${requests()}))`,
    routeErrors: `sum by (method, route) (increase(${requests('status_code=~"[45].."')}))`,
    routeP95: `1000 * histogram_quantile(0.95, sum by (method, route, le) (rate(${latency})))`,
    statusCounts: `sum by (status_code) (increase(${requests()}))`,
    avgDbQueries: `sum(rate(student_portal_http_db_queries_sum${selector()}[${window}])) / sum(rate(student_portal_http_db_queries_count${selector()}[${window}]))`,
    p95DbQueries: `histogram_quantile(0.95, sum by (le) (rate(student_portal_http_db_queries_bucket${selector()}[${window}])))`,
    successfulP95LatencyMs: `1000 * histogram_quantile(0.95, sum by (le) (rate(student_portal_http_request_duration_seconds_bucket${selector('status_code=~"2.."')}[${window}])))`,
  };
  for (const [name, value] of Object.entries({
    p50LatencyMs: 0.5,
    p95LatencyMs: 0.95,
    p99LatencyMs: 0.99,
  })) {
    expressions[name] =
      `1000 * histogram_quantile(${value}, sum by (le) (rate(${latency})))`;
  }
  return Object.entries(expressions)
    .map(
      ([kind, expr]) =>
        `label_replace((${expr}), "kind", "${kind}", "__name__", ".*")`,
    )
    .join(' or ');
}

type TrafficSummary = ReturnType<HttpTrafficWindow['summary']>;
interface PrometheusVector {
  metric: Record<string, string>;
  value: [number, string];
}

/** One bounded instant query for the selected window. Never exposes the Prometheus URL/token. */
export async function prometheusTraffic(window: TrafficWindow): Promise<
  | (Omit<TrafficSummary, 'routes'> & {
      routes: Array<{
        route: string;
        totalRequests: number;
        p95LatencyMs: number | null;
        errorCount: number;
        latencyOverflowRequests: number;
        latencyUpperBoundMs: number;
        overTenSeconds: number;
      }>;
      avgDbQueries: number | null;
      p95DbQueries: number | null;
      successfulP95LatencyMs: number | null;
    })
  | null
> {
  const base = process.env.PROMETHEUS_URL;
  if (!base) return null;
  const url = new URL(`${base.replace(/\/$/, '')}/api/v1/query`);
  url.searchParams.set(
    'query',
    trafficPromql(window, process.env.PROMETHEUS_JOB),
  );
  const response = await fetch(url, {
    signal: AbortSignal.timeout(2000),
    redirect: 'error',
    headers: process.env.PROMETHEUS_BEARER_TOKEN
      ? { Authorization: `Bearer ${process.env.PROMETHEUS_BEARER_TOKEN}` }
      : {},
  });
  if (!response.ok) throw new Error('Prometheus unavailable');
  const body = (await response.json()) as {
    status?: string;
    data?: { resultType?: string; result?: PrometheusVector[] };
    warnings?: string[];
  };
  if (
    body.status !== 'success' ||
    body.data?.resultType !== 'vector' ||
    !Array.isArray(body.data.result) ||
    body.warnings?.length
  )
    throw new Error('Incomplete Prometheus result');
  const values: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  const outcomes: Partial<Record<HttpOutcome, number>> = {};
  const routes = new Map<
    string,
    {
      route: string;
      totalRequests: number;
      p95LatencyMs: number | null;
      errorCount: number;
      latencyOverflowRequests: number;
      latencyUpperBoundMs: number;
      overTenSeconds: number;
    }
  >();
  for (const row of body.data.result) {
    const value = Number(row.value?.[1]);
    if (!Number.isFinite(value)) continue;
    const kind = row.metric.kind;
    if (kind === 'outcomes')
      outcomes[row.metric.outcome as HttpOutcome] = value;
    else if (kind === 'statusCounts') statuses[row.metric.status_code] = value;
    else if (
      [
        'routeCount',
        'routeP95',
        'routeErrors',
        'routeOverflow',
        'routeOverTen',
      ].includes(kind)
    ) {
      const key = `${row.metric.method} ${row.metric.route}`;
      const route = routes.get(key) ?? {
        route: key,
        totalRequests: 0,
        p95LatencyMs: null,
        errorCount: 0,
        latencyOverflowRequests: 0,
        latencyUpperBoundMs: HTTP_LATENCY_MAX_SECONDS * 1000,
        overTenSeconds: 0,
      };
      if (kind === 'routeCount') route.totalRequests = value;
      if (kind === 'routeP95') route.p95LatencyMs = value;
      if (kind === 'routeErrors') route.errorCount = value;
      if (kind === 'routeOverflow')
        route.latencyOverflowRequests = Math.max(0, value);
      if (kind === 'routeOverTen') route.overTenSeconds = Math.max(0, value);
      routes.set(key, route);
    } else values[kind] = value;
  }
  if (
    values.totalRequests === undefined ||
    values.requestsPerSecond === undefined
  )
    throw new Error('Prometheus needs at least two scrapes');
  if (values.latencyBucketsCompatible !== 1)
    throw new Error(
      'Incompatible HTTP latency buckets; use process history until rollout completes',
    );
  const overflow = Math.max(0, values.latencyOverflowRequests ?? 0);
  const percentile = (name: string, quantile: number) =>
    overflow > values.totalRequests * (1 - quantile)
      ? null
      : (values[name] ?? null);
  for (const route of routes.values()) {
    if (route.latencyOverflowRequests > route.totalRequests * 0.05)
      route.p95LatencyMs = null;
  }
  const group = (prefix: string) =>
    Object.entries(statuses).reduce(
      (sum, [code, count]) => sum + (code.startsWith(prefix) ? count : 0),
      0,
    );
  const errors = group('4') + group('5');
  const classifiedErrors = Object.entries(outcomes).reduce(
    (sum, [kind, count]) =>
      sum + (['success', 'redirect'].includes(kind) ? 0 : count),
    0,
  );
  const unclassifiedErrors = Math.max(0, errors - classifiedErrors);
  if (unclassifiedErrors > 0) outcomes.unclassified_error = unclassifiedErrors;
  return {
    source: 'prometheus',
    window,
    observedSeconds: TRAFFIC_WINDOWS[window],
    resolutionSeconds: 0,
    totalRequests: values.totalRequests,
    requestsPerSecond: values.requestsPerSecond,
    avgLatencyMs: values.avgLatencyMs ?? null,
    p50LatencyMs: percentile('p50LatencyMs', 0.5),
    p95LatencyMs: percentile('p95LatencyMs', 0.95),
    p99LatencyMs: percentile('p99LatencyMs', 0.99),
    latencyUpperBoundMs: HTTP_LATENCY_MAX_SECONDS * 1000,
    latencyOverflowRequests: overflow,
    overTenSeconds: Math.max(0, values.overTenSeconds ?? 0),
    status2xx: group('2'),
    status3xx: group('3'),
    status4xx: group('4'),
    status5xx: group('5'),
    rawErrorRatePercent: values.totalRequests
      ? (100 * errors) / values.totalRequests
      : 0,
    actionableErrorRatePercent: values.totalRequests
      ? (100 *
          ((outcomes.unexpected_client_error ?? 0) +
            (outcomes.server_error ?? 0) +
            unclassifiedErrors)) /
        values.totalRequests
      : 0,
    successfulP95LatencyMs:
      (values.successfulOverflow ?? 0) > group('2') * 0.05
        ? null
        : (values.successfulP95LatencyMs ?? null),
    statusCounts: statuses,
    outcomes,
    avgDbQueries: values.avgDbQueries ?? null,
    p95DbQueries: values.p95DbQueries ?? null,
    routes: [...routes.values()].sort(
      (a, b) => (b.p95LatencyMs ?? 0) - (a.p95LatencyMs ?? 0),
    ),
  };
}
