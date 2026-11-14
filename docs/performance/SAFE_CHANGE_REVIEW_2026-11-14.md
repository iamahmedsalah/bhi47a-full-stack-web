# Review of the expanded performance report — 14 November 2026

## Verdict

The report identifies worthwhile work, especially full complaint payloads fetched by the main admin dashboard and student profile. It should **not** be implemented wholesale as a behavior-preserving change. Some steps deliberately change API contracts, freshness, security-related timing, attachment storage or result completeness.

This review treats the report as a proposal to assess, not as instructions to execute its phases or its 19-file restriction. It preserves the user's expanded report and the existing implementation. No application code, environment variables, database settings, indexes or deployment changed in this review. The active `.env` was not read.

Evidence inspected: current source, the expanded report, previous implementation notes, and the local exports `unified-database.csv`, `unified-routes (1).csv` and `prometheus-metrics-2026-11-14-18-03-33.txt`. The latter files provide additional evidence beyond the original 18:01 export. Different scrape times must not be merged into a single denominator.

## Findings that affect safety

### High — changing the default/full complaints response breaks an existing contract

Report phase 0.1 changes omitted `view` from full to summary and removes screenshots even for explicit `view=full`. Current `ComplaintsService.findAll` intentionally preserves full responses unless summary is requested. `complaints.service.spec.ts:30` asserts the existing full projection; the summary test at line 159 explicitly tests opt-in projection.

The safe fix is at the consumers that do not need large fields. Adding `view=summary` to those requests keeps full-list and detail contracts available for other callers. Do not remove national-ID enrichment or screenshot fields from existing full responses as part of a performance-only patch.

### High — telemetry supports a payload hypothesis, not the entire claimed causal chain

The database export confirms three full `limit=1` complaint reads at 26,248–26,393 ms and a projected `limit=20` read at 262 ms, with request/stage correlation. Current dashboard source contains a matching full `limit=1` count fetch, plus a full `limit=100` chart fetch. This is strong evidence for fixing those consumers.

However, global failed-command counters do not identify the namespace, initiating page or query parameters of the 18 failed `find` attempts. They cannot establish that all failures were the dashboard's limit-100 query or that base64 transfer caused every authentication stall. Actual BSON/HTTP sizes, command errors and deployed plans are still needed.

Low event-loop utilization and modest RSS in one snapshot do not prove that every slowdown was 100% database I/O. Preserve the new diagnostics and use a matched before/after workload instead of presenting that inference as confirmed root cause.

### High — global timeout changes can alter working operations

Phase 1.3's 45→30 second socket timeout, one-minute idle lifetime and new acquisition/connect deadlines are not demonstrated fixes. A 30-second socket timeout is not guaranteed safe for imports; changing idle connection handling can increase connection churn.

The installed MongoDB driver's source explicitly describes `maxTimeMS` as a **server-side processing** limit and `socketTimeoutMS` as a **socket send/receive** limit. Therefore `.maxTimeMS(10_000)` does not guarantee a ten-second end-to-end request, including acquisition, server selection or transfer.

Keep production connection settings unchanged until new failure categories and deployment-host evidence justify a targeted change. The already implemented client read timeout bounds browser waiting; it does not cancel all database work.

### High — proposed caches do not guarantee immediate multi-worker invalidation

`CacheService.get` reads L1 memory first and backfills it from Redis. `del` clears the current process's L1 and Redis only. Another worker can retain an old L1 value. `wrap` is a get/compute/set helper, not a distributed lock or single-flight cache; an in-flight read can repopulate stale data after invalidation.

Phase 2.1 also needs assignee invalidation on staff creation, activation/deactivation, deletion and role changes—not just complaint mutations. Phase 3.2 needs roster invalidation on registration, enrollment, withdrawal and applicable term/course changes. A correct term-wide cache key prevents one scoping bug but does not establish freshness or race safety.

Treat TTL caching as an explicit freshness change. Add versioning/distributed invalidation or accept and label bounded staleness before enabling it. Do not cache authorization decisions or mutable settings documents.

### High — new hard caps can silently hide valid records

Adding public ticket `.limit(50)`, staff `.limit(200)` or locked-account `.limit(200)` without a compatible pagination/completeness contract can hide older tickets, valid assignees or security cases. Use bounded pagination, incremental loading or an explicit overflow error rather than truncation.

The control-sheet query is already scoped to at most 500 course IDs, a term and enabled components. `CONTROL_ENABLED_COMPONENT_KEYS` currently has **three** components, not five. The schema declares a unique course/term/component index. Prefer the proposed field projection first; any count bound should derive from the actual course count and component constant and verify deployed uniqueness, rather than hardcoding 2,505.

### High — Cloudinary offloading requires an attachment access design

