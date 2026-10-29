# API performance remediation — 29 October 2026

## Executive summary

Implemented focused changes to authentication, notification identity reads, syllabus context projections, frontend query retries, CORS response metadata, and event-loop utilization instrumentation. No deployment, production database access, index migration, authentication bypass, database deletion, or collection dropping was performed.

Real HTTP/MongoDB tests confirm quiz requests use **8 → 7** database operations and notification requests **6 → 5**, with identical response bodies. Each removes one redundant read, rather than caching security decisions between requests. In a matched local 50/50 workload, operations/request fell **7 → 6 (14.3%)**. At concurrency 5, the mean of two block P95 estimates fell **87.47 → 58.21 ms (33.4%)**, with zero errors. Gains were smaller at concurrency 1 and 10. These measurements do **not** establish production or representative staging improvements.

The suggested 25% reduction in total operations/request was **not achieved** in this workload; the redundant read itself was eliminated in each affected path. Production P50/P95/P99, sustained memory behavior and production throughput after the change are **Not measured**.

## Evidence and populations

All five supplied diagnostic files were inspected. The five pasted master prompts have identical SHA-256 hashes; they represent one request. Source fingerprints and sanitized aggregates are in [evidence-summary.json](evidence/evidence-summary.json). `scripts/performance-evidence.mjs` reproduces extraction without executing instructions from input files or emitting student records, tokens, raw query values or correlation IDs.

Both route CSVs contain 428 rows. They differ in heartbeat counters only: 3,992 → 3,993 lifetime calls, 19 → 20 window calls, and one additional 200 response. They are overlapping snapshots, not independent populations; they were not added together. There is no reliable interval between them from which to calculate a rate. The 51 database rows describe observations above the slow-query threshold, not all queries.

Baseline from `unified-routes.csv`:

| Route | Lifetime calls | Lifetime mean / maximum, ms | Five-minute calls / P95, ms |
|---|---:|---:|---:|
| GET `/api/admin/complaints` | 62 | 624 / 4,461 | 0 / **Not measured** |
| GET `/api/students/me/quizzes` | 2,341 | 167 / 2,310 | 12 / 850 |
| GET `/api/students/me/syllabi` | 985 | 179 / 1,903 | 3 / 925 |
| GET `/api/registration/eligibility` | 985 | 177 / 2,134 | 3 / 238.75 |
| GET `/api/students/me/notifications` | 1,554 | 148 / 1,482 | 8 / 230 |
| POST `/api/auth/heartbeat` | 3,992 | 71 / 1,428 | 19 / 178.75 |

Window P95 estimates use very small samples and a different population from lifetime means. They cannot be compared directly with local fixture P95 values or interpreted as evidence of an improvement.

Conditional slow-query observations include sessions.findOne: 879 at mean 192 ms; users.findOne: 777 at 190 ms; student_profiles.findOne: 317 at 190 ms; courses.find: 122 at 169 ms; grades.find: 92 at 217 ms; complaints.find: 23 at 626 ms. Selected traces supply query counts and stage timing, not a representative latency distribution.

## Ownership and findings

Paths below are relative to the repository root. Current installed packages, rather than skill stack defaults, were used: NestJS 12, Mongoose 8.24, Next.js 16.4, React 19, TanStack Query 5. Local Node was 24.15.0 and MongoDB 7.0.45; the supplied runtime audit used a different Node 24 patch release.

