# Authentication deployment readiness

Current implementation: [bcrypt and admin/staff passkeys](BCRYPT_ADMIN_STAFF_PASSKEY_REPORT.md). Earlier Argon2 migration requirements are canceled.

| Gate | Current requirement |
| --- | --- |
| Password compatibility | Bcrypt cost 12 for new writes; existing bcrypt hashes verified without login rehash. No password migration or production database change |
| Automated verification | See current report for exact final lint, typecheck, unit, E2E and build results |
| E2E readiness | Localhost-only runner, fail-fast ping, isolated configuration, explicit auth indexes and bounded connection pool |
| Passkey browser acceptance | Real Chromium ceremonies plus API/Mongo tests; virtual authenticators are not physical-device verification |
| Role boundaries | Student versus management challenges bind the requested area; roles and permissions remain authoritative in Mongo |
| Physical devices | Face ID, Touch ID, Hello/PIN, Android, external keys, QR/Bluetooth and sync need manual staging evidence |
| Portal UI and accessibility | Arabic/English source strings updated; actual portal visual, keyboard and screen-reader acceptance remains manual |
| Dependencies | Earlier high advisories require fresh release audit and owner review; not resolved merely by removing Argon2 |
| Origins / proxy / cookies | Verify exact deployed RP/origins, trusted proxy sources, cookies and browser restrictions |
| Shared Atlas database | Preserve existing database, users and passwords; no seed, reset, restore or migration |
| Sessions | Verify revocation, version checks, optional fixed legacy cutoff and scheduled re-login policy |
| Backups and recovery | Confirm backup/PITR and isolated restore rehearsal; no restore over production |
| Deployment and rollback | Require a bcrypt/session-compatible artifact, canary thresholds and named operator approval |
| Workers | Verify one approved worker owner across cooperating hosts |

Keep PASSKEYS_ENABLED=false until staging acceptance is complete. No production deployment is authorized or performed by local tests.
