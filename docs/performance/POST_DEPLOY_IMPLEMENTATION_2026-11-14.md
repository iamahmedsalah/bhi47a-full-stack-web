# Database stall diagnostics and complaints fetching — 14 November 2026

## Delivered behavior

The existing admin metrics page now displays process-local MongoDB checkout statistics, active connections/waiters, pool clears, command attempt/failure counts and the latest 50 failure events. It remains protected by the existing administrator authorization. New fields are optional for older APIs.

Driver command failures capture a bounded category, recognized error class, safe error code and duration. The request ID and service stage are captured at command start and matched at completion; background or uncorrelated work has no invented request identity. Correlation storage is bounded to 1,000 commands and entries older than five minutes are pruned on subsequent command starts.

This installed driver's checkout-failure event exposes a bounded reason rather than the original exception. That reason is retained separately; a timeout reason is categorized as a checkout timeout without inventing an exception class or code.

Query/aggregation error middleware also captures failures before a command starts, including server selection and connection acquisition. It forwards the original error unchanged. An operation event and a command event can describe the same underlying failure; failure-event counts are not unique incident counts or HTTP errors.

No raw error messages, stacks, command documents, student data, credentials, server addresses or query values are included in these new diagnostics. Only known error-class names, allowlisted network codes or bounded numeric codes are retained. Diagnostic warning emission is limited to 10 events per minute per process, shared across driver and operation failures; counters and the ring continue updating after that limit.

New Prometheus counters:

- `student_portal_mongodb_driver_failures_total{kind,command,category}` — bounded dimensions, including pre-command operation failures; no request ID labels.
- `student_portal_mongodb_pool_clears_total`.

Existing driver and Mongoose operation metrics retain their distinct meanings.

## Latency interpretation and rollout

HTTP latency histograms now include 15, 30, 45, 60 and 120 second boundaries in addition to the existing boundaries. Window summaries and route rows include requests over ten seconds, the upper finite boundary, and overflow counts. A percentile falling beyond 120 seconds is unavailable rather than presented as exactly 120 seconds. Finite percentiles remain interpolated estimates.

The Prometheus query compares sample coverage for the 120-second and infinity buckets over the selected window. When old/new bucket coverage differs during rollout, the application uses explicitly labeled process history rather than aggregating incompatible schemas. Longer selected windows can retain this fallback until older samples leave the window. Existing Prometheus credentials and scrape permissions are unchanged. No Prometheus service or synthetic production runner is installed by this patch.

## Complaints reads

Admin list, details, statistics, settings and assignee reads now have a 10-second Axios timeout and accept cancellation signals. List/detail and auxiliary queries pass their TanStack signals to the API client. The settings routing panel uses the same updated read functions.

Timeouts and cancellations are not automatically retried by the shared query policy. Transient failures still have at most one retry and the existing Retry-After behavior is retained. Mutations are unchanged.

While a different list key loads, previous rows remain visible with a translated updating message. Their card is inert to prevent actions on rows belonging to the previous filter/page. Page correction does not use placeholder totals. A completed failure exposes a retry action and a translated timeout message where appropriate; refresh failures with cached data mark the results as possibly stale. Initial list failures no longer look like empty search results. Statistics failures are independent from list rendering.

Browser cancellation stops waiting for the response; it does not guarantee cancellation of MongoDB work already executing on the server. The 10-second timeout bounds the user wait; it does not repair the database stall.

## Deployment and diagnosis

Deploy matching reviewed API and web images through the existing release workflow. There are no database migrations, index builds, pool-size changes, credential changes or production writes in this patch. Keep the prior matching images for rollback.

After deployment:

1. Open `/ar/admin/metrics` or `/en/admin/metrics` and check the new MongoDB diagnostics panel.
2. Reproduce one slow complaints read and record the failure timestamp, category, safe code, stage and request ID. Compare with the request's `x-correlation-id` response header where available; the browser may time out before receiving headers.
3. Inspect API logs for the fixed messages `MongoDB driver failure` and `MongoDB operation failure`; compare with Atlas events and VPS network/resource metrics at the same UTC time. Samples shown in the UI use Africa/Cairo dates.
4. Distinguish socket timeouts, execution timeouts, server selection, DNS/network errors, checkout failures and pool clears before selecting an infrastructure/query fix.
5. Measure actual deployed query plans and indexes if command execution is the bottleneck. Do not infer a missing index from a timeout alone.

The failure buffer resets on restart and is specific to the serving API process. Existing Prometheus collection supplies persistent aggregate counters when configured; it does not persist the full failure-event buffer. The underlying production stall remains unconfirmed until new evidence is collected.

## Verification

Completed checks:

- API and web lint passed, with no errors or warnings. Shared build/typechecking passed through the workspace tasks.
- Full API unit regression passed: **98 suites / 959 tests**. A focused driver suite was also rerun after the final checkout-reason correction: **3 tests passed**.
- API typechecking and Next.js production typechecking passed.
- Workspace production build passed; API build was repeated successfully after the final middleware typing correction.
- Four focused API suites / 16 tests passed, including real Mongoose query/aggregate middleware with simulated pre-command failures.
- Six frontend policy/model tests passed.
- Arabic and English complaints detail browser checks passed: summary/detail separation, failed detail retry, overlapping requests, drawer contents and URL-selected tickets.
- Arabic and English complaints fetching browser checks passed: retained rows, inert placeholder actions, cancellation on filter change, 10-second timeout without automatic retry and successful manual retry.
- Metrics browser checks passed: delayed session gate, a single authentication probe, selected-window updates, new diagnostics/failure samples, histogram overflow, desktop/mobile layouts, and anonymous redirects without protected requests. The Arabic mobile diagnostics screenshot was visually inspected. Fixtures use intercepted local responses and measure behavior, not production speed.
- API Vercel runtime and built web root-route artifact checks passed. `git diff --check` passed.

Reproducible browser/policy commands (start the built local web on port 3012 first):

```powershell
node --test apps/web/tests/query-retry-policy.test.mjs apps/web/tests/unified-metrics.test.mjs
node apps/web/tests/complaint-details.browser.mjs
node apps/web/tests/complaint-fetching.browser.mjs
node scripts/performance-ui.browser.cjs
```

Database E2E was attempted and stopped at the runner's localhost MongoDB preflight. Docker Desktop's engine was unavailable both inside and outside the sandbox. No application or production connection was started by that runner. With Docker running, provision `pnpm test:services` and run `pnpm test:e2e`. E2E fixtures require credential-free localhost MongoDB/Redis and must never use production.

No production benchmark or deployment was performed. The production slowdown has not been claimed fixed by local synthetic tests.
