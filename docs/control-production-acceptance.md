# Control production acceptance

Checked on 6 November 2026. Decision: **NOT ACCEPTED for production yet**.

The user identified `https://bhi47.app/en/login` as the live portal. Local implementation, synthetic integration tests and browser fixtures do not establish that the same release is running there. No production grades were modified, no credentials were printed, and no deployment was performed during this audit.

## Live checks

| Request                                                                  | Result            | Meaning                                                         |
| ------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------- |
| `GET /en/login`                                                          | 200, TLS verified | Login page reachable                                            |
| `GET /api/health`                                                        | 200, status ok    | API reachable; response does not identify the deployed revision |
| `GET /api/admin/control/me` without authentication                       | 401               | Existing Control capability route requires authentication       |
| `GET /api/students/me/results` without authentication                    | 401               | Student result route requires authentication                    |
| `GET /api/admin/grades/control-policy/000000000000000000000001`          | 404, Cannot GET   | New policy route is unavailable on this deployment              |
| `GET /api/admin/grades/control-release-history/000000000000000000000001` | 404, Cannot GET   | New release-history route is unavailable on this deployment     |

The two new GET routes exist in the workspace's `GradesController`. Their live responses are consistent with an older API deployment or routing mismatch. Confirm the deployed revision and routing before testing publication. An unauthenticated probe cannot prove authenticated permission enforcement or correct grade calculations.

Evidence is retained locally in ignored `outputs/control-live-*.json`, `outputs/control-live-login.headers` and `outputs/control-live-health.headers`. The previously configured `bhi47a-support.vercel.app` address returned DEPLOYMENT_PAUSED; it is not the user's current portal.

## Read-only database inventory

The explicitly selected workspace database configuration was audited with aggregate reads only. Its relationship to the live portal's database still requires confirmation; this report does not identify it as production merely because a configuration file exists.

| Measure                                                                                           | Observed                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Users                                                                                             | 7,988                                                            |
| Courses                                                                                           | 50                                                               |
| Active grade documents                                                                            | 1                                                                |
| Grade inventory                                                                                   | Course 114, first semester 2026-2027, practical /10, unpublished |
| Duplicate components, missing students, identity mismatches, grades outside approved roster       | 0 each                                                           |
| Historical finals requiring classification, mixed totals/components, invalid coursework breakdown | 0 each                                                           |
| Unapproved published Control marks, dangling pointers, pending or repeatedly failing jobs         | 0 each                                                           |
| Failed audit queries                                                                              | 0                                                                |

Evidence: `outputs/control-configured-database-audit.json`. The small grade inventory does not exercise the live midterm/coursework/final workflow. A practical mark remains a separate legacy component; this audit neither converts it nor treats it as a supported core Control component.

Re-run with an explicitly selected protected configuration. Do not paste credentials into command arguments or reports:

```powershell
pnpm.cmd run audit:control:acceptance -- --source-env .env --read-only --output outputs/control-configured-database-audit.json
```

The tool emits aggregate counts and bounded course/term summaries, without student identities. It reports failed queries and truncated inventories as requiring review. `productionAccepted` remains false even when no data flags are found.

## Backup and recovery rehearsal

A real `mongodump`/`mongorestore` rehearsal passed using official Database Tools 100.20.1, synthetic data and a credential-free localhost replica set. The source and destination were fresh uniquely named databases. No existing database was overwritten or deleted.

Verified across 16 collections:

- BSON document digests and index definitions, including uniqueness, compound order and TTL, match after restoration.
- Source documents and indexes remain unchanged.
- Restored approved release serves three components and the expected 80/100 official total through the production release store.
- Retrying restored outbox delivery twice drains the pending job without duplicate notifications.

Evidence: `outputs/control-restore/b29ebb60b47549ee9319afb89638e584/report.json`, archive, dump and restore logs. Elapsed time: 191,045 ms. This proves the synthetic recovery procedure; **it does not verify a real production backup, offsite retention or point-in-time recovery**.

To repeat, build the API first, start the isolated Control replica set, and install official MongoDB Database Tools. Set `MONGODUMP_PATH` and `MONGORESTORE_PATH` to the executables if they are not on PATH, then run:

```powershell
pnpm.cmd run test:control:restore
pnpm.cmd run test:control:acceptance-safety
```

The rehearsal accepts only localhost `/control-recovery-e2e` and replica set `control-test`; it refuses live targets and credentials. The default port is 27023. Artifacts and synthetic databases remain available for inspection.

## Verification and remaining gates

Previously completed local implementation checks are recorded in [control-system-plan.md](control-system-plan.md): 91 API unit suites / 859 tests, 12 real replica-set Control integration tests, Arabic/English workbook and release browser fixtures, lint, types and the three-package production build.

The broader performance E2E retry failed in its 120-second setup hook while constructing fixture collections/indexes. MongoDB logged individual index-building commands taking tens of seconds. No assertions ran successfully in that retry. An attempted fixture batching optimization did not resolve the timeout and was removed; existing tests and timeouts remain unchanged. Evidence: `outputs/control-acceptance-performance-e2e.log` and `outputs/acceptance-mongodb/mongod.log`. A complete green CI/E2E run is still required on a functioning test environment. The 500/2,000/10,000-roster performance targets are not established by these checks.

Release gates, in order:

1. Obtain a green complete verification run, including general E2E and documented roster-scale measurements. Resolve any functional failures before deployment.
2. Verify a real backup can be restored to an isolated environment, with production database identity and backup freshness confirmed. Preserve snapshot, pointer, baseline, policy, audit and outbox collections together.
3. Deploy the reviewed web/API release through the repository's normal deployment process; record its revision and verify the new policy/history routes resolve behind authentication.
4. With authorized test accounts, run the [office acceptance checklist](control-testing.md) on an approved pilot course/term: import all components, independent approval, 80/100 publication, Grades window open/close, student isolation, corrected result, withdrawal, academic effects and drained jobs. Verify Arabic/English and mobile.
5. Have Control staff reconcile pilot roster counts/totals and approve the result policy and rollout scope. Record the operator, reviewer, course/term, revision and evidence. Expand only after discrepancies are resolved.

No pilot sign-off, production backup verification, authenticated live acceptance, production-scale performance pass or deployment revision is claimed by this document. Phase F remains pending.
