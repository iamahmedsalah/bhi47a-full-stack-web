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

## Admission tracking and student-code review

New receipts use `ADM-` plus 12 uppercase characters and a 16-character tracking
secret. The alphabet excludes I, O, 0 and 1; the secret retains 80 bits of HMAC
output and the existing tracking rate limits. Spaces, grouping hyphens and
lowercase are accepted for compact receipts. Existing 24-hex references and
case-sensitive 43-character secrets remain valid, including a submission retried
after deployment. The account login password is unchanged.

The audit chooses a policy for the selected academic year before considering
another year's policy claiming the same starting number. When an account and
profile agree on a student's code but registry metadata conflicts, the audit
shows that observed student's name/profile link while retaining `REQUIRES_REVIEW`.
It shows the profile and registry years separately. This does not rewrite an
existing student's identity, code, registry ownership, or historical year.

New allocation follows the ending academic year: 2026-2027 starts with 27 and
2027-2028 starts with 28. A saved older mapping still requires an administrator's
reviewed correction. On `CODE_YEAR_PREFIX_MISMATCH`, approval now opens that preview
directly; applying it requires a reason and confirmation and affects future
allocation only. Its sequence stays above the saved counter and existing registry
assignments, including assignments under the old starting number. It returns to
the open application without submitting approval.
Review and confirm approval again afterward. A stale application offers a reload
action, and an existing student identity reports identity review rather than a
misleading stale-request error. No automatic production data migration is run.

## Analytics workbook selection

The analytics export dialog offers the complete workbook or one or more selected
analysis worksheets. The existing export permission and endpoint remain in place.
`sheets` accepts a validated comma-separated list of stable report identifiers;
omitting it preserves the complete workbook. Only required datasets are loaded
for selected sheets. Detailed submissions can be selected independently or added
to the complete workbook; a requested empty sheet retains its column headers.

Levels 1 and 2 use General. Levels 3 and 4 offer BIS, Accounting, or all
specializations. Returning to an earlier level clears the specialization filter.
Exports match canonical and legacy department names without rewriting stored
profiles. Academic year is optional and accepts any valid consecutive-year range.
Student enrollment and department shares use the filtered students as their
denominator. Institute summary KPIs and complaints totals retain their global
scope, which is explained in the dialog. Arabic/English labels, RTL worksheets,
teal headers and binary `.xlsx` downloads are preserved. No migration is required.
