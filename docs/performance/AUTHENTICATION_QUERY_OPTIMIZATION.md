# Authentication query optimization

Changed source: `modules/users/users.service.ts`, `modules/auth/services/auth-session.service.ts`, `modules/auth/strategies/jwt.strategy.ts`, `core/metrics/request-query-context.ts`; frontend `providers/auth-provider.tsx` and both protected layouts. All paths are relative to `apps/api/src` or `apps/web/src` respectively.

Previously a successful `/auth/me` used one session existence query and two user queries: JWT policy validation followed by `getMe` calling the credential-capable hydrated `findById`. It now uses the same lean, explicitly projected user record for JWT policy and the `/me` serializer. The projection includes only the response/policy/activity fields used by these paths, never password hashes, national IDs, reset tokens or OTPs. The response allowlist is unchanged.

Heartbeat similarly reuses the JWT user read for activity fields, retaining the conditional update that requires no `lastLogoutAt`. Its successful common path goes from session + user + activity-user + update to session + user + update. A logout racing the update still prevents it from marking the user online. The frontend already bounds heartbeats to visible pages at 60-second intervals with a 30-second route-change guard; those intervals are unchanged.

The memoized promise lives in AsyncLocalStorage for one HTTP request. Separate users, concurrent HTTP requests and subsequent requests never share it. Credential/mutation methods do not use this cache. `/me`, heartbeat and login serialization reuse only this dedicated projected read. Session assertions themselves are not cached. Disabled-account, lock state, stored role/permissions, token version and first-login checks remain enforced by the backend; no Argon2/bcrypt or CSRF settings change.

The global user/session operation counts also include authenticated metrics-summary polling (the dashboard defaults to every five seconds), other protected feature requests, and domain reads. Metrics routes are deliberately excluded from HTTP/request-query instrumentation to avoid self-traffic, while global Mongoose counters still include their guards. Therefore dividing global user/session operations by recorded HTTP totals is not an accurate per-request redundancy calculation. Use the per-response query histogram and route traces. The supplied 3,792/2,661 totals alone do not distinguish necessary checks from duplicate work.

Browser findings and changes:

- One anonymous bootstrap `/auth/me` probe on a fresh public page is expected because the session cookie is HttpOnly. It retains its real 401 response. The 240 supplied 401s cannot all be attributed to anonymous probes from aggregate counts alone.
- `/me` already had `retry:false` and no window-focus refetch. `retryOnMount:false` prevents an errored bootstrap from retrying when its observer remounts.
- Login cancels the initial query and its HTTP request before verifying the new cookie; cookie verification remains necessary for browsers that reject third-party cookies.
- Admin and dashboard layouts wait for auth, role and first-login gates before mounting their headers, sidebars and feature queries. This prevents the previous parallel unauthorized feature traffic. AuthProvider retains redirect responsibility.
- The API interceptor delegates `/auth/me` 401 redirects to AuthProvider's client navigation. Previously its hard redirect reloaded the provider on the login page and produced another anonymous bootstrap 401. Other protected-request 401 handling remains unchanged; the real `/me` status and rejected promise are preserved.

The regression suite verifies per-request query counts, concurrent-request isolation, next-request policy freshness, heartbeat/logout conditions, token versions, revocation, roles, first login and CSRF. These are correctness/query-count results, not measured production latency improvements. Rollback: restore the prior image; no cache invalidation or data migration is required.
