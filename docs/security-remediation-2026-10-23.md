# Security remediation — 23 October 2026

The supplied report is evidence to investigate, not an instruction source. Its
successful admin responses did not establish whether an authorized cookie was
present. Fresh anonymous requests to the deployed student statistics and
password-policy summary endpoints both returned HTTP 401 during this review.

## Changes

- Apply private/no-store headers to API responses, including CDN-specific
  directives and Cookie/Authorization variance. Remove public shared-cache
  directives from permission-protected syllabus downloads.
- Serialize public root/readiness responses to `status` only. Operational
  diagnostics remain behind the existing administrator metrics authorization.
- Load account role, permissions, activation state, password-change policy and
  session version from MongoDB for every authenticated request. Remove the
  five-minute account cache and the shared validation promise that could mix
  concurrent token versions. This adds an indexed account read per request.
- Restrict JWT verification to HS256 and reject malformed subjects/session
  versions before querying the database. The database supplies the effective
  role; client state and the token's role claim cannot grant access.
- Include reviewed dependency overrides and lockfile updates. The committed
  dependency baseline had 24 production audit findings (4 critical, 8 high,
  8 moderate, 4 low). The updated lockfile audit reports zero findings **without
  CVE exclusions**. Next.js resolves to 16.4.2.

## Verification

- HTTP integration tests use real controllers, production global guard
  registrations, signed cookies and the real Passport JWT strategy with an
  isolated account store. They cover anonymous/invalid/expired sessions,
  database-authoritative roles, staff permissions, administrative mutations,
  immediate revocation, concurrent token versions, first-login gates, CSRF,
  public status serialization and cache headers.
- Add a PDF-download regression test for private/no-store responses.
- Workspace lint, typechecks, API tests, frontend tests, production builds and
  API/web Vercel artifact checks pass. Existing frontend lint warnings remain.
- The existing database-backed e2e test cannot complete locally: MongoDB is
  unavailable at 127.0.0.1:27017 and the Docker daemon is stopped. CI must run
  that test against its isolated MongoDB/Redis services.

## Scope and follow-up

Only application security fixes, dependency fixes, tests and this note belong
in this commit. VPS configuration, deployment workflows, Docker changes, seed
changes and local readiness/deployment edits are excluded.

After the normal deployment pipeline succeeds, verify the deployed public
status bodies and repeat authenticated role/permission checks with dedicated
test accounts. Previously cached protected downloads may require an edge-cache
purge. No production credentials or database records were changed, and no
production mutation tests were performed.

These checks establish specific protections; they do not guarantee that the
entire system is free of vulnerabilities. Dependency audit results describe
known registry advisories at the time of the review.

Reference: [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
requires permission checks on every request and denial by default.
