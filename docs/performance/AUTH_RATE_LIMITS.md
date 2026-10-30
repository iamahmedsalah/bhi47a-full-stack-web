# Login 429 incident: 30 October 2026

The supplied Prometheus snapshot reports 28,793 rate-limit blocks: `auth-ip`
23,930, `quiz-submit` 4,285, and `google-auth` 578. The route CSV reports:

| Route | Calls | HTTP 429 |
| --- | ---: | ---: |
| Student login | 20,063 | 19,226 (95.8%) |
| Google nonce preparation | 5,083 | 4,615 (90.8%) |
| Quiz draft save | 9,070 | 2,729 |

These are cumulative observations, not concurrent-user counts. They cannot
distinguish load tests, retries, attacks, and legitimate users by themselves.

## Cause and changes

Previously, all limited authentication routes shared 60 requests per IP per
15 minutes. All Google routes, including nonce preparation on page load,
additionally shared 12 requests per IP per 15 minutes. Several open login tabs
could consume this budget without submitting credentials. Quiz start, draft,
exit and submit shared 30 requests per IP per minute.

Every student on a campus NAT shares a public IP. If proxy trust is missing,
all visitors can additionally appear as the reverse proxy itself. The repository
production environment template had an empty `TRUST_PROXY_CIDRS`; the supplied
exports do not prove what is configured on the running server.

The revised policy is:

| Operation | Budget | Identity |
| --- | --- | --- |
| Credential traffic aggregate | 2,400/minute | Trusted client IP |
| Google nonce preparation | 1,200/minute, independent of credential traffic | Trusted client IP |
| Google login | 1,200/minute plus aggregate | Trusted client IP |
| Passkey login options/verify | 1,800/minute plus aggregate | Trusted client IP |
| Student/admin password login | 8/15 minutes plus aggregate | Target account |
| Password recovery / reset OTP | 5/15 minutes plus aggregate | Target account |
| Google link actions | 12/15 minutes | Verified user |
| Google link OTP | Additional 5/15 minutes | Verified user |
| Quiz start/exit/submit | 30/minute | Verified user |
| Quiz draft saves | Separate 60/minute | Verified user |

Other protected limits (password changes, security operations, passkey management,
student complaints, admin uploads/messages/exports, student AI chat) also use the
verified user. Public complaint and FAQ policies retain their existing behavior.
Authenticated rules run in a global guard after JWT/session, CSRF, role,
permission and origin checks. Anonymous rules run in middleware. No identity is
accepted from an unverified token, forwarded header, or body for protected rules.
Mongo counters remain atomic and shared across API replicas, and fail closed
with HTTP 503 on store failure. Existing account lockout remains enabled.

Google nonce requests now respect the API `Retry-After` deadline and stop periodic
refreshes while the tab is hidden. Nonces remain single use and origin bound.
Visible tabs check freshness each minute and refresh before the five-minute
expiry; the old three-minute check could leave an expired flow between minutes
five and six.
Rate-limit keys use a new `v2` namespace so old 15-minute counters do not inherit
the revised windows. Old documents expire through the existing TTL index.

## Production rollout

1. Verify Nginx is the only public ingress. The supplied Compose publishes API
   and web ports only on `127.0.0.1`. Preserve that restriction. Nginx must
   overwrite `X-Forwarded-For` with `$remote_addr`, as in `deploy/nginx/portal.conf`.
2. Find the API container's bridge gateway and corroborate it against the `ip`
   field in an anonymous `/api/auth/me` 401 application log:

   ```sh
   docker inspect "$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q api)" --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{println}}{{end}}'
   ```

   For example, **only if the observed source is `172.20.0.1`**, set
   `TRUST_PROXY_CIDRS=172.20.0.1/32` in the existing `.env.prod`. Docker may translate
   a host-loopback connection to its bridge gateway; setting only `127.0.0.1/32`
   can be insufficient. Do not trust all addresses or all private networks.
   Recheck this source whenever recreating the Docker network.
