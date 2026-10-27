# Production authentication remediation report — 2026-10-27

> Superseded implementation policy: the user canceled Argon2id and lazy migration. Current code uses bcrypt cost 12 without password writes during login. Read [the current bcrypt/admin/staff report](BCRYPT_ADMIN_STAFF_PASSKEY_REPORT.md) for subsequent fixes and verification; the sections below preserve historical attempts and results.

## 1. Executive security verdict

**NO-GO for production deployment.** Local implementation contains the confirmed Google identity, forwarded-IP, credential-import and copied-token logout defects, centralizes password hashing, and strengthens sensitive-operation authorization. This is not a completed production rollout or comprehensive penetration-test certificate. Dependency findings, target native-runtime/load checks, staging Google/browser acceptance, actual proxy topology, backups and device acceptance remain release gates. Passkeys and lazy rehash stay disabled by default.

The user's request authorized executing the supplied document's audit and implementation. Its claims were treated as hypotheses and checked against source. The before-change [baseline](AUTH_BASELINE.md) was written first. Prior passkey work was preserved. No commit, push, deployment, traffic switch, secret/Google-console change, production password write, seed, reset or restore was performed. Production access was limited to a read-only hash-format aggregation.

## 2. Inventory and threat model

Browser credentials → origin/CSRF checks and shared rate admission → bounded password verification, verified Google ID token or WebAuthn ceremony → canonical JWT issuance → hashed random SID record in Mongo → HttpOnly cookie. Every protected request checks signature/time/claims, persisted session, current DB activation/locks/tokenVersion, then first-login, role and permissions. Sensitive actions additionally consume a fresh session/operation grant. The browser receives CSRF data, never a raw JWT in localStorage/sessionStorage. XSS can still exercise a live session; these controls do not eliminate that threat.

The [endpoint inventory](AUTH_ENDPOINT_INVENTORY.md) enumerates **274 static route declarations**, source lines and policy annotations. It is an audit index, not evidence that every controller/service ownership condition has been exhaustively proven. Authorization tests exercise sampled real controllers and global guards; broader IDOR/staging coverage remains required.

