# Authentication baseline — 2026-10-27

This baseline was recorded before remediation code changes. The referenced master prompt is an execution specification, not evidence that a vulnerability or deployment exists. `docs/auth-audit.md`, `production-deployment-guide.md` and `production-optimization-and-debugging-phases.md` were compared with source. The historical `auth-audit(1).md` filename is not present; the repository's auth audit is used instead. Prior performance claims are not current measurements.

## Found dataflows

Password -> `AuthLoginService.studentLogin/adminLogin` -> `UsersService.validatePassword` -> bcrypt -> `AuthSessionService.generateToken` -> cookie + CSRF. Google GIS popup/FedCM credential -> Google ID-token verifier, then bearer userinfo fallback -> subject **or email** lookup -> same JWT cookie. Passkey assertion -> library verification + Mongo atomic flow consumption + owner/counter checks -> existing session issuance. JWT strategy reloads active state, tokenVersion, roles and permissions on each request; CSRF, first-login, role and permission guards are global. Logout clears cookies without server revocation. There is no active refresh-token API.

## Reproduction matrix

| ID / priority / status | Evidence before changes | Exploit preconditions and reproduction | Fix / regression risk |
| --- | --- | --- | --- |
| GOOGLE-01 / P0 / confirmed | `auth-login.service.ts:510` verifier catch calls Google userinfo | A bearer access token can reach identity lookup after ID-token validation fails. Mock verifier rejection + successful userinfo must no longer authenticate. | ID-token-only validation; intentional rejection of legacy access-token clients, secure relink fallback |
| GOOGLE-02 / P0 / confirmed | `users.service.ts`, `findLinkedGoogleAccount`: `$or` subject/email | Reassigned verified email may resolve an existing different subject. Test email-only/mismatched-sub lookup. | Login by immutable subject only; email-only records require authenticated secure relink |
| SESSION-01 / P1 / confirmed | `auth-session.service.ts:74`, controller logout | A copied valid cookie JWT survives logout. Test token after logout. | Persist hashed random session identity; revoke logout; bounded explicit old-token grace |
| CSRF-01 / P1 / confirmed | `guards/csrf.guard.ts` optional-auth exemption | Authenticated logout skips CSRF. | Enforce CSRF for authenticated optional routes; anonymous cookie clearing remains possible |
| HASH-01 / P1 / confirmed | `users.service.ts:160,201,209`; staff service; importer; seed | Password hashes and comparison are scattered bcrypt calls; hashes with other formats cannot be verified. | Central Argon2id new writes + recognized legacy verification, bounded work, lazy CAS migration |
| HASH-02 / P1 / confirmed | `auth-login.service.ts:84-96` | First-login plaintext national-ID fallback replaces a failing hash without CAS; can conflict with a reset. | Remove bypass; legitimate default credentials must verify their stored hash; report compatibility correction |
| IMPORT-01 / P1 / confirmed | `student.importer.ts:99-194` | Existing user query omits select:false passwordHash/nationalId, so password-preservation condition cannot succeed. Normal import can rewrite existing credentials. | Explicit projection; preserve existing passwords unless an explicit reset is requested; independent salts |
| IP-01 / P0 / confirmed | `rate-limit.rules.ts:13` | Caller can rotate X-Forwarded-For to evade IP keys. | Express/socket trusted address only; opt-in exact trusted proxy CIDRs; dual IP/account rules |
| CORS-01 / P1 / confirmed | `config/cors-origins.ts:25` | Credentialed wildcard preview origins widen the trust boundary. | Exact origin policy; deployment origin changes documented, no real environment edits |
| STEPUP-01 / P1 / confirmed | Google link handlers; passkey `requireRecent` uses reusable exists query | Stolen JWT can link Google; passkey password grant reusable for five minutes. | Single-use operation/session-bound grants and accessible bilingual reauthentication |
| AUTHZ-01 / P1 / already-fixed in sampled boundaries | `jwt.strategy.ts`, global role/permission/first-login guards; security integration tests | JWT role cannot override current DB role; disabled/tokenVersion-stale user rejects. | Preserve and extend regressions; static endpoint inventory is not proof of every ownership query |
| CACHE-01 / P2 / already-fixed | `security-headers.middleware.ts` | Authenticated data has private/no-store headers and cookie variance. | Retain; validate regression |
| DEP-01 / P1 / requires fresh audit | Existing lockfile and prior advisory report | Old report is not current advisory evidence. | Run baseline/final production audits; patch compatible affected dependencies |

## Password writer/verifier inventory

Account writers: `UsersService.createUser/updatePassword/resetPasswordToNationalId`, staff create/reset, student importer, and local-only seed. `AuthPasswordService` delegates account password writes but independently hashes/verifies recovery OTP; Google-link OTP uses bcrypt in login/users services. National-ID hashes are also verified by public complaint authentication, so migration must update that verifier too. Passkey step-up delegates to `UsersService.validatePassword`. Existing student password trim/Arabic-digit normalization and admin exact-password semantics must remain consistent. Password reset/change increments tokenVersion; staff resets/deactivation do likewise. Actual stored hash counts and unknown formats require a read-only aggregate; no hashes or account rows may be exported.

## Baseline verification and external boundaries

Baseline install/lint/typecheck/unit/build commands were launched before implementation and are recorded in `outputs/security-baseline.log`; final reports will record their actual outcomes. Previous session results are historical only. Test DB URIs are explicitly localhost test databases; root `.env` is never used as a write target for tests.

Atlas backups, live hash-format counts, production Google configuration, actual reverse-proxy source CIDRs, Contabo/Vercel target benchmarks, staging users and real devices are **not verified** by source inspection. Deployment guide states both targets share the same Atlas database name and prohibits seeding/reset/restoring. No deployment, traffic switch, production console/secret/worker change is part of this local implementation. Production go/no-go remains blocked until those external gates are verified.

## Planned reviewable phases

1. Contain Google subject/audience and forwarding/origin weaknesses; preserve password/passkey fallback and document intentional legacy rejection.
2. Add one bounded Argon2id abstraction and migrate every account/OTP/national-ID writer and verifier; perform successful-login CAS rehash only, without changing tokenVersion or password-change state.
3. Add session persistence/revocation and explicit legacy cutoff, align cookie/JWT expiry, preserve DB authorization and introduce single-use sensitive-operation step-up.
4. Extend passkey grants, regression/negative tests, aggregate inventory and local crypto benchmark tooling. Run CI checks, dependency audit, document blocked integration/device/production checks and rollback.