| Route / component | Exact ownership | Finding and action |
|---|---|---|
| JWT authentication | `apps/api/src/modules/auth/auth.module.ts` global guard; `auth/guards/jwt-auth.guard.ts: authenticateRequest`; `auth/strategies/jwt.strategy.ts: validate` | Global and controller guards authenticate the same request. Quiz trace contains two session reads; account reads already share an AsyncLocalStorage promise. Reuse successful Passport validation on the exact request only. |
| Quiz list | `apps/api/src/modules/quizzes/quizzes.controller.ts: getMyQuizzes`; `quizzes.service.ts: getStudentQuizzes` | The controller adds JWT/role/permission guards. Registration codes, active courses, published quiz projections, submissions and attempts are already batched. Preserve these reads and score/answer redaction. |
| Notifications | `apps/api/src/modules/notifications/notifications.controller.ts: getMyNotifications`; `notifications.service.ts: getStudentFeed, buildStudentNotificationFilter` | The filter loaded the authenticated user again, hydrated and without a projection. Peek at the matching auth-owned request read; fallback is lean `_id` only. Level, private targeting, hidden/read filtering and exact counts stay intact. |
| Syllabi | `apps/api/src/modules/courses/courses.controller.ts` student syllabi route; `courses.service.ts: getStudentSyllabi` | Project four academic context fields and registration courses. The registered-course and curriculum queries have different predicates and are already parallel. Do not merge them using an approximation of curriculum policy. |
| Eligibility | `apps/api/src/modules/registrations/registrations.controller.ts`; `registrations.service.ts: getEligibility, getAcademicProfile, resolveRegistrationPeriod` | Independent reads already run in parallel. Term resolution, summer policy, existing registrations and advising checks are semantically distinct. No stale eligibility cache or policy change introduced. |
| Complaints | `apps/api/src/modules/complaints/complaints.controller.ts`; `complaints.service.ts: findAll` | Existing lean paging, exact count, stable sort, batched enrichment and optional summary projection were preserved. Web already requests summary and fetches details separately. Do not attribute earlier changes in this directory to this remediation. |
| Heartbeat | `apps/api/src/modules/auth/auth.controller.ts`; `apps/api/src/modules/users/users.service.ts: recordUserActivity`; `apps/web/src/providers/auth-provider.tsx` | Frontend skips hidden tabs, throttles route changes to 30 seconds, and sends periodic updates every 60 seconds. Server already reuses auth-user context and conditionally refuses to reactivate logged-out users. No cross-request write/auth cache added. |
| Frontend requests | `apps/web/src/lib/query-client.tsx`, `query-retry-policy.ts`, `api.ts` | Default query retry repeated permanent 4xx failures once. Axios discarded HTTP status/header metadata when unwrapping the error. Keep payload fields plus status and parsed Retry-After; retry transient failures at most once, honor a deadline up to five minutes, and do not retry 429 without a usable deadline. Mutations remain retry-disabled. |
| Browser backoff | `apps/api/src/config/cors-origins.ts`, `apps/api/src/main.ts` | Retry-After was sent by the rate limiter but not exposed to the separate browser origin. Expose Retry-After and X-Correlation-Id; preserve allowed origins, credentials and rate-limit rules. |
| Runtime telemetry | `apps/api/src/core/metrics/metrics.service.ts` constructor | Add a label-free interval event-loop utilization gauge collected on scrape. Existing delay, GC, heap, request, pool and query metrics remain. |

### Confirmed and unconfirmed causes

**Confirmed:** duplicate guard/session validation; the additional notification identity read; unnecessary syllabus context fields; unconditional default query retries; missing browser access to Retry-After.

**Complaints:** one trace attributes about 3,024.5 ms to the page query, 76.3 ms to enrichment and 266.5 ms to serialization. Another has a 772.2 ms page stage and 332.3 ms serialization. This supports investigating payload and query plans, but is not proof that enrichment or a missing index caused every 4.46-second request. The database CSV has no complaint query samples containing the production predicate. Deployed index availability, filter selectivity, response size, network time and concurrent import load are **Not measured**. The existing summary path is appropriate; changing default list fields or cursor semantics would break compatibility without sufficient evidence.

**429s:** nonce generation has 718/1,166 lifetime 429s; student login 486/994. Auth/me has 975/2,244 lifetime 401s. These are counts, not rates. `/auth/me` already disables retries; notification components already share a query key with 60-second stale time and 120-second foreground polling; logout clears user queries. Google nonce preparation already coalesces in-flight work in one browser window and reuses its five-minute flow. Repeated mounts after a failed preparation, multiple tabs, invalid credentials, abuse and trusted-proxy configuration remain hypotheses. The new default query policy does not claim to fix all nonce/login 429s: those are POST operations. Rate-limit thresholds and keys were not relaxed. Validate edge forwarding against `TRUST_PROXY_CIDRS`; never trust arbitrary caller forwarding headers.

## Database and index review

The local benchmark seeds unique synthetic collections using the existing schemas and their indexes. It does not remove indexes or data. The existing session expiry TTL and unique registration/user constraints are preserved.

| Local query plan | Winning path | Keys examined | Documents examined | Returned |
|---|---|---:|---:|---:|
| Active session by digest | `_id_` IXSCAN/FETCH | 1 | 1 | 1 |
| Account by ID | IDHACK | 1 | 1 | 1 |
| Student context by userId | `userId_1` IXSCAN | 1 | 1 | 1 |
| Complaints default first page | `createdAt_-1__id_-1`, no SORT | 20 | 20 | 20 |
| Complaints open first page | same existing sort index, no SORT | 40 | 40 | 20 |
| Complaints offset 1,000 | same index with SKIP | 1,020 | 20 | 20 |