| Finding / severity | Current evidence location | Exploit precondition / reproduction | Fix and regression risk |
| --- | --- | --- | --- |
| Google bearer fallback / high | `apps/api/src/modules/auth/services/auth-login.service.ts:494` | Rejected ID token previously fell back to userinfo with an access token. Baseline negative test reproduced this. | ID-token-only Google SDK verification plus explicit aud/issuer/exp/email/sub validation; access-token-only clients intentionally rejected |
| Email-based subject confusion / high | `apps/api/src/modules/users/users.service.ts:647` | Reassigned matching email could resolve a different linked identity; baseline lookup assertion failed. | Login by immutable Google sub only, explicit authenticated fresh linking; legacy email-only records need password recovery/relink |
| Spoofable client IP / high | `apps/api/src/main.ts:111`, `common/rate-limit/rate-limit.rules.ts` | Caller-controlled forwarded-for previously changed an IP rate key. | Express/socket IP and explicit validated proxy source CIDRs; wrong/missing deployment CIDRs can group legitimate clients behind a proxy |
| Nonrevoking logout / high | `modules/auth/services/auth-session-store.service.ts:50,111`, `auth.controller.ts` | Copied signed token survived cookie clearing. | Persist hashed SID before issuing cookies; owner-scoped per-device revoke; tokenVersion all-device invalidation; DB availability now participates in login/request availability |
| Optional logout CSRF bypass / high | `modules/auth/guards/csrf.guard.ts` | Optional-auth route skipped CSRF even with a valid cookie. | Authenticated logout requires CSRF; browser auth unsafe methods also require exact Origin. CLI clients must send approved Origin |
| Reusable or absent fresh authorization / high | `modules/auth/services/recent-auth.service.ts:49`, `passkeys/passkeys.service.ts:97,146` | Stolen JWT could link identity; a five-minute passkey grant could authorize multiple operations. | Atomic single-use grants bound to exact session/action and target; additional password prompt for contact, linking, session controls and admin credential/permission changes |
| Mixed writers, plaintext fallback / high | `apps/api/src/security/password-hasher.ts`, `modules/users/users.service.ts:207` | Scattered bcrypt writers; default national-ID bypass could replace a failed hash. | One bounded Argon2id abstraction, dual verifier, safe CAS upgrade, plaintext bypass removed; unsupported/corrupt credentials require recovery |
| Import credential overwrite / high | `modules/uploads/importers/student.importer.ts` | Hidden hash fields omitted; normal imports could replace credentials and reactivate accounts. | Explicit projection, preserve existing policy, strict reset flag, independent salts, reset CAS/tokenVersion; explicit reset can succeed even if subsequent unrelated profile sync fails and must be reported operationally |
| Concurrent rate-window reset / medium | `common/rate-limit/mongo-rate-limiter.store.ts:20` | Simultaneous first requests could each reset count to one. | One atomic update pipeline, shared Mongo mandatory in production; 20-request two-instance standalone probe returned counts 1–20 |
| Credentialed preview wildcard / medium | `config/cors-origins.ts:7`, example environments | A preview deployment broadened browser trust. | Exact origins only; old wildcard entries ignored. Each approved preview now needs an exact entry |
| Authorization / privacy | `modules/auth/strategies/jwt.strategy.ts`, `security.integration.spec.ts` | Stale role claims, forced-change, inactive/stale-version cookies and student/admin boundary attempts. | Retained DB-derived role/permissions and private/no-store response policy; added lock rejection; existing safe Nginx forwarded-for replacement retained |
| Dependencies / high, unresolved | `pnpm-lock.yaml`, final production audit | Resource-exhaustion advisories in Zod, body-parser, multer; fast-uri URI ambiguities. | See dependency register below; not suppressed or falsely marked fixed |

## 3. Changes made and compatibility

| Files / area | Result |
| --- | --- |
| `security/password-hasher.ts`, `password-hash.module.ts`, UsersModule | One shared bounded native Argon2id provider; recognized bcrypt compatibility and named PHC parameter parsing |
| UsersService, AuthLoginService, AuthPasswordService, StaffManagementService, StudentImporter, ComplaintsService, seed | All production password/NID/OTP hashing and comparison use the central abstraction; import preservation and reset CAS; lock/permission changes revoke via version |
| `auth-session-store.service.ts`, AuthSessionService, JwtStrategy, AuthController, AuthModule | Mongo SID persistence/revocation, issuer/audience and time checks, aligned access/CSRF cookie expiry, explicit legacy grace, canonical issuance for all methods |
| `recent-auth.service.ts`, `auth-security.controller.ts`, `recent-auth.guard.ts`, origin guard | Google nonce flows, five-minute single-use fresh grants, owner session listing/deletion and logout-all; exact browser Origin checks |
| AuthController, StudentsController, StaffManagementController | Fresh proof for Google linking/unlinking, contact changes, individual/all-session revocation, target student/staff reset and staff permission replacement; password-change endpoint already verifies current password |
| `passkeys/` | Preserve cryptographic ceremony/UV/counter/owner validation; consume session/origin/action-bound registration/rename/removal grants; keep feature off |
| main, trusted-proxy config, CORS and rate-limit files | Exact CIDR trust, no direct XFF trust, exact browser origins, cumulative IP + route/context admission, hashed rate keys, atomic Mongo counters and fail-closed rate-store behavior |
| Web auth provider, api client, Google hook/login/profile, `components/auth/`, admin/security, messages | GIS nonce proof in memory, one-time fresh-auth retry with accessible localized password dialog; session management; Arabic/English strings and explicit RTL modal direction |
| Environment examples, lockfile/workspace, security scripts/docs | Documented issuer/audience, absolute legacy cutoff, rollout flags, shared store and origin contract; native build approval for Argon2; aggregate/benchmark/route tooling and runbooks |

