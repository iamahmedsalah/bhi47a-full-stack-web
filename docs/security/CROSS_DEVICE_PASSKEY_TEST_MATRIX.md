# Passkey acceptance matrix

Current policy: bcrypt without login rehash or password migration. Production passkeys remain off until staging acceptance.

## Automated browser acceptance: PASS

The exact root command `pnpm run test:e2e -- --runInBand` passed **18/18 tests in 11.578 seconds**: 6 HTTP/session/API-compatibility tests, 7 browser cases and 5 Mongo persistence tests. See [current report](BCRYPT_ADMIN_STAFF_PASSKEY_REPORT.md) for workspace results.

Environment: Windows x64; Playwright 1.64.1; matching headless Chromium 156.0.8078.4; fresh private contexts; real loopback frontend and API; isolated MongoDB. Actual navigator.credentials, SimpleWebAuthn verification, cookies, guards and persistence execute. The page is a protocol harness; the production portal UI is not rendered by this test.

| Browser case | Result | Coverage |
| --- | --- | --- |
| Student, platform transport | PASS | Existing workflow preserved |
| Admin, platform transport | PASS | Enrollment, management login and canonical session |
| Admin, USB transport | PASS | External-key protocol with required UV |
| Staff, platform transport | PASS | Existing staff account and role preserved |
| Staff, USB transport | PASS | Management authentication with external-key protocol |
| UV unavailable, then restored | PASS | Reject unauthenticated assertion; fresh attempt succeeds |
| Cancellation, then fresh ceremony | PASS | No session after cancellation; retry and fallback work |

Role/transport cases also reject enrollment without step-up, registration owner injection, wrong student/management area, assertion replay, rename-grant replay and deletion with the wrong grant. They rename/remove the credential, reject the removed key and verify password fallback after removing the last passkey. Virtual backup flags do not prove real cloud synchronization.

Persistence tests retain 20 concurrent increments through two rate stores, window reset, hashed bindings, TTL index, atomic single-use challenges, expiry before TTL deletion, credential uniqueness and zero-counter revision serialization. Additional real-signature unit tests cover RP/origin/signature/ownership and account-policy failures.

## Physical-device staging matrix

Virtual user verification is not evidence of a biometric sensor, real PIN prompt, hardware isolation or cloud sync. No physical-device result has been fabricated.

| Actual device/browser | Status | Required evidence |
| --- | --- | --- |
| iPhone/iPad Safari, Face ID/Touch ID | NOT TESTED | Register, login, cancel, remove, recovery |
| Android Chrome, platform passkey | NOT TESTED | Screen lock, enrollment/login, cancellation and sync |
| Windows Chrome/Edge, Hello biometric or PIN | NOT TESTED | Both real verification methods, multiple credentials |
| macOS Safari/Chrome, Touch ID | NOT TESTED | Enrollment/login, cancellation and recovery |
| Firefox/Linux, physical FIDO2 key | NOT TESTED | Actual browser support, USB/NFC, required UV |
| Cross-device QR/Bluetooth | NOT TESTED | Supported browser pair, proximity and cancellation |
| No biometric sensor / PIN-only / security-key-only | NOT TESTED | Actual verification and password fallback |
| Real private/incognito mode | Virtual private contexts PASS; physical NOT TESTED | Browser restrictions and credential availability |
| Arabic/English portal, keyboard, screen reader | Source strings checked; UI NOT TESTED | Focus, labels, RTL/LTR, dates and error announcements |
| Device clock skew / timeout / resume | Server expiry tested; physical NOT TESTED | Expired ceremony rejects; fresh retry succeeds |

## Manual staging procedure

Use synthetic student, admin and staff accounts. Record tester/date, OS/browser versions, exact origin/RP, authenticator type, verification method and PASS/FAIL/UNSUPPORTED. Never record passwords, OTPs, cookies, private keys or biometric data.

1. Password login -> account security -> add passkey with fresh password proof.
2. Logout -> passkey login -> correct dashboard/role. Staff without a permission must still be denied its protected admin action.
3. Cancel, deny UV and expire a ceremony; verify no unintended session and successful fresh retry.
4. Rename/remove with fresh proof; reject old grants/assertions. Removing the last passkey must leave password recovery.
5. Repeat in Arabic/English and private mode. Test lost-device and authorized reset/forced-password-change recovery.
6. Enable production only after a named staging owner approves the actual supported combinations.

Automation references: [Chromium WebAuthn protocol](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/) and [Playwright CDP sessions](https://playwright.dev/docs/api/class-cdpsession).
