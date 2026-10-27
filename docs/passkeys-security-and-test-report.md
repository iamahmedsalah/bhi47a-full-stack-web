# Passkeys security and test report

> Historical implementation report. Current test outcomes and remaining release blockers are in [AUTH_REMEDIATION_REPORT.md](security/AUTH_REMEDIATION_REPORT.md); use the [deployment checklist](security/DEPLOYMENT_READINESS_CHECKLIST.md) before release.

Date: 2026-10-27. Release decision: **BLOCKED for rollout** pending database-backed integration, staging/device acceptance and remediation/review of existing high-risk findings. Feature defaults to `PASSKEYS_ENABLED=false`. This is a repository implementation, not a production-readiness claim or a completed deployment.

## Machine verification

Commands ran on Windows PowerShell with Node 24.15.0, using `pnpm.cmd` because PowerShell execution policy blocks the `.ps1` shim. The launcher needed network access to verify pnpm's registry signature; sandboxed launcher attempts failed/hung, and were rerun with approved network access. No signature verification was disabled.

| Command | Result / limits |
| --- | --- |
| `pnpm.cmd run lint` | PASS after fixes: 0 errors; existing web warnings remain (247 warnings). New passkey files passed. Final header and new frontend files were also linted separately: 0 errors, 3 existing header warnings. |
| `pnpm.cmd run typecheck` | PASS: 4 tasks successful. Initial API-only attempt caught v14 transport type rename and BSON Binary conversion; both fixed. |
| `pnpm.cmd run test -- --runInBand` | PASS: 45 suites, 287 tests. Includes real-signature passkey tests and existing HTTP authorization regressions. |
| `pnpm.cmd --filter @student-portal/web test:location` | PASS: 26 tests. Existing module-type warnings only. These are existing web regressions, not WebAuthn browser tests. |
| `node --test scripts/vps-workflow.test.cjs scripts/performance-query-plans.test.mjs` | PASS: 4 tests. |
| `pnpm.cmd run build` | PASS: all 3 tasks successful, 17/17 static pages generated, new admin security route present. Took 39m03.9s on this workstation. Existing custom Cache-Control warning and a Turbo metadata warning for the pre-existing dev server's `.next/dev/lock` symlink did not fail the build. |
| API Vercel runtime and web root manifest checks | PASS: exact `NODE_OPTIONS=--experimental-require-module`; Nest imports with that flag; compiled passkey service imports; both root manifests resolve `/`, and the new admin security route is present. Existing duplicate user-schema-index warning on compiled import only. No remote Vercel deployment performed. |
| `pnpm.cmd run test:e2e -- --runInBand --forceExit` | FAIL / infrastructure blocked: isolated localhost MongoDB refused connection (`ECONNREFUSED 127.0.0.1:27017`); 30-second app setup timeout, then existing cleanup tried to close an uninitialized app. `--forceExit` ends outstanding reconnect handles. No health-route success was claimed. |
| `pnpm.cmd --filter @student-portal/api test:e2e --runInBand --forceExit --runTestsByPath test/passkeys-store.e2e-spec.ts` | FAIL / infrastructure blocked: all 4 database cases failed setup with `ECONNREFUSED 127.0.0.1:27019`. No Mongo-backed passkey behavior was claimed to pass. |
| `pnpm.cmd audit --prod --json` | NONZERO / open dependency findings: 4 high, 2 moderate, 2 low instances, 0 critical. Existing dependency tree needs remediation review. |
| Targeted formatting and `git diff --check` | PASS: scoped Prettier check for new backend/frontend implementation files, backend lint formatting, final new Mongo e2e file lint (0 errors), and `git diff --check` (exit 0). Repository has no workspace format-check script. |

Local verification output is saved in ignored `outputs/passkeys-verification.log`; dependency report is in ignored `outputs/passkeys-dependency-audit.json`. This document is the repository review artifact; local scratch outputs are not required for deploy. TCP checks found no MongoDB on 27017 and no Redis on 6379. Docker initially had no daemon pipe. Docker Desktop was launched in the background, but the engine returned HTTP 500 for both `info` and `_ping`; `docker compose -p codex-passkeys -f outputs/passkeys-test-services.yml up -d --wait --wait-timeout 90` failed before starting the isolated services on 27019/63791. No production/application database was used for testing.

## What the automated tests establish

`passkeys.service.spec.ts` uses a software P-256 authenticator with a generated COSE key, CBOR none-attestation and real signed assertion payloads passed through the installed SimpleWebAuthn verifier. Persistence is an in-memory Mongo query double; this is not a hardware test or Mongo integration test.

Verified cases include:

- Successful registration and login map to the same existing user and existing session handoff; multiple credentials/tabs work and valid zero counters remain usable.
- Wrong signed origin, RP hash, challenge, response type, invalid signature and absent UV reject; missing/malformed and nonexistent credentials reject.
- Expired flow rejects before TTL cleanup; replay/concurrent same-flow verification permits only one success in the atomic-store model; wrong browser secret and handle reject.
- Recent password verification is required and bound to the exact session token/origin; stale grants and wrong passwords reject, with failed password attempts recorded.
- Disabled, forced-password-change, locked and deleted users cannot obtain a passkey session.
- Duplicate enrollment rejects, owner-scoped list/delete/rename behavior is checked, removed credentials fail and another credential continues working.
- Counter rollback and compare-and-swap conflicts reject; BSON Binary and Buffer public keys restore to identical bytes.
- Configuration rejects wildcard/HTTP production/path/mismatched-host origins and broad parent RP configurations without an exact host.
- Existing real HTTP guards reject anonymous, forged/expired/revoked-version sessions, enforce live DB role/permissions and CSRF/first-login gates. Passkey registration inherits those guards.
- Passkey endpoint rate rules ignore spoofed forwarded-for values; existing limiter tests cover shared store behavior.
- Password and mocked-provider Google login retain identity/claims; unlinked Google identities cannot create accounts; existing secure cookie, CSRF renewal and cookie clearing contracts remain intact.