New cookies expire with their signed token; access remains HttpOnly, HTTPS Secure and configured SameSite/domain. Existing CSRF storage behavior is retained; it is not an access credential. Session metadata exposes hashed record IDs and times, not raw SIDs/tokens, IP or user-agent fingerprints. Session listing is bounded to 100 active records of the current version. Legacy pre-SID sessions are not enumerated; current-device logout and logout-all still invalidate them during approved grace. No refresh-token endpoint/rotation was invented.

No legacy JWT grace is enabled by default. An operator may choose a single absolute ISO cutoff within seven days; after it expires, old tokens require re-login. New SID tokens require configured issuer/audience and persisted records. Rolling old API instances cannot consume the new security contract safely without coordinated deployment; use the runbook rather than mixing incompatible releases indefinitely.

Google nonce and proof are short-lived, in-memory browser flow data backed by hashed proof and exact-origin server state; nonce consumption is atomic. Signature validation remains delegated to Google's maintained verifier. The frontend uses the existing popup/FedCM GIS credential flow; it does not introduce an authorization-code/PKCE flow. Existing sub-linked students retain login eligibility. Pending or email-only links must finish explicit authenticated verification; matching email alone never authenticates. Periodic nonce refresh, two tabs and real popup/FedCM behavior still need staging acceptance. New unsafe auth endpoints deliberately reject missing Origin.

## 4. Argon2id migration

Read-only live aggregates: **7,980 bcrypt-2b account hashes**, no other returned category, first measured 2026-10-27T07:19:27.972Z and reconfirmed at 08:48:13.308Z: **7,961 cost 10 / 19 cost 12**. Production accounts were not rewritten. New writes use Argon2id m=19456 KiB/t=2/p=1; legacy bcrypt2a/2b verification remains available. Lazy successful-login CAS rehash defaults off and does not change tokenVersion or password-change dates. Unknown formats and bcrypt2y need explicit review if encountered. See [full strategy, measured latency/RSS and rollback limitations](ARGON2ID_MIGRATION_REPORT.md).

Local Windows synthetic hash p50/p95 was 28/29 ms; verify 29/37 ms; bcrypt10 verify plus upgrade 83/88 ms. Two concurrent hashes had 35/36 ms batch latency and 96.4 MiB peak total process RSS. These are small local samples, not Contabo/Vercel benchmark or fleet capacity proof.

## 5. Google, JWT, passkey and authorization verification

Negative tests include rejected Google SDK verification without bearer fallback, wrong audience/issuer, expired or unverified email, missing sub/nonce, immutable subject-only lookup, nonce origin/proof mismatch/expiry/replay; session record absence, SID/issuer/audience/time restrictions, copied-token logout, per-device versus all-device invalidation, explicit legacy cutoff/revocation, cookie expiry, CSRF and hostile/missing Origin; operation/session binding and concurrent grant consumption; password legacy/current verification, invalid formats, case/whitespace, parameter limits, bounded concurrent work and CAS reset races; import false reset flags, inactive-account/password preservation, role collision and independently salted new writes. Synthetic WebAuthn tests exercise real signatures and rejection paths and management-grant replay.

Real-controller authorization regressions retain DB-derived roles/permissions, forced-password gating, inactive/stale tokenVersion rejection, CSRF, private caching and protected metrics/admin endpoints. These do not establish exhaustive horizontal IDOR safety for all 274 declarations. Actual Google signature/network credentials, complete staging recovery/email delivery, real proxy chains, browser cookie restrictions and physical authenticators remain NOT TESTED. See [device matrix](CROSS_DEVICE_PASSKEY_TEST_MATRIX.md).

## 6. Command and dependency evidence

