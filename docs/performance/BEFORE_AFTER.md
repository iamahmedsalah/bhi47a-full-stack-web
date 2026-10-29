# Before/after evidence — 29 October 2026

## Supplied observations

The four original CSVs were read from Downloads. [BASELINE_EVIDENCE.json](BASELINE_EVIDENCE.json) retains hashes and sanitized aggregates; rerun `node docs/performance/verify-export-baseline.mjs <export-folder>` to verify them.

| Route | Requests | Mean HTTP ms | Maximum HTTP ms |
| --- | ---: | ---: | ---: |
| Batch course enrollment | 4 | 4,827 | 7,345 |
| Admin complaints | 12 | 732 | 2,293 |
| Admin students | 28 | 168 | 576 |
| Admin courses | 32 | 97 | 382 |
| Registration eligibility | 7 | 125 | 235 |

Enrollment traces report 246/756/246/756 calls, but no input sizes. Complaint traces report five calls, page query 518.5–786.6 ms and serialization 195.2–208.8 ms. These are historical observations, not a comparable before/after staging benchmark.

## Isolated MongoDB/HTTP measurements

Measured using `apps/api/test/targeted-performance.e2e-spec.ts` against credential-free localhost MongoDB, real Nest controllers, real Mongoose models/indexes and real role/permission guards. Identity middleware is synthetic and does not exercise JWT overhead; the existing AppModule E2E suite tests authentication separately. One warmup and three measured sequential requests per variant; p95 is the nearest-rank value and therefore the maximum of three samples. Small-sample timings are diagnostic, not a release SLA.

The baseline variant uses the **current** HTTP/write path with snapshot prefetch disabled, reproducing the legacy validator's repeated reads. It is not the historical deployed binary. Both variants use identical 500-student fixtures with published final grades, the same rule set and course metadata; each sample resets only fixture registrations. Comparisons never mix the historical CSV workload with the synthetic workload.

The retained snapshot is [LOCAL_MEASUREMENTS.json](LOCAL_MEASUREMENTS.json). It comes from a five-test passing local run on Node 24.15.0 with the native local MongoDB installation. A workspace build was also running; timings can include machine contention. Exact call-count reductions and persisted outcomes are the stronger evidence. No statistical confidence or production speedup is claimed.

| Students | Logical DB calls, legacy → batched | Calls/student, legacy → batched | HTTP p50 ms, legacy → batched | HTTP p95 ms, legacy → batched |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 155 → 11 | 6.20 → 0.44 | 262.2 → 48.1 | 281.5 → 54.3 |
| 100 | 605 → 11 | 6.05 → 0.11 | 530.3 → 77.1 | 606.5 → 106.3 |
| 500 | 3,015 → 33 | 6.03 → 0.066 | 2,746.5 → 262.6 | 3,050.5 → 309.1 |

Every measured sample had identical persisted course arrays, 3-credit totals and zero validation failures. Retrying reported every row already enrolled and added no credit. Per-row validator reads fell from six to zero with the prepared snapshot. The separate real-write race test gives one 201 and one 409 for two additions competing for the final allowed slot, with exactly five courses/15 credits saved.

Counts include successful Mongoose reads and explicit bulk-write invocations, not individual operations inside a bulk or wire-level driver commands. Both fixture variants use the new instrumentation. The historical CSV counter did not measure bulkWrite through query/save hooks, so its totals are not directly interchangeable with these totals.

| 100-ticket complaints response | Full | Summary |
| --- | ---: | ---: |
| JSON response bytes, before HTTP compression | 7,045,849 | 34,949 |
| HTTP p50 / p95 ms | 94.9 / 113.6 | 11.6 / 23.6 |
| Page-query p95 ms | 28.8 | 3.3 |
| Serialization p95 ms | 17.2 | 1.3 |

The complaint fixture has 20 KB descriptions and 50 KB attachment data URLs, mean BSON size 70,402.9 bytes and maximum 70,404 bytes. Those sizes are deliberately synthetic. The test asserts unchanged totals, stable sort, page-two filtering, authorized full descriptions/attachments and 403 denials for students or staff without read permission.