Provider credential validation and Google account recovery are mocked or statically reviewed where noted, not exercised against live Google. There is no actual refresh-token flow to test. No tenant boundary or MFA selection flow exists in this single-institute repository. Tests do not demonstrate all browser UI errors, authenticator providers, screen-reader behavior, real Mongo races/TTL cleanup, distributed counter updates across replicas, TLS/proxy or cross-site cookies. These remain acceptance requirements.

`apps/api/test/passkeys-store.e2e-spec.ts` adds real Mongo-backed tests for persisted hashed flow bindings, the TTL index, same-challenge verification races, expired challenge rejection, credential uniqueness and zero-counter revision updates. It refuses any URI that is not an explicit localhost test/e2e database. Its database cases require a working Mongo service; they are not included in the 287 passing unit tests. Only test-owned random IDs are cleaned up.

## Existing dependency advisory remediation

Registry advisory metadata at execution time reported these affected packages; multiple paths can account for the four high instances:

| Package | Severity | Advisory / patched range |
| --- | --- | --- |
| Zod | High | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), upgrade to >=4.6.6 |
| body-parser | High | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), >=2.4.0 |
| multer | High | [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), >=2.5.0 |
| fast-uri | Moderate/Low | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp; >=3.1.9 |

No SimpleWebAuthn advisory appeared in this report. Audit existing direct/transitive paths and update with regression verification; no unrelated major dependency upgrades were included in this change.

## Required physical-device acceptance — NOT TESTED

Every row below is a planned acceptance case. **No row is a claim of platform support verified in this session.** Record exact OS/browser versions, device model, authenticator/provider, registration/login result, cancellation/fallback result and evidence for every execution.

| Platform | Browsers to exercise | Authenticator/cross-device scenarios | Result |
| --- | --- | --- | --- |
| iOS | Safari, Chrome where available | Face ID/Touch ID/passcode, phone/QR where available | NOT TESTED |
| iPadOS | Safari | Platform provider, external key where supported | NOT TESTED |
| Android | Chrome, Samsung Internet where relevant | Provider fingerprint/face/PIN, phone/QR, USB/NFC | NOT TESTED |
| Windows 10/11 supported versions | Chrome, Edge, Firefox | Windows Hello, USB/NFC key, phone/QR | NOT TESTED |
| macOS | Safari, Chrome, Firefox | Touch ID/device authentication, external key, phone | NOT TESTED |
| Linux | Chromium/Chrome, Firefox | Supported provider/external security key | NOT TESTED |
| Embedded/mobile webviews | Actual institution/user-app browsers | Capability detection and external-browser fallback | NOT TESTED |

For each platform verify:

1. Register -> list -> logout -> passkey login reaches the same user, role and permissions; admin/staff and student layouts remain correctly protected.
2. Multiple passkeys, tabs, synced versus device-bound providers, zero-counter keys, USB/NFC security keys and cross-device QR/phone flows where offered. PIN/password verification is valid UV, not a biometric failure.
3. Rename/removal requires password confirmation; removal blocks future credential use; remaining credentials and mandatory password fallback work. Verify actual student password recovery mail and administrator-assisted recovery, device loss and private browsing.
4. Cancel/time out/decline prompts, missing authenticator, unsupported browser/OS, network interruption and offline submission. Existing password and linked Google login remain usable after each failure.
5. Keyboard-only and screen-reader operation, focus behavior in Radix dialogs, Arabic RTL/English LTR, localized dates/names, narrow screens and error announcements.
6. Staging production-equivalent exact website Origin/RP ID/TLS; API proxy and CDN forwarding; CORS preflight with `x-passkey-flow`; secure cookies, CSRF and third-party-cookie blocking; no raw biometric/token/challenge/password logging.
7. Real MongoDB unique indexes and TTL cleanup; cross-replica simultaneous same-challenge verification, simultaneous counter updates, revocation and account-disable races; public endpoint rate-limit exhaustion and distributed identity/edge behavior.

## Security sign-off and next actions

Implementation remains disabled. Before enabling a staging pilot, provision isolated MongoDB/Redis, run CI/e2e and database-backed passkey scenarios with the feature enabled, configure explicit RP/origins and index permissions, and validate working recovery. Before controlled production, complete relevant device rows, assess/remove the legacy Google access-token userinfo fallback, resolve high dependency advisories and validate sanitized proxy/rate-limit identities. Do not enable passkey-only accounts; all current accounts retain required passwords.

Rollback is `PASSKEYS_ENABLED=false` plus API restart/redeploy; preserve credentials and flows for their TTL cleanup and keep the same RP configuration for re-enable. No account migration, global token invalidation, collection reset, commit, push or deployment was performed.