Environment: Windows x64 / PowerShell, Node24.15.0, pnpm10.28.0; installed Next16.4.2, Nest12.0.3 and Mongoose8.24.4. Tests use synthetic records only in `mongodb://127.0.0.1:27019/student-portal-security-e2e`, isolated Redis `127.0.0.1:63791`, NODE_ENV=test, explicit synthetic JWT secret, startup tasks/workers/queue requirement off. Raw command logs are in ignored `outputs/security-*`; this tracked report retains the reviewable outcomes.

| Exact command | Outcome |
| --- | --- |
| Baseline `pnpm.cmd install --frozen-lockfile` | PASS |
| Baseline `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test -- --runInBand`, `pnpm.cmd run build` | PASS; 247 existing web lint warnings, 4 type tasks, 45 suites/287 tests, 3 build tasks/17 generated pages |
| Baseline `pnpm.cmd run test:e2e -- --runInBand --forceExit` | FAIL: 1 suite passed, 1 setup timeout; 1 test passed/4 failed. Store harness replaced duplicate Nest/Mongoose setup with direct isolated connection; no assertion removed or timeout raised |
| `pnpm.cmd --filter @student-portal/api test --runInBand --runTestsByPath src/security/auth-containment.spec.ts` before fixes | Expected FAIL: all four confirmed containment regressions |
| `pnpm.cmd install --prefer-offline --no-frozen-lockfile` after Argon2 addition | PASS after removing unavailable advisory-version overrides; lockfile synchronized |
| `pnpm.cmd run typecheck` after implementation | PASS: 4 tasks |
| `pnpm.cmd run test -- --runInBand` completed implementation run | PASS: 49 suites, 340 tests; no skipped tests, 43.838s Turbo elapsed, exit 0 |
| Latest `pnpm.cmd run test -- --runInBand` after additional policy regressions | INCOMPLETE: interrupted after more than 30 minutes without a final suite summary. Do not interpret the earlier 340-test pass as a completed final-source rerun |
| `pnpm.cmd run lint` final | PASS: exit 0, 3 successful tasks, zero errors and 247 existing web warnings; 14m19.017s Turbo elapsed |
| `pnpm.cmd run build` | All 3 tasks reported successful, 17 static pages; 25m50.564s Turbo elapsed. The wrapper then stalled and was interrupted, so this is artifact/task success, not a clean final command exit. A later duplicate workspace build was also canceled to avoid repeating unchanged frontend work |
| Final `pnpm.cmd --filter @student-portal/api run build` | NOT RUN: execution permission was declined. Later proxy zero-mask spelling, import profile-role and cumulative route-budget corrections still require this final API rebuild |
| API runtime NODE_OPTIONS validation | PASS: exact `--experimental-require-module` |
| Web root route manifest validation | PASS: static root route and app-path mapping both present in the generated manifests |
| `pnpm.cmd run test:e2e -- --runInBand --forceExit` after implementation | First run: FAIL, 8 passed/1 login persistence timeout |
| `pnpm.cmd run test:e2e -- --runInBand` after rate-counter regression added | Retry: FAIL, 9 passed/1 rate-concurrency timeout; HTTP login/logout/session suite passed. No timeout relaxed; independent compiled-store two-instance 20-request probe passed counts 1–20 in 1013ms |
| Latest `pnpm.cmd run test:e2e -- --runInBand` | FAIL: 1 suite passed/1 failed; 8 tests passed/2 failed, no skipped tests; Jest 1786.917s. Rate-concurrency and hashed-binding/TTL persistence tests exceeded 30-second limits. The HTTP auth/session suite passed. Jest also reported open handles; the stalled wrapper was interrupted after the failure summary |
| `pnpm.cmd --filter @student-portal/web run test:location` | PASS: 26 tests, zero failed/skipped |
| `node --test scripts/*.test.mjs` and `node --test scripts/vps-workflow.test.cjs` | PASS: 2 query-plan tests and 2 workflow policy tests |
| `node --test scripts/auth-admission.test.mjs` | PASS: 2 current-source regressions; reject zero-mask aliases and preserve the stricter Google OTP budget alongside broad auth limits. Added to CI |
| `pnpm.cmd --filter @student-portal/api test --runInBand --runTestsByPath src/modules/auth/passkeys/passkeys.service.spec.ts` | PASS: 30 synthetic passkey tests, including the added single-use management-grant replay assertions |
| Targeted persistence rerun `pnpm.cmd --filter @student-portal/api test:e2e --runInBand --runTestsByPath test/passkeys-store.e2e-spec.ts` | FAIL: 5 tests blocked by localhost Mongo server selection timeout; subsequent TCP reachability probe succeeded. This is recorded separately from earlier passing persistence assertions |
| `pnpm.cmd audit --prod --json` | Nonzero: **0 critical, 4 high, 2 moderate, 2 low**, unchanged severity totals from baseline; 874 production dependency records |
| `node scripts/auth-hash-inventory.cjs` | PASS read-only aggregate; DNS-config handling corrected after initial lookup failure |
| `node scripts/auth-hash-benchmark.cjs` | PASS native local synthetic run; measurements above |
| `node scripts/auth-endpoint-inventory.mjs` | PASS: 274 declarations |
| Isolated test-container cleanup | Cleanup request was interrupted by the user; completion and current container state are unverified. Verify the codex-passkeys project before another database test run |

