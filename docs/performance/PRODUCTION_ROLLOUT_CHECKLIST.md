# Rollout and rollback

No production deployment, load test, data mutation or database migration was performed. Keep the prior image and current configuration as rollback artifacts. The performance changes are local and reviewable; unrelated pre-existing workspace edits were preserved.

1. Review the focused performance diff separately from existing tuition/course/UI edits. This patch changes no production indexes.
2. Complete lint, typecheck, API tests, builds, Vercel artifact checks, browser checks and isolated E2E validation. See current results below.
3. Deploy to staging. Configure server-only `PROMETHEUS_URL`, optional `PROMETHEUS_JOB` and bearer token; keep scraper credentials private. Confirm all API replicas are scraped and allow at least two scrapes before trusting rates.
4. Test password and Google login, blocked-cookie errors, passkeys, logout, session expiry/revocation on another replica, deactivation, password/token-version invalidation, CSRF, first-login and RBAC. Test both locales and ensure protected pages do not request data before auth completes.
5. Capture complaints exact plans and representative authenticated traces; compare page/count/enrichment/serialization/auth stages with checkout/command metrics. Repeat equivalent benchmarks from the same host, data and identity. Validate exact totals/filter/page behavior and list drawer contents.
6. Request explicit approval only when a concrete production deployment, load test or evidence-backed index build is ready. Index commands and rollback are in `MONGODB_INDEX_PLAN.md`; they are not executed by these scripts.
7. Observe equal 5m/15m windows: successful p95, request volume, category/raw errors, real 5xx, auth reads/request, pool waits and CPU/memory. Retain legitimate 401/403/429 responses. Security-rejection spikes remain investigable even if 5xx is zero.
8. Roll back to the prior application image if authorization, response correctness, pool overhead, CPU/memory or latency regresses. Remove optional Prometheus query configuration if its integration fails. No cache flush, session invalidation or data reversal is required. Drop only an explicitly newly approved index if its separate rollback calls for it.

Validation completed on 28 October 2026 (Africa/Cairo):

| Check | Result |
| --- | --- |
| Workspace lint | Passed, zero errors; 250 web warnings |
| Workspace typecheck | Passed, all four tasks; repeated after the final redirect/control change |
| Full API suite | 53 suites, 371 tests passed; an existing login mock was updated to include the safe projected read |
| Workspace production build | API, shared and web compiled; final frontend rebuild completed after the redirect/control changes |
| Vercel artifacts | API runtime setting and both root-route manifests passed |
| API E2E fixture typecheck | Passed |
| Web attendance/name regressions | 26 tests passed |
| Query-plan, auth admission, E2E target safety and deployment-policy script tests | 10 tests passed |
| Synthetic browser regressions | Arabic/English desktop and mobile, window selection and correct window RPS; admin/student anonymous routes each keep one real 401 and issue no protected feature queries |
| Screenshot review | Arabic desktop and English mobile inspected after transitions settled; no clipping/overflow in the checked layouts |
| Database-backed E2E | Blocked: localhost MongoDB port 27019 unavailable; Docker Linux engine unavailable even outside the sandbox |

Run the repeatable browser check against a built local web server on port 3012 with `node scripts/performance-ui.browser.cjs`. Synthetic screenshots are in ignored `outputs/performance/metrics-{ar,en}-{desktop,mobile}.png`; they validate layout, not production performance. Registry access required escalation for pnpm's pinned-version verification; no package-manager signature bypass was used. Production data was never connected by E2E or browser fixtures.

Remaining limits: no supplied deployed plans or representative load; unresolved cause of one-second session lookups and complaints mean; no complete raw-driver/request trace correlation; completed Mongoose operations do not count pre-command failures; process-local fallback has minute resolution and no replica-wide durability. Existing batch-enrollment atomicity/import questions are documented separately and not conflated with these four priorities.
