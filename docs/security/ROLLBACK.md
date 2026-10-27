# Authentication release and rollback runbook

Current password policy is **bcrypt**, without migration or login rehash. The earlier Argon2id proposal was canceled before any production password writes. See [current implementation evidence](BCRYPT_ADMIN_STAFF_PASSKEY_REPORT.md).

## Before release

1. Confirm the exact existing Atlas database for both hosts without copying secrets into logs. Verify backup/PITR and an isolated restore rehearsal. Never seed, reset or restore over production.
2. Record current release/image IDs and ensure the rollback artifact supports bcrypt, hashed-SID sessions, tokenVersion and current CSRF policy.
3. Approve additive auth/passkey indexes and confirm permissions/load. Rate-limit index readiness now completes at startup; passkey initialization awaits Mongoose model readiness before explicit index creation. Expiry queries reject expired records independently of TTL cleanup.
4. Keep existing JWT signing configuration/issuer/audience consistent across instances. Approve one absolute legacy-token cutoff within seven days or a planned re-login. Do not repeatedly extend the cutoff.
5. Verify exact frontend origins, PASSKEY_RP_ID/PASSKEY_ORIGINS, trusted proxy CIDRs and real-browser cookie behavior. Use RATE_LIMIT_STORE=mongo in production.

## Staging and canary

1. Keep PASSKEYS_ENABLED=false initially. No password-algorithm or migration flag is needed.
2. Run automated checks using the commands in the current report. Accept real devices separately using the passkey matrix.
3. Validate student/password/Google flows, admin/staff password and passkey flows, first-login policy, disabled/locked users, permissions, copied-token logout rejection and recovery.
4. Coordinate API/web deployment for Google nonce proof and bound passkey login areas. Retain Google student-only policy. New metadata does not permit frontend-selected roles.
5. Confirm a single worker owner and stage explicit canary thresholds for authentication errors, rate-store failures, index errors, CPU/RSS, login latency and session writes.
6. Obtain named operator approval before deploying or switching traffic. Enabling passkeys is a separate acceptance decision.

## Rollback

Disable passkeys and route to the reviewed bcrypt/session-compatible artifact. Preserve credential records, session revocations, tokenVersion and the fixed legacy cutoff. Do not clear revocation state, widen CORS, trust arbitrary forwarded headers, downgrade policy by removing checks, or replace the database. If a compatible artifact is unavailable, halt promotion and forward-fix.

No production rollout, database migration, restore, secret rotation or worker change was performed here.