Moving complaint screenshots to externally accessible URLs changes their storage/access behavior. Review authenticated delivery or signed access, allowed image types and size, upload timeouts, orphan cleanup and legacy data-URL compatibility. An eight-second upload also adds a new dependency to complaint submission. Falling back to raw base64 preserves submission but retains the document-bloat problem during an outage.

This is a separate attachment feature, not a transparent performance-only change. Do not copy another feature's delivery policy without checking complaint privacy needs.

### Medium — several other proposals change results or instrumentation meaning

- Authentication parallelism can preserve final fail-closed checks if implemented carefully, but it issues user reads even when session validation fails. It changes concurrency and failure ordering. The best-case wall time becomes approximately the slower lookup, not a guaranteed 50% improvement or elimination of stalls. Keep this for a separately tested change after reducing payloads.
- Heartbeats every 120 seconds instead of 60 change activity freshness. Same-route write coalescing is worth evaluating at the existing cadence, with logout and inactivity tests, before changing the interval.
- Replacing `lastActiveAt > lastLogoutAt` with `lastLogoutAt: null` changes the accepted online-record set. Current login behavior alone does not prove all historical records satisfy that invariant. Audit data and concurrent login/logout behavior first.
- `listSentHistory` computes `readCount` after slicing `readBy` to five, so it cannot report counts above five. That is a confirmed correctness issue. Correct it and test the existing populated response shape, including missing users, before separately optimizing hydration. The report's explicit field allowlist must not silently drop response fields relied on by clients.
- The dashboard's status/rate charts use at most 100 complaint rows. Replacing these with collection-wide stats improves accuracy but deliberately changes displayed results. Treat that as a separate correction, with a dataset exceeding 100 records and an additive `closed` count if needed.
- Adding failed operations to existing `recordDbQuery` totals changes their historical denominator and request-query interpretation. Pre-command failures are already captured separately by the implemented diagnostic hooks. Extend that failure telemetry if necessary; do not silently redefine completed-query metrics or log arbitrary error names.
- The seven health 503s in the newer export are real dependency-ping failures under the configured deadline. They are not established false positives. Concurrent ping coalescing requires a connection-aware implementation and tests; the metrics summary currently uses its own ping, so changing only `HealthController` does not coalesce all callers listed in the report.

## What can be done first with the smallest compatibility risk

| Change | Current source evidence | Required preservation/check |
| --- | --- | --- |
| Add explicit `view=summary` to both dashboard complaint fetches | `apps/web/src/app/[locale]/admin/page.tsx:481` and `:511` omit `view`; displayed dashboard calculations need summary fields | Preserve filters, limits, permissions, totals, timestamps and all current chart inputs. Full payloads and full detail responses remain available elsewhere. |
| Add explicit `view=summary` to student profile complaint fetch | `apps/web/src/features/students/api.ts:173`; `student-detail-dialog.tsx` renders summary fields and links to full ticket details | Preserve ticket links, visible fields and search semantics. Do not remove screenshots from the student-facing complaints list. |
| Add a narrow projection to the control-sheet summary read | `control-sheets.service.ts:103` fetches full sheets but the map consumes `_id`, `courseId`, `component`, `slug`, `locked`, `workflowState` | Preserve `_id`, legacy slug fallback, permissions, scoping, release state and course/component ordering. No caching, arbitrary cap or grade-write changes. |
| Reduce the student-code fallback read to its used field | `ComplaintsService.findByStudent` loads a user to read `studentCode` | First project `studentCode`; optionally reuse the fresh authenticated user's code while keeping the existing fallback and legacy studentId matching. Test response equivalence. |
| Remove only the duplicate user index declaration | `user.schema.ts` declares `{role:1,isActive:1,lastLoginAt:-1}` twice | Remove the duplicate declaration only; do not run `syncIndexes`, drop production indexes or redesign indexes without deployed inventory. |

These changes reduce unnecessary fields/work. They do not promise zero regressions or prove that database command timeouts will disappear.

## Revised implementation order

1. **Small payload patch:** explicit summary requests in the dashboard and student profile. This is the recommended next patch. Keep both dashboard requests initially so request lifecycle, cached values and error behavior remain unchanged; deduplication can follow after equivalence tests.
2. **Projection/read cleanup patch:** control-sheet projection and projected student-code fallback, independently tested. Remove the duplicate index declaration without a database migration.
3. **Dashboard correctness patch:** reuse list totals to remove redundant requests where the loading/error dependencies remain acceptable; use exact status counts separately from the seven-day trend. A trend based on the latest 100 rows is still incomplete when more than 100 complaints occur in that period; proper server-side date aggregation is a separate additive improvement.
4. **Evidence-driven query patch:** deploy diagnostics and the small payload patch, then capture equivalent request stages, bytes, command failures, checkout and actual deployed query plans. Select only the indexes or timeout changes justified by that evidence.
5. **Separate behavior changes:** notification read-count correction, authentication concurrency, heartbeat coalescing, cache consistency and attachment storage. Review and verify each independently.

