# Passkeys architecture and operations

> Follow-up: [security remediation](security/AUTH_REMEDIATION_REPORT.md) adds revocable sessions and single-use operation-bound management grants. See the [current device matrix](security/CROSS_DEVICE_PASSKEY_TEST_MATRIX.md) and [rollback runbook](security/ROLLBACK.md). Earlier flow descriptions remain historical where superseded.

Feature is optional and disabled by default. It authenticates existing accounts; it never creates accounts or replaces RBAC. No biometric samples, private keys or authenticator secrets are requested or stored. Local user verification can use a PIN, password, biometric or security key.

## Code and protocol

`apps/api/src/modules/auth/passkeys/` is registered inside the existing `AuthModule` to reuse its session provider and all global guards without a circular auth module dependency. `PasskeysController` delegates to `PasskeysService`; DTO validation uses the existing global whitelist/forbid pipe. SimpleWebAuthn server 14.0.3 and browser 14.0.0 are pinned. API signatures were checked against installed declarations and the official [server](https://simplewebauthn.dev/docs/packages/server) and [browser](https://simplewebauthn.dev/docs/packages/browser) documentation.

`AuthSessionService.generateToken` now signs both Google and passkey JWTs with the existing claims. Passkey success calls `completeCredentialLogin`, which reuses `UsersService.resetAttemptsAndUpdateLastLogin`, `generateToken` and the safe `getMe` projection. Controller reuses `setCookieToken` and returns `{user, csrfToken}`. The frontend AuthProvider confirms the cookie with `/auth/me`, fills the same TanStack Query cache and uses existing role redirects. There is no new refresh flow or token storage.

| Method / `/api/auth/passkeys` suffix | Policy |
| --- | --- |
| `GET capabilities` | Public, no-store; server `enabled` and effective `studentLoginEnabled` booleans |
| `GET settings` | Admin only; persisted student login setting, no-store |
| `PATCH settings` | Admin only, JWT + CSRF + first-login guards, allowed browser Origin, required boolean `studentLoginEnabled` |
| `POST reauthenticate` | Existing JWT + CSRF + first-login guards, exact Origin, current password and lockout policy |
| `POST register/options` | Same guards + recent session-bound reauthentication |
| `POST register/verify` | Same checks, owner/session/origin-bound flow, atomic consumption, library attestation verification |
| `POST login/options` | Public, rate limited, exact Origin; discoverable credential request |
| `POST login/verify` | Public, rate limited, exact Origin, opaque flow secret in `x-passkey-flow`; cryptographic assertion verification |
| `GET /` | Current user's credential metadata only |
| `PATCH :id`, `DELETE :id` | Owner-scoped ID filter, recent password verification, existing guards and exact Origin |

Login options returns `{flowId, flowToken, options}`. The flow token is a random 256-bit secret; only its SHA-256 hash is persisted. The UI retains protocol values in the current async action, never localStorage. Custom-header verification plus exact Origin and credentialed CORS prevent unsolicited browser login handoff. Separate random flow IDs permit multiple tabs.

Registration requires discoverable credentials and `userVerification: required`; assertion verification enforces UV and user presence through the library. The opaque stable 32-byte user handle is SHA-256 of the RP ID and Mongo user ID, not an email or national ID. Login checks the returned user handle against the stored handle. Neither a browser userId nor an email can select the privileged account.

## Mongo persistence and races

Admins can enable or hide student passkey login under **Admin → Security**. The `passkey_settings` collection stores a singleton `_id: 'global'` with `studentLoginEnabled`; an absent document defaults to true to preserve existing behavior. The document is created on the first save, so no migration or seed is needed. Server `PASSKEYS_ENABLED` remains the upper-level gate. Changes are logged with the acting admin ID.

Disabling hides the student login button (capabilities refresh on mount/focus and every 30 seconds), rejects student login options, and rejects student credentials during verification, including flows created before disabling or through an unspecified login area. Management login is unchanged. Existing credentials and credential management remain available, so re-enabling restores sign-in without re-enrollment. Existing sessions and password/Google login are unaffected.

New `passkey_credentials` collection: credential ID (unique index), existing user ID (lookup index), opaque handle, public COSE key bytes (`select:false`), counter, revision, transport hints, backup/device state, friendly name, creation and last-used timestamps. Lists project only metadata and cap at 100. Enrollment excludes existing IDs and checks a 20-key quota (quota is a soft bound under simultaneous enrollments).

New `passkey_flows` collection: unique random flow ID, purpose, hashed binding, optional user ID, exact origin, challenge (`select:false`), expiry. TTL index on `expiresAt` with zero delay; lookup index on purpose/user/binding/expiry. Registration/login expiry is three minutes; password reauth grants last five minutes. Every verification atomically deletes a matching unexpired flow using `findOneAndDelete`; TTL cleanup is never the authorization decision. A failed protocol verification consumes its challenge. A wrong flow/session binding does not consume someone else's request.

Registration DB uniqueness prevents duplicate credentials across users. Assertions use the library's counter policy (valid zero counters remain valid) and compare-and-swap both counter and revision, including zero-counter credentials. Conflicting sign-ins fail safely and can be retried. Deletion is physical revocation; a deleted row cannot be used for the compare-and-swap. As with all existing login methods, revocation or account state can race with a request already in flight; a completed login uses current JWT/tokenVersion policy. Removing a key does not revoke previously issued JWTs.

With the feature enabled, initialization calls `createIndexes` only for the two new collections and fails startup if their required indexes cannot be created. No `syncIndexes`, collection deletion, backfill or user-document migration. For deployments with managed index permissions, provision these declared indexes before enabling the feature. Changing the RP ID changes user handles and makes credentials for the old RP unusable; plan RP identity before enrollment.

## Environment and topology

Local API environment:

```dotenv
PASSKEYS_ENABLED=true
PASSKEY_RP_ID=localhost
PASSKEY_ORIGINS=http://localhost:3000
PASSKEY_RATE_LIMIT=20
```

Use the website at **localhost**, not a LAN address or `127.0.0.1`, with this configuration. Non-localhost origins require HTTPS. The browser must support WebAuthn and be in a secure context. API `CLIENT_URL` must also allow the configured website origin, and existing credential cookies/CSRF must work.

Staging/production: explicitly set `PASSKEY_RP_ID` to the durable website hostname and `PASSKEY_ORIGINS` to comma-separated exact HTTPS website origins (scheme + hostname + optional port, no paths/trailing slash/wildcards). No production RP value is inferred from request headers or API domains. At least one origin must match the RP host exactly; any additional origins must be that host or its subdomains. Do not configure a public suffix such as `vercel.app`. Use a stable dedicated staging hostname/RP instead of wildcard previews. Preview builds should remain disabled or use a separately configured exact preview host and isolated database.

The same policy works with Vercel or a reverse proxy only after exact website origin, TLS, CORS and cookie behavior are verified. Existing `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, and `Secure`/`HttpOnly` settings are reused. Third-party-cookie blocking can still prevent cross-site API sessions; AuthProvider surfaces that existing failure. Do not weaken WebAuthn checks to compensate.

Passkey rate rules use the existing distributed Mongo limiter and Express/socket address rather than trusting arbitrary forwarded-for headers. Behind a proxy, addresses may be shared; confirm edge rate limiting and correct, sanitized trusted-proxy configuration before rollout. Default is 20 unsafe passkey requests per address per five minutes across options/verification/management. TTL cleanup plus rate limits bound temporary records per enforced identity; capacity and distributed bot traffic still require monitoring.

## UI, recovery and observability

Student and admin login forms contain an optional button driven by `/capabilities`; existing password/Google controls stay usable after failures or cancellations. Student Profile -> Password & Security contains the manager; staff/admin can use the header's Passkeys link at `/{locale}/admin/security`. Dialogs require the current portal password for every operation, with explicit removal confirmation. All current accounts have a required passwordHash, so deleting the final passkey leaves a proven fallback. Google-only step-up is intentionally not inferred from an old session; a Google user uses their existing portal password or recovers it first. Forced password change must be completed before enrolling/managing or signing in with a passkey.

Arabic/English messages use next-intl, password fields are LTR, dialogs set direction explicitly, names use bidi isolation, and dates use Africa/Cairo. Unsupported devices, cancellation, duplicate enrollment and generic network/server errors present recovery guidance. No automatic/conditional WebAuthn prompt is used.

Structured events: `passkey_added`, `passkey_removed`, `passkey_login_success`, `passkey_login_failed`, `passkey_reauth_failed`; only internal user ID where known, never credentials/assertions/challenges/passwords/tokens. Existing request metrics/correlation middleware and redacted Mongo query-shape telemetry remain in place. Login successes/failures feed existing metrics. Confirm centralized log retention/access and incident alerts before rollout.

## Rollout and rollback

1. Keep default false; review open audit risks and verify password recovery/email delivery.
2. Configure isolated staging, exact RP/origins, TLS, cookies and distributed rate limiting. Run automated checks and the physical-device checklist.
3. Enable only an isolated internal pilot deployment first. This boolean flag is deployment-wide, not a per-user percentage cohort.
4. Monitor login success/failure, 429/503 rates, latency and fallback completion; broaden enablement only after acceptance.
5. Roll back by setting `PASSKEYS_ENABLED=false` and restarting/redeploying the API. Capabilities hides controls and all passkey operations reject. Preserve both collections and the RP configuration for re-enable; existing passwords, Google, JWTs and user documents are unaffected.