3. Update these values in the existing `.env.prod`; preserve secrets, database
   URI, database name and other deployment settings:

   ```dotenv
   AUTH_IP_RATE_LIMIT=2400
   GOOGLE_NONCE_RATE_LIMIT=1200
   GOOGLE_AUTH_RATE_LIMIT=1200
   PASSKEY_LOGIN_RATE_LIMIT=1800
   GOOGLE_LINK_RATE_LIMIT=12
   QUIZ_SUBMIT_RATE_LIMIT=30
   QUIZ_DRAFT_RATE_LIMIT=60
   RATE_LIMIT_STORE=mongo
   ```

   The first four limits are now per minute. Replace old low overrides such as
   `GOOGLE_AUTH_RATE_LIMIT=12` or `AUTH_IP_RATE_LIMIT=60` if present.
4. Deploy the reviewed code with the project's normal release process, or on
   the VPS run:

   ```sh
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --wait api web
   ```

   Rebuilding the web app is necessary for the nonce refresh changes. Do not
   flush Redis, delete rate-limit collections, reset users, or seed the database.
5. From two different external networks, make one anonymous `/api/auth/me`
   request each and verify application logs show distinct public client IPs.
   Confirm a real student and staff login, cookie persistence, logout, and Google
   login. Opening the login page must not reduce the password login budget.
   Verify a deliberately exhausted synthetic account returns 429 with
   `Retry-After`, while a different account on the same network can log in.

`GET /api/auth/me` returning 401 before login is the anonymous session probe.
A 401 after a successful login needs separate cookie/session investigation;
do not suppress unauthorized responses or remove authorization checks.

## Capacity for 10,000 students and staff

10,000 registered users is different from 10,000 simultaneous login attempts.
10,000 arrivals over 15 minutes average 11.1 logins/second. One nonce plus one
Google login per arrival generates roughly 22.2 requests/second. With one public
campus IP the nonce default supports 20 preparations/second on average; if the
expected peak exceeds that, size its budget from that arrival rate and a measured
burst margin. Defaults are starting budgets, not evidence of server capacity.

Before launch, use staging with synthetic **distinct accounts**, campus NAT and
multiple external IPs. Ramp 50, 100, 250, 500 active users and then the actual
expected peak, with realistic think time. Cover password/Google login, dashboard
loads, quiz autosave and submissions together. Do not repeatedly hammer one real
account: that measures abuse prevention and triggers lockouts, not campus capacity.

Track per-route p95/p99, 429 by policy, 5xx, Mongo connection checkout wait,
query time, CPU/event-loop delay and memory. Tune network budgets from measured
arrivals while retaining the account and user limits. Keep database indexes and
shared counters healthy, move sustained background jobs to workers, and add API
replicas/database capacity only when measurements identify those bottlenecks.
If shared Mongo rate-counter writes become a bottleneck, implement and test an
atomic shared Redis store; changing `RATE_LIMIT_STORE` to `redis` is not currently
supported. In-process memory limits are intentionally prohibited in production.

The exported database table includes auth session reads averaging 236 ms and
user reads averaging 209 ms in its observation window. Those deserve staging
investigation independently of admission limits. The supplied snapshots and
policy tests do not certify 10,000 concurrent users.

References: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/),
[HTTP 429 and Retry-After](https://www.rfc-editor.org/rfc/rfc6585.html#section-4).

## Patch verification

- Workspace lint: passed, with 281 existing frontend warnings and no errors.
- Workspace typecheck and API `typecheck:e2e`: passed.
- API unit tests: 66 suites, 519 tests passed. Includes the 10,000-account
  shared-IP policy simulations and real JWT/HTTP quota isolation regression.
- Google nonce, authentication admission, E2E runner safety and VPS workflow
  policy checks: 11 Node test cases passed. The new Google checks run in CI.
- Production API/shared/web builds: passed. API Vercel runtime configuration and
  the generated web root-route manifests passed their audits.
- End-to-end: four suites (16 cases) passed in the initial run. Browser auth
  acceptance initially hit quotas because it reused accounts across cases.
  Resetting only those generated fixture accounts' action counters between cases
  corrected the isolation issue; all 14 authentication/browser cases then passed
  on the focused rerun, using local MongoDB. Production budgets were preserved.

An additional optional `tsc -p tsconfig.spec.json` sweep found existing type
errors in unrelated test fixtures (advising, JWT guard, Google containment and
session policy). The repository's declared workspace and E2E typechecks passed.
No production deployment or real Google account login was performed here.