Do not impose the report's 19-file ceiling on regression tests or typed API contracts. Keep each patch small, but include the tests and shared definitions needed to validate it.

## Acceptance checks for the next patch

- Requests from both dashboard complaint queries and the student profile explicitly include `view=summary`.
- The summary fields used by the dashboard and profile remain present. On the same fixture, totals, statuses, priorities, chart inputs and ticket URLs match before/after.
- Existing omitted-view and `view=full` API contracts stay unchanged; admin detail, student ticket screenshots/replies and public tracking continue working.
- Admin/staff permission checks, current authentication, revocation, CSRF and forced-password rules remain unchanged. Verify both Arabic and English flows.
- Fixtures include screenshot-heavy complaints, no complaints, more than 100 complaints, missing legacy fields, failed requests and a student without complaints.
- Run actual workspace lint, typecheck and builds, the existing complaints API tests and bilingual browser regressions. Add a dashboard/profile request regression. Database E2E still requires local MongoDB/Redis; it was unavailable in the preceding implementation session.
- Compare production before/after with the same identity, host, filters, page size and concurrency. Record payload bytes and timeouts as well as latency. Keep the previous matching API/web images as rollback artifacts.

This turn performed a source/evidence review only. No new runtime benchmark or test suite was run, and no new production result is claimed. Previous implementation validation is recorded separately in `POST_DEPLOY_IMPLEMENTATION_2026-11-14.md`.

## Subsequent implementation: compatible steps 1 and 2

The implementation authorized after this review applies the five read-only cleanups from the table above:

- Both existing dashboard complaint requests explicitly use `view=summary`; their query keys, limits, permission gates, refresh behavior and consumers remain the same.
- The student profile's complaint request explicitly uses `view=summary`, retaining its student-code search and limit.
- The control course summary read projects `_id courseId component slug locked workflowState`. The term/course filters, component order, grade/roster counts and active-release lookup remain the same. No cache or new cap was introduced.
- `findByStudent` projects only `studentCode` from its user lookup. Its ObjectId/string ownership alternatives, legacy student-code matching, pagination and full complaint/attachment response remain the same. Complaint creation still loads the full student document.
- The second duplicate `{role:1,isActive:1,lastLoginAt:-1}` schema declaration was removed. The original declaration remains; no index creation/deletion or `syncIndexes` was run.

Regression coverage includes comparison of projected and full control-sheet results, stable and legacy slugs, lock/workflow/release state, scoped course filters, and student complaint bodies/screenshots/replies even when the user record lacks a legacy code. The existing default/full admin-list contract tests are retained.

`apps/web/tests/summary-readers.browser.mjs` exercises the dashboard and student profile with full and summary fixture payloads, a collection larger than 100 records, empty results, permission gating and full ticket links in Arabic and English. It measures fixture payload bytes, not production latency.

Steps 3–5 remain separate: exact dashboard statistics, caching/freshness, authentication timing, heartbeat cadence, global database timeouts and attachment storage were not changed. Production improvement still needs matched measurements after deployment. Rollback is the previous matching API/web images; no data migration is needed.

Validation for this subsequent patch:

- Full API regression: **99 suites / 962 tests passed**.
- Focused complaints/control compatibility checks: **2 suites / 10 tests passed**.
- API typechecking passed; the web production build's TypeScript checks passed.
- API and web lint checks passed after correcting test formatting/unused fixture bindings; the final changed-file lint checks are clean.
- Workspace production build: **all three package builds passed**.
- Frontend retry-policy/metrics model checks: **6 tests passed**.
- `summary-readers.browser.mjs` passed in Arabic and English: full-vs-summary rendered-text equivalence, collection-wide totals above 100, preserved limits/search, empty states, permission gating and full detail links. Fixture payload bytes were less than one fifth of the full-payload fixture size; this is not a production benchmark.
- Existing bilingual detail retry/race/URL-ticket checks and fetching cancellation/timeout/manual-retry checks passed on the rebuilt web application.
- API runtime configuration, built web root-route artifacts and `git diff --check` passed.
- Database E2E was attempted but stopped at the runner's localhost MongoDB preflight because that service is unavailable. No production connection or application startup was performed by that runner.

Reproduce the new UI regression with `node apps/web/tests/summary-readers.browser.mjs` against a built local web server at `http://127.0.0.1:3012` (or set `PERF_UI_BASE_URL` to another localhost target). The script intercepts API/image responses and uses synthetic users and tickets; it does not require production credentials.

No deployment or live database/index operation was performed. Remaining production latency and timeout improvements must be measured after an approved deployment.
