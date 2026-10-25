# VPS query optimization plan

## Confirmed starting point

The post-deployment screenshot identifies local VPS Redis as connected, with seven
API cache-command attempts since process startup. Cache connectivity is enabled;
this does not establish that BullMQ workers or Redis-backed rate limiting are
enabled. Those have separate settings and need a runtime check if required.

The complaints endpoint shows three requests, average 793 ms and maximum 1,668 ms,
with zero recorded 4xx/5xx responses. This is a small initial sample, not enough to
establish a stable percentile or conclude that pagination helped or regressed.
The admin login row has one 401 and zero 5xx; its exact rejection reason is not
contained in the screenshot. Login latency also includes password verification.

Already deployed: bounded page queries, 20-ticket default, deterministic sorting,
declared createdAt/_id sort index, limited student-enrichment projection, and a
server-side complaints summary instead of client-side counts from ticket records.
The live index's existence and actual query plan still require confirmation.

## 1. Establish a reproducible baseline

Run the existing read-only probe in the VPS terminal from the deployed checkout:

```bash
cd ~/app && docker exec -i app-api-1 node < scripts/vps-performance-probe.cjs
```

It reports five separate-connection Atlas ping times, the winning plan for the
unfiltered first 20-ticket page, server execution time, examined keys/documents,
returned count, total BSON bytes of those records and live index keys. It prints
no credentials or ticket records and does not create indexes or modify documents.
BSON size is not compressed HTTP response size. Separate-connection pings do not
measure the application's existing connection pool; compare them with app metrics.

After the first 90 seconds of uptime, collect normal warmed requests for each
representative page/filter. Record release SHA, uptime, page size, server query
shape, response bytes and request latency. Aim for at least 30 normal observations
per important route before interpreting trends; gather more for useful p95/p99.
Keep cold-start results separately. Do not stress-test the production database.

## 2. Diagnose complaints before adding another cache

Compare MongoDB execution time, warmed ping and end-to-end request time:

| Finding | Next action |
| --- | --- |
| Blocking sort or excessive documents examined | Confirm the deployed sort index exists and is selected; inspect the specific filter and explain plan. |
| Fast server execution, large first-page BSON/HTTP size | Build a projected list response and fetch full ticket details only on opening the drawer. |
| Fast server execution, consistently slow warmed pings | Compare Atlas/VPS regions and network route; inspect Atlas shared-tier resource metrics. |
| Low ping/query time but slow endpoint | Time count, enrichment, serialization and event-loop/pool waiting separately. |

The list currently still returns full ticket records, including screenshot data,
reply arrays, internal notes and status history. Whether these account for the
latency must be measured. If they do, add a protected detail endpoint, retain the
existing drawer/reply/edit/export behavior, and project only list-visible fields.
Never simply remove fields used by the UI. Separate list, count, statistics and
user-enrichment timings using bounded operation names without personal values.

## 3. Match indexes to observed query shapes

Inspect unfiltered sorting, status/date filters, staff assignment, student-owned
lists and common searches independently. Use executionStats and examined/returned
ratios to identify real scans. Existing filtered indexes omit the new _id tie
breaker, so verify actual plans before extending them. Add only indexes justified
by representative queries, checking creation and write cost. Preserve existing
indexes until measured evidence supports a later review; do not run syncIndexes.

Exact ticket/student-code lookups may deserve a dedicated indexed path; flexible
substring searches need a deliberate search strategy. Large offsets may eventually
require cursor pagination, but current page-number navigation remains supported.

## 4. Use Redis selectively with correct invalidation

Keep the private VPS Redis already connected to the API. Identify the expensive,
frequently repeated reads before adding caching. The global complaints summary is
a candidate for a short 15–30 second cache, invalidated on create/delete/status or
priority changes and relevant updates. Measure hit/miss and cold/warm latency.

Any list cache must include permission/owner scope, normalized filters, sort and
page size. Updates/replies/assignments must invalidate affected data. Protect student
isolation and current authorization. Redis cache connectivity alone does not mean
this endpoint is cached. Do not enable queue workers or change the rate-limit store
as an assumed fix for a MongoDB query; assess each subsystem separately.

## 5. Work through the remaining slow operations

Rank routes by request volume and cumulative time, then warmed p95 and slow-query
frequency. Review the latest export for eligibility/advising, quiz attempts and
submissions, user reads and notifications; do not assume the old snapshot still
represents current priorities. Remove duplicate reads, unbounded payloads and
sequential independent queries where evidence supports it. Review count and
aggregation costs as well as find operations.

For authentication, isolate password hashing/verification, token verification and
database/network time. Preserve bcrypt work factors, OTP rules, lockouts, RBAC and
CSRF. A 401 rejection is investigated separately from latency; do not suppress it
or reduce password security to make a timing tile green.

## 6. Validate changes and agree on targets

Compare identical request shapes and sample sizes before/after each small change.
Provisional goals: simple 20-row MongoDB list execution below 20 ms, warmed
complaint-list median below 250 ms and p95 below 500 ms. These are proposed targets,
not promises; revise them against measured network/resource constraints. Any
remaining outliers should be traceable to a query shape or an external bottleneck.

Verify pagination totals/boundaries, last-page deletion, search, drawer details,
reply/assignment updates, cache invalidation and student/staff authorization.
Run appropriate lint/type/build/unit/integration checks and E2E in isolated test
infrastructure. Repeat the read-only live probe and normal usage checks after each
deployment. Record zero newly introduced 5xx failures; keep expected 4xx visible.

A region migration or paid Atlas tier change is a separate proposal only if the
measurements warrant it, with a fresh backup, restore verification and rollback
plan. This plan itself changes no production configuration or data.

## References

- [MongoDB: explain slow queries](https://www.mongodb.com/docs/v8.0/tutorial/explain-slow-queries/)
- [MongoDB Atlas: latency reduction](https://www.mongodb.com/docs/atlas/architecture/current/latency-strategies/)

Status: plan prepared; awaiting the deployed VPS probe output before selecting the
first optimization. No new runtime code or configuration was changed for this plan.
