# Benchmark results and reproducible procedure

No representative live database or authenticated staging identity was supplied. Production load tests were not run. No latency percentage improvement is claimed.

| Metric | Before | After | Evidence |
| --- | --- | --- | --- |
| Complaints mean | 1,330 ms supplied observation | Not measured | Export narrative; not p95 |
| Complaints p50/p95/p99 | Not measured | Not measured | Requires equivalent staging workload |
| Complaints query/count/enrichment p95 | Not measured | Not measured | Stage metrics + read-only plans prepared |
| Session validation p95 / checkout p95 | Not measured | Not measured | New pool/command instrumentation |
| Successful `/auth/me` user reads/request | 2 source reads | 1 in service regression fixture | Request-scoped reuse, not a production query trace |
| Heartbeat user reads/request | 2 source reads | 1 in service regression fixture | Conditional activity update remains additional |
| Session validation reads/protected request | 1 | 1 | Fresh revocation check retained |
| `/auth/me` unauthorized count | 240 supplied | Not measured | Historical lifetime, not an interval comparison |
| 5xx | 0 supplied | Not measured | Never infer future zeros |
| Eligibility p95, slow-query rate, Mongo ops/sec | Not measured | Not measured | Existing optimization preserved; no new latency claim |

Provide an admin session in `PERF_COOKIE` and a **local or explicitly identified staging** API base ending in `/api`, through private environment variables. Never paste cookies into reports or commit them. Run:

```powershell
node scripts/performance-http-benchmark.mjs > before-http.json
node scripts/performance-query-plans.mjs > before-plans.json
# Deploy only to staging; keep data, identities, filters and infrastructure fixed.
node scripts/performance-http-benchmark.mjs > after-http.json
node scripts/performance-query-plans.mjs > after-plans.json
```

The HTTP sampler performs three warmups and 30 sequential samples per case by default (20-item, 100-item, open complaints), reports p50/p95/p99, status counts and bytes without response bodies or credentials. It rejects remote targets unless `PERF_ENVIRONMENT=staging`, caps samples at 200 and stops on failures. It is a controlled sampler, not representative concurrency/load. Run separately with a student identity for eligibility using an approved workload; the admin sampler intentionally does not mix identities.

In parallel, record equal Prometheus windows for successful HTTP p95, DB operations/request, slow DB rate, checkout p95, command p95, event-loop delay, CPU, memory, and status/category rates. Track request volume/sample size and distinguish warm/cold runs. Do not compare counters from different process lifetimes or subtract overlapping DB durations from HTTP time. Validate filters, deterministic pages, totals, authorization and empty results before comparing latency. Targets remain complaints p95 <500 ms and better session-validation p95 without weaker revocation.

Local validation results are recorded in [rollout](PRODUCTION_ROLLOUT_CHECKLIST.md).

The local browser regression also demonstrates that an anonymous protected-page visit now produces one real `/auth/me` 401 followed by client navigation, without mounting protected feature queries. This is synthetic request-count evidence, not a measured reduction from the historical 240 responses.
