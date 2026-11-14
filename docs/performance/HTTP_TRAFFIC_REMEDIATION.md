# HTTP Traffic accuracy

Changed backend: `core/metrics/http-traffic-window.ts`, `prometheus-traffic.ts`, metrics service/controller/middleware. Frontend: `features/metrics/api.ts`, `features/metrics/http-traffic.tsx`, and admin metrics page. Configuration examples: `apps/api/.env.example`.

`GET /api/metrics/summary?window=5m|15m|1h|24h` remains admin-only. Its new `traffic` object is independent of the existing `http` lifetime counters, which remain compatible. The old route table is explicitly labeled process lifetime. New traffic cards preserve the theme and Arabic RTL/English LTR behavior and use Radix selection.

Set server-only `PROMETHEUS_URL` to the Prometheus API base and optionally `PROMETHEUS_JOB` (a fixed scrape job name) and `PROMETHEUS_BEARER_TOKEN`. These never reach the browser or logs. All replicas must be scraped. Scope the job to this deployment to avoid mixing staging/production. One fixed instant query combines all requested series, with a two-second timeout and no redirects. The client selects only an allowlisted window, never arbitrary PromQL.

Core expressions (substitute the selected window and consistent deployment/job selector):

```promql
sum(rate(student_portal_http_requests_total[5m]))
sum(increase(student_portal_http_requests_total[5m]))
sum by (status_code) (increase(student_portal_http_requests_total[5m]))
1000 * histogram_quantile(0.95,
  sum by (le) (rate(student_portal_http_request_duration_seconds_bucket[5m])))
1000 * histogram_quantile(0.95,
  sum by (le) (rate(student_portal_http_request_duration_seconds_bucket{status_code=~"2.."}[5m])))
sum(rate(student_portal_http_db_queries_sum[5m])) /
sum(rate(student_portal_http_db_queries_count[5m]))
histogram_quantile(0.95,
  sum by (le) (rate(student_portal_http_db_queries_bucket[5m])))
```

p50/p95/p99 are histogram estimates across all statuses; successful-only p95 is separately labeled. Null/no samples display an em dash. Prometheus increase extrapolates and may be fractional; counts are displayed rounded. No process-lifetime count is divided by uptime in the new card. The November 14 update adds finite boundaries through 120 seconds and reports overflow explicitly. Mixed sample coverage between the 120-second and infinity buckets causes a labeled process-history fallback during rollout; see [deployment details](POST_DEPLOY_IMPLEMENTATION_2026-11-14.md).

Without configured, reachable, sufficiently sampled Prometheus history, the UI says process-only. Fallback uses minute buckets retained for at most 24 hours, with bounded route cardinality inherited from the existing metric route cap. It excludes the partial minute at the leading edge of a full window and uses the actual observed duration, displayed with one-minute resolution. Short-lived processes have partial coverage; fallback never claims replica-wide history. Aggregated DB calls/request and successful-only p95 are unavailable in fallback and display an em dash. Counter resets across replicas are handled by Prometheus rate/increase before aggregation. Scrape failures, partial warnings and no samples cause fallback instead of invented historical zeros.

HTTP outcomes use a separate compatible counter `student_portal_http_outcomes_total{method,route,outcome}`. A 401 on GET `/auth/me` without an access cookie is an anonymous probe; one with a cookie is a rejected session, not proof of expiration alone. Other auth 401s are authentication rejections. Permission denials, validation responses, 429s, other client errors and 5xx remain distinct. These categories are triage hints, not a substitute for security investigation.

The raw error percentage includes **all** 4xx/5xx. The separately described review rate includes other client errors, unclassified errors from older replicas, and server errors. Security/validation categories remain visible even when excluded from that review-rate numerator; their absence from it does not declare them harmless. Zero 5xx in the user's export is preserved as evidence from that snapshot, not a hardcoded value. Routes are ranked by window p95 and error count. Recent slow request stage correlation is explicitly process-local and bounded to 50 entries.

Tests cover idle/expired windows, partial startup, category accuracy, missing/NaN Prometheus samples, old replicas lacking category metrics and bounded driver labels. Rollback: restore the prior application; old metric names/labels and old summary fields remain usable.

Instrumentation scope: metrics scrapes/summary routes remain excluded from HTTP response counters and request DB histograms. Their authenticated guards still contribute to global Mongoose operation counters, and their database ping contributes to the separate driver-command metric. Prefer `student_portal_http_db_queries` for DB calls per measured HTTP response rather than dividing unrelated global counter totals.