Local complaint execution uses `createdAt_-1__id_-1`, examines 100 documents/100 keys and has no blocking SORT. Academic/student/session lookups examine one document/key using existing indexes; course credits examine two documents/three keys; published grades examine one document/key. The two-rule GPA range query uses the existing range index and a blocking SORT; this is not evidence to build a production index. Batched enrollment reads that active configuration only once per request.

## Verification status

| Check | Observed result |
| --- | --- |
| CSV verification | Passed: 296 endpoint rows, 9 correlations, 50 slow-query samples, 2 traffic rows |
| Focused performance/telemetry/session units | 43 distinct tests passed across 11 suites over focused runs: 41 initial cases, the production partial-error-envelope case, and the new legacy-code credit case. The finalized enrollment suite was rerun: 11/11 passed |
| Real MongoDB/HTTP performance fixture | Five tests passed in the retained measurement run, including concurrent write protection and complaint authorization |
| Arabic/English complaints browser regression | Passed for both locales: summaries, detail retries, overlapping requests, replies, closing and same-page ticket-link changes |
| Web production build and fresh root manifests | Passed |
| Vercel API NODE_OPTIONS and CommonJS Nest runtime import | Passed |
| Workflow/query-plan/auth-admission/E2E-safety and unified-metrics script tests | 12 passed |
| Attendance location/presentation/table/student-name tests | 26 passed |
| Final workspace typecheck | Passed, 4/4 cached tasks |
| Final E2E fixture typecheck | Passed with a fresh `tsc --noEmit --incremental false -p apps/api/tsconfig.e2e.json` run |
| Focused source lint | Passed for the changed performance source/tests; the fixture also passed its final lint/fix check |
| Workspace lint | Failed: 52 API errors in the recorded full run. The test await/formatting errors from this work were then corrected; upload/schedule errors remain in concurrent edits. Detailed log: `outputs/performance/final-lint.log` |
| Full API units | Last full run: 56/60 suites passed, 399/400 tests passed; one failing performance expectation was corrected and independently verified afterward. Three suites could not load concurrently changing upload imports. The final full unit rerun was declined at the execution-permission step and was not attempted by another mechanism |
| Full API E2E | 2/3 suites passed, 10/24 tests passed. AppModule initialization failed with localhost MongoDB connection timeouts during a resource-heavy build; failed authentication/passkey fixtures are not considered validated |
| Builds | Earlier monorepo attempt failed during concurrent upload/schedule edits. Both web production build and the final direct API `nest build` retry subsequently passed. No fresh successful combined root build is claimed |

The final legacy-code regression preserves exact case-sensitive course-credit queries per student even when the batch shares course data. The retained timing fixture uses canonical uppercase codes; the edge-case correction does not alter its workload or query-count formula. No historical/cached result is presented as a fresh successful full CI run. The current checkout is not release-verified. Fix the remaining global lint errors, rerun the full unit/E2E workflow in a stable environment, and obtain representative staging evidence before release.

During verification another process advanced local HEAD to `082deec` and committed most of the working tree. This task did not initiate a commit or push. The final uncommitted changes are the correctly typed session-plan fixture and the updated measurement/change reports. Final API build, fixture typecheck and performance-source lint passed; include the remaining diff before running CI on the intended release commit. The temporary MongoDB and frontend used for local verification were stopped.

## Representative staging acceptance still required

Use an approved staging copy with actual 25/100/500 row batches, invalid rows, existing enrollments, missing profiles, override and no-override cases. Record exact row outcomes and integrity checks, query counts per student, p50/p95, concurrent imports and duplicate retries. Keep identity, data, indexes, app versions, filters, pool settings and concurrency fixed. Compare complaint page/query/count/enrichment/serialization independently and retain HTTP bytes and BSON-size observations. Capture checkout and command histograms alongside `auth.session`; do not subtract overlapping database durations from HTTP time.

No staging access was provided and no production load test was run. Production p95 and app-wide error-rate improvement remain unclaimed.
