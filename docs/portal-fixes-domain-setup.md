# Domain setup for admissions and passkeys

For the `bhi47.app` production deployment:

- API: `PASSKEYS_ENABLED=true`, `PASSKEY_RP_ID=bhi47.app`, `PASSKEY_ORIGINS=https://bhi47.app`, `WEB_BASE_URL=https://bhi47.app`, and include that exact origin in `CLIENT_URL`.
- Preserve the existing RP ID if it already covers the new hostname. The API also trusts an explicitly configured canonical `WEB_BASE_URL` within that RP. Request headers never create trusted origins.
- Credentials registered for an unrelated old RP cannot be transferred by changing DNS or widening an origin allowlist. Keep password access available and register a new credential on the new RP; do not delete stored credentials during deployment.
- Create/configure a Cloudflare Turnstile widget authorizing `bhi47.app` (and `www.bhi47.app` only if it serves the application). Set the widget's public **site key** in web build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Set its separate **secret key** in API variable `TURNSTILE_SECRET_KEY`. Set API `TURNSTILE_HOSTNAMES=bhi47.app`.
- Rebuild the web application after changing `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; changing a running container's environment does not update the compiled browser bundle.
- Cloudflare client error `400020` means invalid site key, not an expired user token. The deployment example previously reused one value for site and secret; the example now leaves both keys blank for configuration.

Validate admissions in both languages, including CAPTCHA success, expiry and manual retry. For passkeys, check the failed request's response body: `PASSKEY_ORIGIN_NOT_ALLOWED` indicates domain configuration, `Password verification failed` indicates password verification, and `Invalid CSRF token` indicates cookie/token synchronization. The client retains the existing single CSRF refresh/retry behavior.

Staff course selections use existing course assignment fields and are saved with the account and audit event in a MongoDB transaction. Production needs the existing replica-set deployment used by admissions. No collection migration or rewrite is required.

Analytics exports default to all years, include legacy string and ObjectId references, respect term/course filters, and leave unrecorded GPA, earned hours and quiz averages blank. They do not synthesize grades or a GPA when the underlying academic record is missing.
