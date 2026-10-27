# Performance remediation — 27 October 2026

## Evidence and limits

Source: `prometheus-metrics-2026-10-27-01-51-11.txt`, compared with the supplied remediation playbook and the current working tree.

| Snapshot measurement | Value |
| --- | ---: |
| HTTP requests | 22,034 |
| Completed instrumented MongoDB operations | 55,186 |
| Slow MongoDB operations | 627 (1.14%) |
| Successful complaints list | 73 calls, 1,027.9 ms mean |
| Successful registration eligibility | 652 calls, 281.4 ms mean |
| `users.findOne` | 22,270 calls, 414.1 cumulative query-seconds |
| `complaints.find` | 99 calls, 254.1 ms mean |

These are lifetime counters and means, not interval p95s. No production query plans, credentials, VPS access, or representative local database were supplied. Nothing in this change establishes a measured production speedup or warrants inventing an index. No production deployment, index creation, profiler change, or pool-size increase was performed.

## Implemented changes

### Registration eligibility

Previously the ordinary existing-profile path performed twelve service-level reads:

1. Academic profile, published grades, course credits, student department (four).
2. `StudentsService.findByUserId` loaded the user, student profile and academic profile again, followed by the current term (four).
3. GPA rule, policy course catalogue, term status and existing registration (four).

The no-grades, non-graduation path now performs seven service-level reads: academic profile, student context, grades, current terms, GPA rule, term status and registration existence. The authentication read remains separate and unchanged. This is a code-path/mock regression count, not a live MongoDB measurement.

- Three independent profile reads run concurrently.
- Empty grade sets skip the course-credit query.
- Registration-period resolution checks current/open terms before loading a fallback student context. A fallback reads only academic year and semester; the original legacy repair path remains available when the link is absent.
- Period and GPA rule reads run concurrently; policy, term status and registration-existence reads run concurrently after their inputs are available.
- Course catalogue loading for policy is limited to graduation rules that need it.
- The already-loaded GPA rule is passed into advising creation, avoiding another rule read.
- Registration/advising decisions are not cached. Writes and subsequent submissions continue to re-evaluate their policies. Permission checks, token versions, password hashing, ownership filters, and term windows are unchanged.

The academic profile and period helpers are also used by course registration workflows. Tests cover published grades, closed terms, resolved summer terms, graduation plans, and fallback behavior. Additional legacy-repair and existing-registration cases are included in the regression suite.

### Complaints

The working tree already contained bounded pagination, parallel page/count reads, stable `{createdAt:-1, _id:-1}` ordering, a matching default-list schema index, and a dedicated statistics aggregation. Those changes were preserved. The endpoint still returns its complete ticket payload and exact matching total, because the drawer uses the replies and history.

New timings separate `complaints.page`, `complaints.count`, and `complaints.enrichment`. These distinguish a slow scan/sort/count from user enrichment. The existing status index `{status:1, createdAt:-1}` does not include the `_id` tie-breaker; whether this requires a replacement depends on real plans, selectivity, and write cost. No speculative index was added or removed.

### Batch enrollment

The engine already preloads candidates and uses parallel bulk writes. Its reads now project only the student-link/block state, legacy user-code fields, and registration membership fields actually consumed by the batch. Validation, duplicate handling, credit-hour writes and partial-failure semantics remain unchanged. Existing enrollment race/atomicity concerns require a separate design and were not silently changed by a read optimization.

### Connection state and request telemetry

- Nest's installed Mongoose connection factory runs after awaiting initial connection establishment. The original event-only gauge could miss that event. The gauge is now initialized from the actual connection and re-sampled on every Prometheus scrape. This indicates driver connectivity, not the outcome of a database ping.
- Requests receive generated correlation IDs. Slow-query records and logs include the ID and an optional named service stage. IDs and query values are never Prometheus labels.
- Async-local contexts isolate concurrent requests and concurrent stages. Named stage values are a fixed union in the source.
- `student_portal_http_db_queries` counts completed instrumented operations per response.
- `student_portal_http_db_duration_seconds` records their summed durations. Concurrent operations, including parent/populate timings, can overlap; this is not server execution time or request wall time.
- `student_portal_database_stage_duration_seconds` records elapsed service-stage time, including non-database application work within that stage.
- Slow aggregation diagnostics retain redacted pipeline structure. Student IDs, search values and other scalar values are redacted.

Instrumentation limits: current Mongoose hooks record successful query/aggregate/save completions, not failed operations, pool checkout waits, raw-driver calls, or every bulk operation. Query counts therefore describe the documented instrumentation scope. Work finishing after the HTTP response is excluded from that response's histograms.

## Read-only query-plan comparison

