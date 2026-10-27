# Argon2id migration report — 2026-10-27

> CANCELED by the user's later instruction. Argon2 and lazy migration have been removed. No production migration occurred. This file is historical; use [the current bcrypt policy and implementation report](BCRYPT_ADMIN_STAFF_PASSKEY_REPORT.md).

Status: implemented locally; production migration **not started**. No plaintext password export, blanket reset, production password write, seed, restore or database replacement was performed.

## Evidence and compatibility

`scripts/auth-hash-inventory.cjs` performs read-only aggregations and prints format/cost counts only. The first live aggregate at **2026-10-27T07:19:27.972Z** found **7,980 bcrypt-2b account hashes**. A repeat at **2026-10-27T08:48:13.308Z** confirmed the same total: **7,961 at cost 10 and 19 at cost 12**, both within the verifier's compatibility bounds. No other account-hash category was returned. This measures account passwords, not historical backups, OTPs or every national-ID field. No hashes, identifiers or account rows were exported. Re-run the aggregate at rollout to detect drift.

`apps/api/src/security/password-hasher.ts` is the shared injectable policy and singleton used by account writers/verifiers, student import, staff management, national-ID complaint verification, recovery/link OTPs, passkey password step-up and local seed tooling. New values use native `argon2` with **Argon2id, v19, memoryCost 19456 KiB, timeCost 2, parallelism 1**, and independent library-generated salts. PHC parameters are parsed by name because the installed library serializes `m,p,t`; the verifier also accepts valid `m,t,p` ordering. Duplicate, malformed, unknown or excessive-cost encodings fail generically.

Legacy bcrypt `$2a$` and `$2b$` are supported at costs 4–14. `$2y$` is deliberately unsupported by this Node verifier; it was absent from the aggregate and needs a compatibility review if encountered. Unknown formats require account-specific investigation, never automatic credential replacement. Existing student trim/Arabic-digit behavior is retained; administrator passwords remain exact. Inputs over 4,096 UTF-8 bytes are rejected at the hashing boundary; HTTP DTOs impose tighter limits. A bcrypt password over 72 bytes verifies with historical semantics but is **not lazily upgraded**, since its suffix was never authenticated.

Successful recognized verification can upgrade through `updateOne({_id, passwordHash: oldHash}, {$set:{passwordHash:newHash}})`. Failed verification never upgrades. A concurrent reset wins the compare-and-swap; rehash persistence errors log only a sanitized event and do not block otherwise successful login. Rehash alone never changes tokenVersion, passwordChangedAt or forced-change policy. `PASSWORD_REHASH_ENABLED=false` is the default; new writes remain Argon2id regardless. Retain dual verification through rollout and rollback.

Normal imports explicitly select hidden credential fields and preserve existing password, activation, locks and forced-change state. Only explicit true/1 reset values trigger a credential reset; string `false` does not. New accounts receive separate salts. Explicit resets use an old-hash compare-and-swap and increment tokenVersion. Removed plaintext national-ID authentication fallbacks intentionally require stored-password verification; affected corrupt/mismatched accounts need approved recovery, not bypass restoration.

## Local measurements

Command: `node scripts/auth-hash-benchmark.cjs`. Synthetic data only, Windows x64, Node v24.15.0, measured 2026-10-27T08:23:27.905Z. Twelve sequential samples per operation, six batches for two concurrent writes. RSS is sampled total process RSS, not an isolated per-operation allocation or a proven memory ceiling.

| Operation | p50 | p95 | Peak process RSS |
| --- | ---: | ---: | ---: |
| New Argon2id hash | 28 ms | 29 ms | 76.6 MiB |
| Argon2id verification | 29 ms | 37 ms | 76.8 MiB |
| bcrypt cost 10 verification + Argon2id upgrade | 83 ms | 88 ms | 76.9 MiB |
| Two concurrent Argon2id writes, batch latency | 35 ms | 36 ms | 96.4 MiB |

One shared limiter permits two active crypto jobs and 32 queued jobs per process; overflow returns a generic 503. Multiple containers/serverless instances each have their own limiter, so fleet memory and endpoint admission still require deployment load testing. Encoded legacy parameters are bounded before native verification. The synthetic benchmark does not measure HTTP, Mongo latency, cold-start packaging or production request throughput.

## Release and rollback

Contabo Linux image and Vercel native-addon load, CPU/RAM budgets, p95/p99 concurrent logins, import contention and cold-start behavior are **NOT TESTED on the actual targets**. Keep lazy migration off until measured. Canary new writes first on a dual-verifier release; monitor format-count drift, authentication errors, crypto queue 503s, RSS, CPU and login latency. Then enable lazy migration gradually with an operator-approved configuration change. Never attempt bulk bcrypt-to-Argon2 conversion without the user's verified password.

Rollback must retain the new Argon2 verifier. A previous bcrypt-only release cannot authenticate accounts already written with Argon2id. Disable lazy rehash and passkeys before routing traffic to a reviewed dual-compatible release; do not downgrade hashes, restore an old database or clear revocation records. See [ROLLBACK.md](ROLLBACK.md).

Policy references: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [node-argon2](https://github.com/ranisalt/node-argon2). Automated test results are recorded in [AUTH_REMEDIATION_REPORT.md](AUTH_REMEDIATION_REPORT.md).
