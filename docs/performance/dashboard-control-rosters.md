# Dashboard loading and Control rosters

Updated 6 November 2026. These are workspace changes; no live deployment or production database migration has been performed.

## Causes and changes

- Control rejected more than 2,000 approved registration documents, more than 2,000 marks in review, and more than 6,000 component marks in a workbook/release. These were application limits, independent of XLSX parsing. The roster, review and release queries now read the complete course/term scope in driver batches of 500. Membership remains deduplicated by student identity; permissions, independent review, completeness and revision checks remain enforced. No rows are silently truncated.
- Workbook reads project only mark and identity fields. Roster membership and current-component marks load concurrently. The browser still renders 100 students per page and retains whole-course search, sorting and draft handling. Sorting is memoized separately from draft validation so editing a mark does not sort the whole roster again.
- Official final preview previously filtered the complete mark array for each student. It now groups marks by student once before calculating outcomes.
- The dashboard loaded a student count request, a 100-student sample, and aggregate student statistics. It now uses aggregate statistics directly for enrollment totals/charts, without the sample or duplicate count requests. Each chart waits only for its own dataset. Admin queries respect the corresponding read capability, use a one-minute freshness window and do not refetch just because the window regains focus.
- Advanced analytics and additional charts mount as their section approaches the viewport. Student/grade forms, upload dialogs, session details and the analytics export dialog load only when opened. In particular, the Excel pre-flight reader is imported by the upload dialog and no longer needs to load on the dashboard's initial render.
- Dashboard overview previously calculated quiz analytics three times. A request now shares one calculation across overview, faculty and course analytics. Submission, attempt, enrollment and creator reads run concurrently after resolving scoped quizzes. Excel report worksheets share that same scoped dataset and reuse overview faculty/course results. There is no cross-user backend result cache. XLSX reports remain generated on demand; they are not requested automatically by dashboard rendering.

## Index rollout

Production uses `autoIndex: false`. The two new schema declarations therefore also have an explicit additive migration:

```powershell
# Safe preview: prints definitions without connecting to any database.
node scripts/ensure-control-query-indexes.cjs
```

On the reviewed deployment, run the same command with `--apply` using its existing protected `MONGODB_URI` environment. Do not paste a connection string into shell history. The command creates only these non-unique indexes, leaves existing indexes and records intact, and is safe to repeat:

- `course_registrations`: academicYear, semester, status, courses, studentId.
- `grades`: courseId, academicYear, semester, examType, studentId.

The identity-only roster projection excludes `_id` so the registration index can cover it. Do not use `syncIndexes`, drop unrelated indexes or rebuild all schema indexes as part of this migration.

## Verification

The 6 November CI-fix rerun passed all 13 real Control integration tests. For 3,001 synthetic students / 9,003 marks, the measured workbook requests took 733 ms (coursework), 202 ms (midterm) and 188 ms (final); full final preview took 855 ms. These are single local requests, not production latency guarantees. Evidence: `outputs/control-ci-fix-integration.log` and `outputs/control-scale/3001-students.json`.

The same increment fixes the reported API formatting errors and restricts imported student codes to strings or finite numbers. Objects, arrays, booleans and non-finite numeric values are rejected by identity validation instead of default object stringification. The workbook unit suite passed 21 tests, including these cases. The scale fixture now resolves its report path using `import.meta.url`, which works with the ESM Jest runner. Workspace and E2E TypeScript checks passed.

The regression integration test seeds 3,001 synthetic students and 9,003 marks in isolated localhost fixture collections. It checks all workbook identities and components, independent submission/approval for all three sheets, and the complete final release preview. It records single-request durations in `outputs/control-scale/3001-students.json` after success; those measurements are not production p95 or an SLA. The browser fixture uses 3,001 rows, checks 100 rendered rows, paging and last-student search, alongside the existing saving/retry and bilingual checks.

Verification logs for this increment:

- `outputs/dashboard-roster-lint.log`
- `outputs/dashboard-roster-types.log`, `outputs/dashboard-roster-e2e-types.log`
- `outputs/dashboard-roster-unit.log`
- `outputs/dashboard-roster-integration.log`
- `outputs/dashboard-roster-browser.log`

Check completion and exit status before treating a log as passing. Full production acceptance remains tracked separately in [control-production-acceptance.md](../control-production-acceptance.md).

## Deployment checks

1. Apply the reviewed indexes and deploy the API and web changes together.
2. Open a course with more than 2,000 approved students. Compare its full unique roster count, first/last student and all components with registration records. Verify search and paging without `ROSTER_LIMIT_EXCEEDED`.
3. Test scoped Excel export, a valid import, independent review and final preview. Transactions and direct row/paste imports remain limited to 500 changes. The 12 November file workflow supports up to 10,000 rows / 2 MB, previewed and committed in sequential 500-row batches; see [control-testing.md](../control-testing.md).
4. Compare dashboard network requests and timings using the same account/device. Initial rendering must not request `/admin/students` for sampled chart data, advanced overview requests must wait for their section, and opening a dialog must load its code only then. Verify retry behavior and access for staff with limited permissions.

The workbook still transfers a complete course snapshot while rendering a page at a time. These changes do not establish unlimited roster capacity, a 10,000-student production benchmark, or bypass MongoDB's document/transaction limits for immutable releases.
