# Conditional index plan

No index creation, deletion, `syncIndexes`, profiler enabling or production migration was executed. The sort index already exists in the complaint schema; that does not establish its presence in the deployed database. Inventory names and ordered keys before making a decision.

Run the read-only plans in [complaints](COMPLAINTS_QUERY_OPTIMIZATION.md) and [sessions](SESSION_QUERY_ROOT_CAUSE.md). Record winning plan, `IXSCAN`/`COLLSCAN`/blocking `SORT`, examined keys/documents, returned count, server execution and command round trip. Compare typical populated data and both filtered/unfiltered requests. An empty count must be assessed separately from page retrieval. Do not treat a fast empty-result plan as representative selectivity.

If the reported default list has a blocking sort or scan attributable to a missing equivalent index, the additive candidate is:

```javascript
// Only after plan/inventory review and explicit production build approval.
db.complaints.createIndex({createdAt:-1,_id:-1}, {name:'complaints_createdAt_id_desc'})
// Rollback only the newly created index, after verifying this exact name/key:
db.complaints.dropIndex('complaints_createdAt_id_desc')
```

Do not create the named candidate if an equivalent `createdAt_-1__id_-1` or differently named index is present. Do not drop an existing index during rollback. The current `{status:1,createdAt:-1}` does not include the `_id` tie-breaker; a `{status:1,createdAt:-1,_id:-1}` replacement is only a candidate when status-filtered plans justify write/storage cost. Staff/department/search combinations need their own evidence; do not create every permutation.

Session `_id_` already supports the high-selectivity validation lookup. No additional validation index is justified by the source alone. TTL cleanup remains independent of active-session authorization.

Before an approved build: capture collection/index sizes, disk headroom, write rate, replication lag, backup/restore readiness, build-window capacity and target MongoDB version behavior. Test on staging, build one additive index, re-run identical plans/workload, watch write latency and replication, then decide whether to retain it. The application patch requires no schema migration. Existing production auto-index policy must be audited before a later schema-index change; this patch does not add a schema index.