From a repository checkout with dependencies installed, supply `MONGODB_URI` explicitly through your environment or secret manager, then run:

```sh
node scripts/performance-query-plans.mjs > before-plans.json
# Repeat against the same data/settings after the application changes:
node scripts/performance-query-plans.mjs > after-plans.json
node --test scripts/performance-query-plans.test.mjs
```

Use staging/production-sized data first. Optional `PERF_STUDENT_ID` chooses a representative student; otherwise the script samples an existing student ID internally. It does not print that ID. The script never loads a deployment `.env`, creates models/indexes, writes data, enables profiling, or changes connection-pool settings. Index inventory requires index-list permissions. Each query has a five-second server execution bound.

It examines actual default/status-filtered complaint pages and exact counts, current terms, academic/student profiles, published grades, registration existence, and graduation catalogue reads. The sampled current term is diagnostic input, not a complete replay of the registration-period selection algorithm. Adapt cases to the filters that the new stage metrics identify as slow; deep pages, search expressions and staff/department filters also need representative plans before any index recommendation.

Compare `COLLSCAN`, `SORT`, winning index names, `totalDocsExamined`, `totalKeysExamined`, `nReturned`, execution time, and network-inclusive command duration. For count aggregations, `nReturned` counts aggregate result rows rather than matched documents. Zero-result or small-sample plans do not establish efficient selectivity. This is not an HTTP/load benchmark: [MongoDB explains that execution statistics include planning/execution and exclude response network time](https://www.mongodb.com/docs/manual/reference/explain-results/), and [explain bypasses existing plan-cache entries](https://www.mongodb.com/docs/manual/reference/command/explain/).

The production Docker image contains only the deployed API package, not this repository script. Run diagnostics from a dependency-installed checkout with the same database connectivity, rather than assuming the script exists inside that image.

## Post-deployment measurements

Mean completed DB operations per response:

```promql
sum by (method, route) (rate(student_portal_http_db_queries_sum[5m]))
/
sum by (method, route) (rate(student_portal_http_db_queries_count[5m]))
```

Stage p95:

```promql
histogram_quantile(0.95,
  sum by (le, route, stage) (
    rate(student_portal_database_stage_duration_seconds_bucket[5m])
  )
)
```

HTTP p95 for the two priority routes:

```promql
histogram_quantile(0.95,
  sum by (le, route) (
    rate(student_portal_http_request_duration_seconds_bucket{
      route=~"/api/admin/complaints|/api/registration/eligibility",
      status_code="200"
    }[5m])
  )
)
```

Compare at equivalent data, concurrency, term state and request mix. Initial targets from the playbook remain complaints p95 below 500 ms and eligibility p95 below 250 ms; neither is claimed achieved here. Keep an eye on errors, CPU, memory, reconnects and DB pool waits. A count/scan issue in complaints needs the captured plan before a compound-index migration. Small collections may reasonably use a scan.

## Rollout and rollback

Deploy through the existing pipeline after its checks pass. The patch needs no schema/data migration or cache flush. Keep the prior application image for rollback; no database indexes or data need reverting. Run representative registration and complaint flows, inspect fresh metrics and plans, and compare p95/query counts. If latency or functional behavior regresses, restore the prior application image and retain the measurements for investigation.

Remaining work requiring production evidence: actual complaints scan/sort/count diagnosis, pool checkout telemetry, appropriate index migrations if plans justify them, representative load measurements, and deciding whether complaint summary/detail response separation is worthwhile without changing the current drawer contract.

## Verification in this workspace

| Check | Result |
| --- | --- |
| Workspace lint | Passed: zero errors, 247 existing web warnings |
| Workspace typecheck | Passed: all four tasks |
| Complete API unit run | Passed: 43 suites, 243 tests |
| Final eligibility/tracing regressions after follow-up fixes | Passed: 2 suites, 11 tests |
| Query-plan summary and VPS workflow tests | Passed: 4 tests; diagnostic tests are now included in CI |
| API production build | Passed, including the final query-context change |
| Default workspace production build | Stopped after Turbopack remained in compilation |
| Web production build with `next build --webpack` | Passed, including TypeScript and page generation; default bundler configuration is unchanged |
| API Vercel configuration and web root-route manifests | Passed |
| API E2E | Failed: `ECONNREFUSED 127.0.0.1:27017`, followed by startup timeout; local MongoDB/Redis were unavailable |
| Live execution plans and production before/after load comparison | Not run: requires representative database connectivity |

The complete unit run preceded the final lazy-query-context and student-link regression refinements; the affected suites were rerun afterward. No production speedup is claimed from mock tests or build results. The patch introduces no indexes; review the repository's pre-existing uncommitted changes separately before deploying the full working tree.
