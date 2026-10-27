# Bcrypt and admin/staff passkey implementation

This is the current implementation report. The user's explicit instruction cancels the earlier Argon2id proposal, lazy rehash and password migration. Earlier reports retain historical evidence and do not describe the final hashing policy.

## 1. Authentication architecture

Passwords use the existing bcrypt algorithm. New hashes use cost 12, matching the original account writer; recognized existing bcrypt2a/2b hashes continue to verify at their stored cost. Password case, student normalization and historical bcrypt 72-byte behavior are retained. `UsersService.validatePassword` only verifies: it never changes passwordHash, tokenVersion or password-change dates. Password creation/change/reset remains an explicit action. Argon2 is absent from the manifest, lockfile, build allowlist and runtime hasher. No migration flag or lazy-rehash code remains.

Password, student Google and passkey authentication reuse canonical random-SID session issuance. Protected requests validate the persisted session plus current database role, permissions, activation, lock and tokenVersion. Google remains student-only. No access JWT is returned to browser storage. Existing server-side logout, CSRF, exact origins, trusted proxy policy and fresh grants are retained.

No production accounts, passwords or database records were changed. No seed, restore, migration, secret rotation, deployment or push was performed. All new test writes use synthetic fixtures on localhost.

## 2. Verified findings and remediation

| Finding | Current implementation | Evidence | Regression coverage |
| --- | --- | --- | --- |
| Requested bcrypt rollback | Implemented; no data conversion | `security/password-hasher.ts`, `modules/users/users.service.ts` | bcrypt salt/cost/compatibility tests; login hash-preservation assertion |
| Admin/staff passkeys | Existing role-neutral protocol completed with explicit management-area binding | `passkeys.service.ts`, DTO/controller/schema, management login button | admin/staff real-signature unit tests and Chromium + API + Mongo scenarios |
| Area confusion | Challenge binds student/management request; role checked before and after verification | `PasskeysService.assertLoginArea`, `PasskeyFlow.loginArea` | student→management and admin/staff→student rejection |
| Index work during first request | Shared rate-store initialization now completes before traffic; passkey initialization awaits model readiness | rate-limit store/service; `PasskeysService.onModuleInit` | unchanged 20 concurrent increments and reset assertions |
| E2E startup DDL contention | Test connections disable automatic DDL for unrelated modules; auth indexes are explicitly provisioned | database module test-only options; E2E setup | full AppModule still boots; TTL, unique credential and atomic challenge tests retained |
| Unsafe test environment | Runner rejects remote/non-test Mongo targets; AppModule ignores dotenv in tests | `test/run-e2e.cjs`, `app.module.ts` | four executable unsafe-target tests |
| Unknown physical-device support | Requires staging verification | acceptance matrix | virtual browser results are never labeled hardware results |

All abbreviated backend paths above are relative to `apps/api/src`. Existing high dependency advisories and deployment gates from the earlier audit require a fresh release review; this change does not claim to remediate them.

## 3. Passkey registration, login and recovery

Students retain their existing entry point. Admins and staff use `/{locale}/login/admin` and manage their own credentials at `/{locale}/admin/security`. A management login requests `area=management`; student login requests `area=student`. The server records that area in the expiring challenge and checks the credential owner's authoritative role. Missing area remains compatible with the earlier API contract; it never grants permissions or overrides database roles.

Enrollment, rename and removal require a single-use password-verified grant bound to exact session, owner, origin and action/credential. Browser WebAuthn requires user verification. Signature/RP/origin/challenge and counter handling remain delegated to SimpleWebAuthn. No biometric data is stored. Removing a passkey does not remove the mandatory password; removal itself verifies that password. Administrative recovery uses the existing permission-protected password-reset workflow and forced password change, never enrollment as another user.

Arabic/English passkey fallback text now describes password access without incorrectly advertising Google to admins/staff. The auth provider redirects using the returned database role.

## 4. Database impact

