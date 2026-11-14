import type { MetricsSummaryResponse, RecentSlowQuery } from "./api";

export function buildRouteRows(data: MetricsSummaryResponse) {
  const windows = new Map(
    data.traffic?.routes.map((row) => [row.route, row]) ?? [],
  );
  const lifetime = new Map(
    (data.http.routes ?? []).map((row) => [row.route, row]),
  );
  const traces = new Map<
    string,
    NonNullable<MetricsSummaryResponse["recentSlowRequests"]>
  >();
  for (const trace of data.recentSlowRequests ?? []) {
    const key = `${trace.method} ${trace.route}`;
    const rows = traces.get(key) ?? [];
    rows.push(trace);
    traces.set(key, rows);
  }
  return [
    ...new Set([...lifetime.keys(), ...windows.keys(), ...traces.keys()]),
  ].map((key) => {
    const all = lifetime.get(key);
    const current = windows.get(key);
    return {
      _id: key,
      route: key,
      method: all?.method ?? key.split(" ")[0],
      lifetimeCalls: all?.count ?? 0,
      avgMs: all?.count ? all.avgLatencyMs : null,
      maxMs: all?.count ? (all.maxLatencyMs ?? null) : null,
      lifetime4xx: all?.clientErrorCount ?? 0,
      lifetime5xx: all?.serverErrorCount ?? 0,
      statuses: all?.statusCounts ?? {},
      windowCalls: current?.totalRequests ?? 0,
      p95Ms: current?.p95LatencyMs ?? null,
      latencyOverflowRequests: current?.latencyOverflowRequests ?? 0,
      latencyUpperBoundMs: current?.latencyUpperBoundMs ?? null,
      overTenSeconds: current?.overTenSeconds ?? null,
      // Older servers do not provide the 4xx/5xx split. Do not invent it.
      window4xx: current?.status4xx ?? null,
      window5xx: current?.status5xx ?? null,
      windowErrors:
        current?.errorCount ??
        (current?.status4xx ?? 0) + (current?.status5xx ?? 0),
      traces: traces.get(key) ?? [],
    };
  });
}

export function buildDatabaseRows(data: MetricsSummaryResponse) {
  const rows = new Map<
    string,
    {
      _id: string;
      collection: string;
      operation: string;
      count: number;
      avgMs: number;
      maxMs: number;
      coldStartCount: number;
      samples: RecentSlowQuery[];
    }
  >();
  for (const aggregate of data.database.slowQueriesByCollection ?? []) {
    const key = `${aggregate.collection}:${aggregate.operation}`;
    rows.set(key, { _id: key, ...aggregate, samples: [] });
  }
  for (const sample of data.database.recentSlowQueries) {
    const key = `${sample.collection}:${sample.operation}`;
    const row = rows.get(key) ?? {
      _id: key,
      collection: sample.collection,
      operation: sample.operation,
      count: 0,
      avgMs: 0,
      maxMs: 0,
      coldStartCount: 0,
      samples: [],
    };
    row.samples.push(sample);
    rows.set(key, row);
  }
  // Older API responses may contain only the bounded sample buffer.
  for (const row of rows.values()) {
    if (!row.count && row.samples.length) {
      row.count = row.samples.length;
      row.avgMs =
        row.samples.reduce((sum, sample) => sum + sample.durationMs, 0) /
        row.count;
      row.maxMs = Math.max(...row.samples.map((sample) => sample.durationMs));
      row.coldStartCount = row.samples.filter(
        (sample) => sample.isColdStart,
      ).length;
    }
  }
  return [...rows.values()];
}

export type UnifiedRouteRow = ReturnType<typeof buildRouteRows>[number];
export type UnifiedDatabaseRow = ReturnType<typeof buildDatabaseRows>[number];
