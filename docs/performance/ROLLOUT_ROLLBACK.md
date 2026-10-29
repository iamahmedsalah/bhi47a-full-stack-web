# Rollout and rollback — targeted performance changes

## Current state

Changes are local and reviewable. No deployment, production index/data operation, secret change, commit or push was performed. The checkout contains concurrent unrelated work; the final CI result must be checked against the exact reviewed tree before release.

## Reproduce local checks

Use Node 24 and the repository's pinned pnpm. Follow the current `.github/workflows/ci-cd.yml` in addition to the CI/CD skill:

```powershell
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test -- --runInBand
pnpm.cmd run build
pnpm.cmd --filter @student-portal/api typecheck:e2e
```

Use the existing isolated test services or a dedicated localhost MongoDB. `apps/api/test/run-e2e.cjs` rejects remote/credential-bearing/non-test database URIs before importing AppModule. Set only the test process's database environment:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27029/student-portal-performance-test'
pnpm.cmd run test:e2e -- --runInBand
# Focused benchmark with uniquely named fixture collections:
node apps/api/test/run-e2e.cjs --runTestsByPath apps/api/test/targeted-performance.e2e-spec.ts
```

The fixture writes and cleans up its own uniquely named localhost collections. It never reads a deployment `.env` for a connection URI. JSON results go to `outputs/performance/targeted-local.json`. Run `node apps/web/tests/complaint-details.browser.mjs` with `PERF_UI_BASE_URL` set to a local built web instance; API responses are synthetic/intercepted. Do not point the fixture at staging or production.

Validate API `vercel.json` `NODE_OPTIONS`, web root-route manifests, workflow policy/query-plan/auth-admission/E2E-safety script tests, and the existing attendance-location tests as configured in CI. Do not treat an old `.next` manifest as evidence of a current successful build.

## Staging rollout

1. Finish concurrent checkout work and pass the full CI workflow on the exact proposed commit. Review the backend, web client and translated messages together. Keep a known-good application image and a sanitized before-baseline.
2. Verify actual indexes with read-only plans. The complaints sort index is already in source; verify its deployed presence rather than creating it blindly. Any production index build requires explicit approval and a separately reviewed plan.
3. Deploy only to an explicitly approved staging target, then run the equivalent workloads described in `BEFORE_AFTER.md`. The existing read-only `scripts/performance-http-benchmark.mjs` can sample complaints. The staging sampler must include `view=summary` when measuring the new admin list; preserve a full-view comparison. Use private environment variables for credentials; never write them to reports.
4. Confirm full-list compatibility, full authorized details, Arabic/English ticket links/replies, staff permission denials, exact counts, prerequisite/GPA/term/block checks, override audit, credit totals, duplicate retries and concurrent-import conflicts.
5. Check p95/error distributions, query calls, payload bytes, serialization, pool checkout and driver-command histograms over equivalent windows. The telemetry records logical Mongoose operations, with `bulkWrite` now explicitly counted once; compare driver command counts separately. The historical counters did not count bulk writes through query/save middleware, so account for that instrumentation difference.
6. Production deployment remains a separate explicit approval after evidence review. No production writes or load tests are part of this task.

## Failure handling and rollback

Stop rollout for regressed p95, unexpected 5xx, unauthorized data exposure, duplicate registrations, incorrect credits, changed academic decisions or inaccurate results. Redeploy the previous reviewed application image, including its matching web client. No database migration or index rollback is required for this patch.

Imports remain nontransactional across profile/registration collections. A 409 carries `partialWrite` counts for acknowledged/rejected/unattempted operations; a 503 additionally identifies uncertain outcomes. Profile synchronization can already have persisted when registration writing fails. Reload authoritative registrations before retrying; successful previous rows are recognized as already enrolled and are not credited twice. Do not delete registrations or reverse audit entries automatically. Reconcile any integrity issue using an approved, separately reviewed correction procedure.

Request-local snapshots do not freeze concurrent edits to grades or GPA policy. If the institution needs those edits to be transactionally coupled with enrollment, define that stronger business contract separately and test it on a transaction-capable staging topology. Legacy-profile repair remains a slower path and should be measured explicitly.