No password migration or bulk rewrite exists. The only new optional passkey flow field is `loginArea`; existing short-lived flows without it remain compatible until expiry. Existing collections/indexes are retained: passkey credential uniqueness, flow TTL/lookup indexes and hashed SID/session/action records. Index setup uses createIndexes, never sync/drop. No production index operation was executed in this task.

## 5. Testing

The persistence suite passed all five tests in 2.37 seconds after readiness changes, with the original 30-second test limits unchanged. The full application test also needed unrelated automatic index creation disabled in its test connection; required auth indexes remain explicitly verified. A real loopback frontend replaced an intercepted page response that could not fetch the API in the browser harness.

| Verification | Actual result |
| --- | --- |
| `pnpm run lint` | PASS, exit 0: zero errors, 247 existing web warnings |
| `pnpm run typecheck` | PASS, exit 0: 4 tasks |
| API `typecheck:e2e` configuration | PASS: end-to-end fixtures and browser harness compile |
| `pnpm run test -- --runInBand` | PASS, exit 0: 49 suites / 343 tests |
| Final bcrypt hasher regression suite after retaining overflow coverage | PASS: 12 tests; includes stored-hash preservation and bounded verification. This additional test was checked separately after the full-suite run |
| `pnpm run test:e2e -- --runInBand` | PASS, exit 0: 2 suites / 18 tests, 11.578s on the final runner; no skipped tests, force-exit flag or raised test timeouts |
| E2E runner target-safety tests | PASS: 4 unsafe Mongo target rejections before application import |
| `pnpm run build` | PASS, exit 0: all 3 build tasks; 4m47.633s |
| Deployment artifact and runtime checks | PASS: web root manifests, exact API NODE_OPTIONS, compiled API bcrypt cost/verification and Nest CJS loading |
| Additional script checks | PASS: 10 admission, runner safety, query-plan and workflow tests |
| Test service cleanup | Completed: only the student-portal-e2e containers/network were stopped and removed; no volumes or production services were deleted |
| `pnpm audit --prod --json` | Unresolved: 4 high, 2 moderate, 2 low, 0 critical; release review remains required |

The initial root E2E attempt under nested Turbo exited with Windows native status 3221226505 while the direct API runner passed. The root script now invokes that same runner directly. It retains every suite, forwards CLI options correctly and runs serially. After the safe local database ping, the runner builds current shared source before Jest, preserving the old workspace dependency even after local shared-package edits. This removes the failing wrapper; it is not a test skip or assertion relaxation.

The browser harness uses real loopback HTTP pages, real API controllers/guards, synthetic database users and Chromium's virtual authenticator. It performs actual navigator.credentials ceremonies. It does not render the production portal pages or simulate a physical fingerprint sensor, Apple/Google synchronization or Bluetooth proximity.

See [CROSS_DEVICE_PASSKEY_TEST_MATRIX.md](CROSS_DEVICE_PASSKEY_TEST_MATRIX.md) for automated and manual acceptance separation.

## 6. Reproduce and deploy

1. Use Node24 and the workspace pnpm version; install from the lockfile.
2. Start Docker Desktop, then run `pnpm test:services`.
3. Run `pnpm test:browsers` to install matching Chromium.
4. Run `pnpm test:e2e -- --runInBand`. Default test services bind only 127.0.0.1:27019 and 127.0.0.1:63791. CI-provided localhost test URIs are supported. A missing database fails before importing the application.
5. Run `pnpm test:services:down` after testing.

Production passkeys remain off by default. Configure exact PASSKEY_RP_ID/PASSKEY_ORIGINS, approved browser origins, shared Mongo rate limiting and the existing JWT session/cookie settings. Verify physical devices, Google fallback for students, staff authorization, backup/recovery and actual proxy topology in staging. Obtain release approval separately. Rollback must preserve the current session-revocation contract and bcrypt compatibility. No Argon2 deployment or migration is required.

## 7. Remaining release gates

Physical-device/platform UI, cross-device QR/Bluetooth, real cloud synchronization, full portal RTL/accessibility, real Google project settings, production cookie restrictions, backup rehearsal and target deployment behavior remain manual staging checks. No production release is authorized or performed by these tests.
