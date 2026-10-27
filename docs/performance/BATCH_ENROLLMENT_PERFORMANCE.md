# Batch enrollment scope

The user's explicit priority order is complaints, 401 traffic, user/session reads, then HTTP monitoring. This follow-up does not change enrollment/import behavior or claim an Excel failure root cause. Course/student modules already had substantial unrelated working-tree edits, which are preserved.

The previously completed projection/bulk-read optimization and remaining race concerns are documented in `../PERFORMANCE-REMEDIATION-2026-10-27.md`. Reproduce import failures with a sanitized workbook, response code and request trace before changing validation, duplicate handling, credit writes or partial-failure behavior. No such failing workbook or trace was supplied in this request.

Future enrollment benchmarking should use an isolated staging dataset with expected duplicates, existing registrations, invalid rows and term/credit limits. Measure query counts and p95 at fixed batch sizes, verify registration integrity, and test concurrent uploads explicitly. Never run production batch writes as a performance probe. Rollback this follow-up via the prior application image; it includes no enrollment migration.
