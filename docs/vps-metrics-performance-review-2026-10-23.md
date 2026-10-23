# VPS metrics and performance review — 23 October 2026

The supplied Prometheus export records 1,236 requests: 998 responses with status
200, 223 with 201, two with 400, and thirteen with 401. No 5xx is recorded.
The previous interceptor did not observe rejections that happened before
controller interception (such as authentication guards and rate limiting), so
this is evidence about recorded requests, not proof that every request succeeded.

## Recorded rejections

| Endpoint | Status | Count | Evidence |
| --- | --- | --- | --- |
| Student password login | 401 | 9 | Auth telemetry separately records nine invalid-credential attempts. |
| Google login | 401 | 4 | Authentication rejected; the export does not contain the underlying reason. |
| Public complaint submission | 400 | 2 | Input/business-rule rejection; the precise cause is not in the export. |

The `invalid_credentials` bucket also includes inactive accounts in the current
login service; it cannot establish that all nine attempts used a wrong password.
Google login has explicit rejections for an unlinked/pending account, inactive
account or rejected Google credential. Public complaint submission can reject
identity mismatches, closed intake, daily limits or blocked accounts, as well as
DTO validation. Those are code paths, not confirmed causes for these six requests.

4xx responses do not prove an application defect, and must not be hidden or
automatically treated as harmless. Inspect the response and reproduction case if
valid inputs fail. New metrics count completed HTTP responses before guards and
rate limiting, separate 4xx from 5xx per route, and show status-code counts. They
do not collect request bodies, passwords, response messages, or query strings.

## Latency findings

- Complaint `find` operations: 13 calls, approximately 404 ms average.
- Admin complaint listing: 10 requests, approximately 546 ms average, maximum
  1,082 ms in the supplied screenshot.
- Most other database operation groups average approximately 10–50 ms.
- User `findOneAndUpdate` histogram sum is 0.734391812 seconds across **36 calls**,
  approximately 20.4 ms per call. This sum is not one 734 ms request. A separate
  734 ms dashboard sample requires that tile's name to identify what was measured.

The complaint schema lacked a standalone `createdAt` index for the unfiltered
list's sort; the existing `(status, createdAt)` index does not cover the same
unfiltered sort. A `createdAt: -1` index is now declared. The actual live indexes
and query plan still need verification. National-ID enrichment now explicitly
projects only `_id` and `nationalId`, rather than retrieving full user records.
Malformed assigned-staff filter IDs now fail validation before ObjectId casting.

Dashboard slow-query capture remains at 100 ms. Previously the log threshold
(1,000 ms in the VPS template) also gated filter/shape capture, producing blank
details for 100–999 ms observations. Details now follow the dashboard threshold,
and filter values are redacted. Raising the threshold is not a performance fix.
Mongoose timings include network, connection-pool waiting and document handling;
they are not the same as server-only `executionTimeMillis`.

## Redis accuracy

The former card hardcoded 10,000 operations and called every production Redis
connection "Upstash". Its counter was process-local cache activity since startup,
not daily, account-wide billing usage. The replacement identifies the configured
cache endpoint (local Docker/loopback, Upstash, external or unknown), shows cache
command attempts since API startup, and explicitly does not claim provider quotas.
Queue activity is excluded. In-memory cache mode reports no active Redis provider.

For the existing single-VPS topology, retain private Docker Redis for cache and
BullMQ. The production template's `REDIS_URL` targets `redis:6379`; `REDIS_URL`
takes precedence over `UPSTASH_REDIS_URL`. Confirm the running container's value
using the probe, rather than inferring it from a label. No Redis migration or
Atlas data reset is part of these changes. Managed Redis can be evaluated if
separate-host availability or multiple application hosts become requirements.

## Safe production verification

After deploying the reviewed changes, run from `~/app`:

```bash
docker exec -i app-api-1 node < scripts/vps-performance-probe.cjs
```

This opens a separate connection, measures five pings, explains the actual
unfiltered complaint-list query, measures the first page's BSON size, and lists
index keys. Queries have a five-second server execution limit; no documents,
URIs or credentials are printed. It does not create indexes or change documents.

If the plan has a blocking `SORT` or excessive document scans, verify the declared
index was created. Do not run `syncIndexes`, drop indexes, or reset data. If server
execution is fast but payload size is large, inspect the list/detail contract
before removing fields. If repeated warmed pings remain high, compare the VPS and
Atlas regions before proposing a region migration. Record before/after warm
latency on the same request shape; the current export alone cannot establish a
post-fix improvement or a 734 ms upper bound.

## Local validation

- Workspace lint: passed with zero errors; 248 existing web warnings remain.
- Workspace typecheck and production build: passed.
- API tests: 39 suites, 208 tests passed, including HTTP response-finish integration
  coverage for guard, router and rate-limit rejections.
- API Vercel runtime and web root-route artifact checks: passed.
- Diagnostic script syntax and Git whitespace checks: passed.
- Full application E2E suite was not run: local MongoDB (27017) and Redis (6379)
  are unavailable. Production Atlas was not substituted for test infrastructure.

Changes are local; no commit, push, deployment, live index verification or
before/after production performance measurement was performed in this review.