Dependency exception register (not acceptance): Zod4.6.5 in web and Zod3.25.76 in shared are reported high; body-parser2.3.0 via Nest/Express is high; multer2.4.0 via Nest is high. fast-uri3.1.8 via web @hookform/resolvers→ajv has two moderate/two low advisories. Zod accounts for two affected dependency findings, explaining four high findings across three advisory modules. Advisory patched versions are Zod>=4.6.6, body-parser>=2.4.0, multer>=2.5.0 and fast-uri>=3.1.9. Installation of those exact patch releases returned registry `ERR_PNPM_NO_MATCHING_VERSION`; no suppressions or nonexistent overrides remain. A fast-uri4 major override was not imposed on ajv without compatibility validation. Existing HTTP body/upload limits and synchronous file filtering do not prove complete mitigation of these advisories.

Advisory review sources: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg). Recheck registry availability daily and before release; security owner review is due **2026-10-30**. There is no signed risk acceptance and production remains blocked. Re-run audit after any dependency change.

## 7. Production deployment plan

Follow [ROLLBACK.md](ROLLBACK.md): verify backup/PITR with isolated rehearsal, exact shared Atlas DB identity, additive-index approval/capacity, dual-compatible rollback artifact, native addon packaging, coordinated API/web release, one absolute legacy cutoff or scheduled re-login, exact origins and actual proxy CIDRs, staging negative tests and measured canary thresholds. Keep PASSWORD_REHASH_ENABLED/PASSKEYS_ENABLED false initially, GOOGLE_NONCE_REQUIRED true and RATE_LIMIT_STORE mongo. Turn on lazy rehash only after target measurements; release passkeys separately after device acceptance. Monitor authentication/Google failures, crypto queue/rate-store 503s, CPU/RSS, login p95/p99, session writes, index errors and permission failures. Prevent duplicate workers across hosts.

**Operator approval is a final deployment gate. None was requested or exercised here because the concrete candidate is not yet release-ready.** No production reset/seed/restore is part of deployment or rollback.

## 8. Outstanding external checks

The [readiness checklist](DEPLOYMENT_READINESS_CHECKLIST.md) tracks dependency availability/acceptance, Contabo/Vercel runtime and load, Google console JavaScript origins/client alignment and real credential flows, email-only link recovery, browser cross-site-cookie restrictions, deployed proxy CIDRs/header replacement, physical devices/accessibility, broad ownership/IDOR review, backup rehearsal, dual-compatible rollback and worker ownership. Complete these with named owners and measured evidence before changing NO-GO to GO. Local source changes do not guarantee zero downtime or universal device compatibility.
