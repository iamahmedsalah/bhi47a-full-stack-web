# Session query investigation

The actual modern-session lookup in `apps/api/src/modules/auth/services/auth-session-store.service.ts` is an existence query with projection `_id`, using a SHA-256 SID digest as `_id`, and additional predicates for `userId`, `tokenVersion`, `revokedAt:null`, and `expiresAt > now`. Its `_id_` index is unique. The TTL expiration index handles cleanup; authorization explicitly checks expiration instead of waiting for TTL deletion. Legacy-token revocation checks also constrain `_id`.

There is no evidence that a missing session compound index caused the 1,014 ms and 1,050 ms observations. These are Mongoose wall times and can include checkout, server selection, command round trips, middleware and scheduling. The exact cause remains unresolved without correlated observations and a deployed plan. A process-uptime flag cannot prove cold-start causality.

`apps/api/src/database/mongodb-driver-metrics.ts` attaches once per MongoClient, using the installed driver's `durationMS` checkout events (no FIFO pairing of concurrent operations). `database.module.ts` enables command monitoring. Added metrics:

- `student_portal_mongodb_pool_checkout_seconds{outcome}`: success, timeout, poolClosed, connectionError, other.
- `student_portal_mongodb_pool_waiters` and `_pool_checked_out`: live totals across driver pools since listener attachment.
- `student_portal_mongodb_command_duration_seconds{command,outcome}`: bounded command names, success/failure; command contents and error text are not captured.

These are separate diagnostic series. They do not increment Mongoose query counts a second time. Checkout/command events are not claimed to be individually request-correlated, and the command duration includes network time. Initial connection setup before listener attachment is not measured. Mongoose failure/selection errors before command start remain outside the completed-query counter; command failures and checkout failures provide partial failure coverage, not a complete error taxonomy.

Supply a digest through `PERF_SESSION_DIGEST` to add a primary-key session plan to `performance-query-plans.mjs`. It never prints the digest or enumerates sessions. For an exact modern validation plan, use a representative identity/version privately:

```javascript
db.auth_sessions.getIndexes()
db.auth_sessions.find({
  _id: digest, userId: userId, tokenVersion: version,
  revokedAt: null, expiresAt: {$gt:new Date()}
}, {_id:1}).limit(1).explain('executionStats')
```

Expect the unique `_id_` lookup to examine at most one matching document, but verify it. If server execution is short while checkout p95 rises, investigate pool saturation and connection establishment; if command time rises with low checkout, compare server execution/network/host scheduling. Do not increase pool size blindly. Session validation remains fresh on every protected request, including after password changes, account deactivation and cross-replica revocation. Rollback: prior image; no session records or indexes change.
