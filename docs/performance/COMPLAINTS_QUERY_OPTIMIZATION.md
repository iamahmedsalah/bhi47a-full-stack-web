# Complaints: remaining latency diagnosis

Affected files: `apps/api/src/modules/complaints/complaints.service.ts`, core metrics middleware/context/service, JWT strategy and role/permission guards, plus `scripts/performance-query-plans.mjs`.

The list already executes page and exact count concurrently, then at most one national-ID enrichment batch. The frontend defaults to 20 and permits up to 100. Changing the projection would remove replies, internal notes, histories, attachments or contact information consumed directly by the drawer. This patch therefore preserves the existing list contract and pagination. A summary/detail split needs a separate compatible API/UI change and payload evidence. Cursor pagination is deferred until deep-page plans show it is useful; existing offset callers keep working.

The enrichment batch now deduplicates student IDs. No cache, permission change or status staleness is introduced. The existing sort schema index was not added again, and no database index was built.

Capture with a read-only identity on a staging copy, supplying `MONGODB_URI` explicitly:

```powershell
node scripts/performance-query-plans.mjs > before-plans.json
```

The script includes page sizes 20 and the reported 100, offset 1000, status filtering, and exact counts. It returns winning stages/indexes, examined/returned counts, server execution time and command round trip without documents or filter values. Test search, department/staff and real deep-page filters separately when their traces identify them as expensive. An empty collection is not representative.

Exact shell diagnostics:

```javascript
db.complaints.getIndexes()
db.complaints.find({}).sort({createdAt:-1,_id:-1}).skip(0).limit(100).explain('executionStats')
db.complaints.explain('executionStats').aggregate([
  {$match:{}}, {$group:{_id:1,n:{$sum:1}}}
])
```

Correlate `x-correlation-id` with `recentSlowRequests` in the admin summary and slow-query records. Timings now cover `auth.session`, `auth.user`, `authorization.roles`, `authorization.permissions`, `complaints.page`, `complaints.count`, `complaints.enrichment`, `complaints.transformation`, and `response.serialization`. Total HTTP time ends at response finish. Serialization measures Express `res.json` including its synchronous send work; it is not an isolated JSON.stringify benchmark. Full JWT parsing, other guards and network delivery are not wholly represented by individual stages. DB stage sums overlap because page/count run concurrently; do not subtract their sum from HTTP wall time.

The 50-entry slow-request ring uses a 500 ms capture threshold; the existing 100 ms slow-DB threshold is unchanged. The slow-request threshold does not define success. The target remains representative complaints p95 below 500 ms, currently unmeasured. Tests preserve filters, empty results, totals, ordering and bounded pages; no production speedup is claimed. Rollback: restore the prior application image; there is no database migration to reverse.