Plans are in [local-benchmark.json](evidence/local-benchmark.json). They do not establish production selectivity. Deep offset increases scanned keys even with an index; changing to cursor pagination was deferred to preserve page-number/count semantics. No new production index is proposed or applied from this evidence. A status/sort compound index would require a production-shaped selective predicate, measured improvement over the existing indexes, and storage/write analysis first. No index rollback is required for this change.

Actual JSON sizes of synthetic context documents fell from 32,195 to 111 bytes for the student profile and 16,242 to 72 bytes for registration. These fixtures deliberately contain large unused context. This demonstrates projection behavior; production wire-byte savings and syllabus latency gains are **Not measured**. Course response fields and PDF handling were not narrowed.

Query-plan interpretation uses examined keys/documents, winning plans and returned rows as documented in [MongoDB explain results](https://www.mongodb.com/docs/v8.0/reference/explain-results/). The existing read-only `scripts/performance-query-plans.mjs` supports further staging verification with an explicitly supplied URI; it never loads a production environment file automatically. Do not run writes or index synchronization during that diagnostic.

## Authentication, integrity and concurrency

The module-private WeakMap is keyed by the exact HTTP request. Entries bind the original cookie value, principal reference and validation promise. A changed cookie or replaced principal forces validation again; preexisting `request.user` alone is never trusted. Failures are evicted. New HTTP requests always check current database session revocation/expiry and account policy. Global/controller instances can share the same validated request without sharing authorization results between users or requests. Role and permission guards continue to execute.

Notification fallback reads do not seed the authentication cache with an incomplete `_id` record. Missing or rejected auth reads fail closed. No Redis policy cache or token-only process cache was introduced.

HTTP regression tests cover signed tokens, expiry, invalid tokens, session revocation between requests, active-account changes, lockout, tokenVersion changes, role rejection, private/level/hidden notifications, unpublished quizzes and hidden scores/answers. Unit tests also cover concurrent guard calls, replaced principals/cookies, optional/public authentication and storage errors. Existing academic, heartbeat/logout and session idempotency tests pass in the API unit suite. No academic business writes were changed.

No deadlock is established by the supplied data. Pool gauges are zero at the snapshot; cumulative checkout duration/count yields roughly **1.30 ms mean checkout** across 115,341 successes. Tail waits and lock ownership require time-series/driver evidence. Local concurrency tests finish without errors. Their five-connection pool has up to 12 pending checkouts during the run; at concurrency 10 P95 checkout is about 8.3 ms, while the shared client/server process approaches full event-loop utilization. This is local saturation evidence, not a production deadlock diagnosis.

## Runtime, memory, Redis and BullMQ

The supplied snapshot has event-loop P50 10.35 ms, P99 23.30 ms, maximum 428.87 ms; live V8 heap 117.3 MiB, allocated heap 131.5 MiB and RSS 237.7 MiB. The separate process heap-size metric is not live V8 heap. Major GC: 306 events / 12.00 lifetime seconds; minor GC: 15,520 / 43.95 seconds. Without consecutive scrapes these cannot establish GC rates, leaks or sustained blocking.

The new `student_portal_nodejs_eventloop_utilization_ratio` uses successive `performance.eventLoopUtilization` samples on scrape, following [Node perf_hooks](https://github.com/nodejs/node/blob/main/doc/api/perf_hooks.md). It has no student/route/token labels and adds no polling timer. Existing runtime metrics retain their meaning.

Local CPU profiling was recorded with the Node inspector. A sanitized [profile summary](evidence/cpu-profile-summary.json) records approximately 28.1% idle samples, 16.2% in connect, and 0.69% in GC; the raw local profile is retained under `outputs/api-performance-review/local-benchmark.cpuprofile`. The profile includes Supertest, Jest and the API in one process. It does not identify a production CPU-bound function or justify worker threads. Synchronous file reads found in startup/seed code do not explain request latency. Bulk grade promotion still has a potentially large Promise.all of saves; no matching import trace or contention evidence establishes it as this incident's cause, so academic write behavior was not changed.

Across local blocks heap/RSS rise with retained test observations, test tooling, instrumentation and profiling. There is no controlled retained-object comparison after full GC; allocation rate, retained-object growth and production leak status are **Not measured**. No heap limit was increased. Spreadsheet/import profiles, external/ArrayBuffer trends, old-space growth and production GC pause distributions need a separate representative capture.

`apps/api/src/core/queues/queue.service.ts` already bounds workers to concurrency 5, defaults to three attempts with exponential 5-second backoff, retains 1,000 completed / 500 failed jobs and closes registered workers/queues on shutdown. Inline fallback and Redis probes were inspected. No cache, worker, retry or retention changes were introduced. Queue depth, stalled-job duration, Redis latency and queue processing under production load are **Not measured**; monitor them before changing topology. A completed-job retention cap does not bound waiting jobs. Lost enqueue acknowledgements and retries of external side effects still require job-specific idempotency review, not blanket retries.

## Controlled before/after measurements

Harness: `apps/api/test/performance-remediation.e2e-spec.ts`. Same local MongoDB 7.0.45, Node 24.15.0, five-connection pool, schemas/indexes, synthetic dataset, authenticated sessions and response bodies. Twelve student sessions; 50% quiz lists / 50% notification feeds; twenty warmup requests per mode; 240 measured requests per block; two rounds with reversed before/after order at each concurrency. Total **2,880 measured requests**, zero errors. Only the old duplicate guard call and notification identity read are switched in test code. There is no product baseline switch.

The table shows the arithmetic mean of **two block percentile estimates**, not percentiles pooled across blocks. Each block's complete runtime/CPU/memory/GC measurements is retained in [local-benchmark.json](evidence/local-benchmark.json).

| Concurrency | Mode | P50 ms | P95 ms | P99 ms | Requests/s | DB operations/request | Summed DB ms/request |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Before | 17.31 | 24.75 | 67.42 | 52.30 | 7 | 15.29 |
| 1 | After | 14.92 | 22.08 | 55.75 | 60.18 | 6 | 13.72 |
| 5 | Before | 51.50 | 87.47 | 226.92 | 92.27 | 7 | 46.46 |
| 5 | After | 40.46 | 58.21 | 84.23 | 119.14 | 6 | 31.78 |
| 10 | Before | 92.02 | 121.11 | 133.67 | 108.91 | 7 | 82.04 |
| 10 | After | 85.61 | 110.34 | 120.15 | 118.66 | 6 | 74.81 |

P95 reductions: 10.8%, 33.4%, 8.9% respectively. RPS gains: 15.1%, 29.1%, 9.0%. Do not extrapolate these percentages to production. Summed DB durations include overlapping operations and are not HTTP wall time. The first contract-check requests are cold; their timings are excluded from this comparison.

| Concurrency | Before → after event-loop P99 ms | Before → after ELU | Before → after one-core CPU ratio | Before → after pool checkout P95 ms |
|---:|---:|---:|---:|---:|
| 1 | 13.49 → 12.37 | 0.570 → 0.570 | 0.639 → 0.623 | 0.021 → 0.020 |
| 5 | 17.52 → 15.83 | 0.915 → 0.980 | 0.944 → 1.044 | 0.806 → 0.767 |
| 10 | 19.00 → 18.64 | 0.994 → 0.999 | 1.056 → 1.056 | 8.291 → 8.375 |

CPU ratios include client/server, can exceed one because of native work, and cover blocks of different duration. They are not server CPU/request. Per-block GC counts range 3–6, maximum observed pause 8.10 ms. Retained harness observations prevent interpreting net heap change as allocation rate. Latency variation and the common load-generator process limit confidence; a separate-process staging test with a realistic route mix, dataset and sustained duration is still required.

## Change review table

| Priority | File/function | Root cause | Fix | Before | After | Test result |
|---|---|---|---|---|---|---|
| P1 | JWT guard / authenticateRequest | Global plus local validation | Exact-request validation reuse | 2 session reads in quiz request | 1; total 8 → 7 | Real JWT/MongoDB + concurrency + revocation pass |
| P1 | Notifications / buildStudentNotificationFilter | Authenticated user fetched again | Auth-owned matching request read; narrow lean fallback | 2 user reads; total 6 | 1 user read; total 5 | Contract, student isolation, cache ownership pass |
| P2 | Courses / getStudentSyllabi | Broad context reads | Explicit academic/courses projections | Full context | Required fields only | Syllabus contract/academic unit tests pass; production gain **Not measured** |
| P1 | Web query client + API errors | Retry permanent 4xx; lose header/status | Status-aware bounded retry and Retry-After deadline | Permanent query failure runs twice | Once; transient at most twice | Actual TanStack Query execution tests pass |
| P1 | Main CORS configuration | Browser cannot read Retry-After | Expose response metadata | Header inaccessible cross-origin | Header listed as exposed | Credentialed CORS HTTP test pass |
| P2 | Metrics constructor | No ELU gauge | Scrape-time interval utilization | Missing | Label-free gauge | Bounded values/labels unit test pass |
| Investigated | Complaints, eligibility, heartbeat | Historical latency; several prior optimizations | Preserve current contracts/security | Supplied baseline | New production timing **Not measured** | Existing unit regressions pass; complaint local plans verified |

## Verification and reproduction

| Check | Result |
|---|---|
| Workspace lint | Passed; zero errors, 281 existing web warnings |
| Workspace TypeScript | Passed; all four tasks |
| API E2E TypeScript | Passed, including the new benchmark harness |
| API unit suite | Passed; 65 suites / 507 tests |
| Final guard/notification/CORS regression rerun | Passed; three suites / nine tests |
| Frontend retry execution and CSV parsing | Passed; four tests |
| Real JWT/MongoDB HTTP integration and concurrency | Passed; four tests, 2,880 measured requests, zero errors |
| API production build and runtime artifact | Passed |
| Web production build and root route manifests | Pending final build completion |
| Production/staging load validation | **Not measured** |

Logs and the raw local CPU profile are under `outputs/api-performance-review/`. The web build uses Next's supported `--webpack` option. E2E scope deliberately excludes older suites that delete fixtures, because this task prohibits database deletion. No existing destructive cleanup test was executed.

```powershell
# Read-only extraction; source files stay outside the repository.
node scripts/performance-evidence.mjs 'C:/Users/Kimo Store/Downloads' outputs/api-performance-review/evidence-summary.json
node --test scripts/performance-evidence.test.mjs apps/web/tests/query-retry-policy.test.mjs
pnpm.cmd run test:services
# Requires a credential-free localhost test DB; runner rejects remote/prod URIs.
# From apps/api:
node test/run-e2e.cjs --runTestsByPath test/performance-remediation.e2e-spec.ts
```

The fixture creates unique collection names, inserts synthetic records, exercises account/session updates and closes connections. It does not delete rows, drop collections or remove indexes during teardown. Stop the test containers with `docker compose -p student-portal-e2e -f docker-compose.test.yml stop` to retain their data; do not use a cleanup/drop script. Repeated runs retain separate fixtures intentionally.

After testing, that non-destructive stop command could not connect to the Docker Desktop engine, including outside the sandbox. The engine was unavailable at cleanup time; container state could not be verified. No container removal or database cleanup was attempted.

## Deployment, rollback and remaining monitoring

1. Review the implementation and run a separate-process staging load test with matching baseline/release resources, warmups, steady-state duration, filters, payload sizes, concurrency and successful/rejected request mix. Production-shaped complaint predicates, current index metadata and explain statistics remain missing. Keep all student data access authorized and sanitized.
2. Release backend first through the existing manual deployment process, including CORS header exposure. Then release the web retry policy. Canary one replica or a small traffic share while keeping old metric buckets/labels. No migration or cache invalidation is required; do not run schema index synchronization or delete old indexes as part of rollout.
3. Compare successful-only P50/P95/P99 and error/status counts by stable route with the same traffic window and replica selectors. Measure query count/request, session read counts, summed DB time, pool checkout tails/waiters, ELU, event-loop P99, process CPU, RSS, external/ArrayBuffers, post-GC heap floor and GC duration/rate. Use Prometheus `rate`/`increase` over repeated scrapes; do not divide lifetime snapshots into invented incident rates. Retain 401/403/429 and 5xx separately.
4. For 429 diagnosis, correlate the existing rate-limit rule names and outcomes with browser request initiators, mounted tabs, nonce preparation, trusted proxy configuration and login failures. Never put student identifiers, IPs, tokens or arbitrary URLs into Prometheus labels. Redis operation latency, queue waiting/active counts, oldest job age and stalled/failed work need dedicated measurement before queue changes.
5. Stop rollout for any authorization/student-isolation regression, unexpected quiz/eligibility decision, increased 5xx, sustained pool waits, or a repeatable P95 regression above 10% under matched traffic. Investigate sustained event-loop P99 above 50 ms and growing post-GC heap rather than changing heap limits. Require enough samples to avoid acting on an idle route's estimated percentile.
6. Roll back by redeploying the reviewed pre-change backend/web artifacts through the normal deployment process. If necessary roll back web first. The previous guard simply does its duplicate validation again; no persisted policy state is cached by this change. Keep diagnostic metrics/history and all unique/TTL indexes. There is no destructive database rollback and no automatic production deployment.

Production success remains conditional on that staged/canary comparison. The local evidence establishes reduced read work and measured latency improvements under the stated fixtures, with security checks preserved.
