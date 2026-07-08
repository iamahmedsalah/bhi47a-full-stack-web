# Security And Production Hardening Implementation Plan

This document converts the security/debugging audit into an implementation checklist for improving the Student Portal before production use.

## Priority 0: Immediate Secret Containment

### Problem

Live credentials and private keys are present in the local `.env` file, including database, JWT, email provider, Firebase admin, Cloudinary, Redis, and default admin credentials.

### Risk

Anyone with access to the workspace, copied files, logs, or backups may be able to access production services, sign JWTs, send email, or administer Firebase.

### Implementation

- Rotate all exposed secrets immediately:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `CLOUDINARY_API_SECRET`
  - `RESEND_API_KEY`
  - `FIREBASE_PRIVATE_KEY`
  - Redis credentials
  - default admin password
- Remove real `.env` files from shared environments.
- Keep only `.env.example` in source control.
- Store production secrets in the deployment platform secret manager.
- Invalidate existing user sessions after rotating `JWT_SECRET`.
- Replace the default seeded admin password and require first-login password change.

### Verification

- Confirm `.env` is ignored and not committed.
- Confirm old JWTs no longer authenticate.
- Confirm rotated service keys work only through deployment secrets.

## Priority 1: Fail Fast On Missing Critical Config

### Problem

The API falls back to insecure defaults such as `fallback-secret` for JWT signing.

### Risk

If production starts without `JWT_SECRET`, attackers can forge valid tokens.

### Implementation

- Create a config validation layer in the API startup.
- Require these variables in production:
  - `JWT_SECRET`
  - `MONGODB_URI`
  - `CLIENT_URL`
  - `API_PORT`
- Reject weak JWT secrets:
  - minimum 32 bytes
  - no known placeholder values
  - no `fallback-secret`
- Remove default JWT secret values from:
  - `apps/api/src/modules/auth/auth.module.ts`
  - `apps/api/src/modules/auth/strategies/jwt.strategy.ts`

### Verification

- Start API without `JWT_SECRET`; it must fail during bootstrap.
- Start API with a weak secret; it must fail during bootstrap.
- Start API with valid production config; it must boot normally.

## Priority 2: Fix Password Change Runtime Bug

### Problem

The frontend sends `oldPassword`, but the API expects `currentPassword`.

### Impact

Password changes fail validation, especially for students required to change their initial national-ID password.

### Implementation

- Update `apps/web/src/app/[locale]/dashboard/profile/page.tsx`.
- Change request body from:

```ts
{
  oldPassword: currentPassword,
  newPassword,
}
```

to:

```ts
{
  currentPassword,
  newPassword,
}
```

- Add or update an integration test for `POST /api/auth/change-password`.
- Add a shared request type or schema to prevent future frontend/backend drift.

### Verification

- Log in as a student.
- Change password successfully.
- Confirm old password no longer works.
- Confirm new password works.

## Priority 3: Fix API Base URL Mismatch

### Problem

The API uses a global `/api` prefix, but `NEXT_PUBLIC_API_URL` may be configured as `http://localhost:4000`.

### Impact

Frontend requests can go to `/auth/me` instead of `/api/auth/me`.

### Implementation

- Set:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

- Or normalize `apps/web/src/lib/api.ts` so it always appends `/api` exactly once.
- Keep `.env.example` consistent with the chosen convention.

### Verification

- Confirm `GET /api/auth/me` is called after login.
- Confirm no frontend request targets `/auth/me` directly.

## Priority 4: Add Server-Side Rate Limiting

### Problem

Login, password change, uploads, email, notification, and complaint routes have no backend throttling.

### Risk

Attackers can brute-force student accounts, spam tickets, abuse email/notification sending, or exhaust resources.

### Implementation

- Add `@nestjs/throttler`.
- Apply strict limits to:
  - `POST /api/auth/student/login`
  - `POST /api/auth/admin/login`
  - `POST /api/auth/change-password`
  - `POST /api/students/complaints`
  - `POST /api/admin/uploads`
  - `POST /api/admin/emails`
  - `POST /api/admin/notifications`
- Use separate limits by IP and account identifier where possible.
- Add failed-login counters and temporary lockout.
- Add audit logs for repeated failures.

### Verification

- Repeated login failures should return `429 Too Many Requests`.
- A valid user should recover after the throttle window.
- Admin upload/email routes should also throttle.

## Priority 5: Protect Or Disable Swagger In Production

### Problem

Swagger is registered unconditionally at `/api/docs`.

### Risk

Attackers can enumerate routes, DTOs, auth mechanisms, and admin capabilities.

### Implementation

- Register Swagger only when `NODE_ENV !== 'production'`.
- Or protect `/api/docs` with admin authentication and IP allowlisting.

### Verification

- In production mode, `/api/docs` should return `404` or require admin auth.
- In development mode, docs should still work.

## Priority 6: Harden Cookie-Based Authentication

### Current State

Auth cookies are `httpOnly`, `secure` in production, and `sameSite: lax`.

### Remaining Risks

- No CSRF token for state-changing requests.
- No server-side session revocation.
- No token versioning.
- Seven-day JWT lifetime is long for a single bearer token.

### Implementation

- Add CSRF protection for cookie-authenticated unsafe methods:
  - `POST`
  - `PATCH`
  - `PUT`
  - `DELETE`
- Add `tokenVersion` or `sessionVersion` to the user model.
- Include session version in JWT payload.
- Reject tokens whose version no longer matches the database.
- Increment token version on password change, reset password, deactivation, and suspected compromise.
- Consider short-lived access tokens plus refresh-token rotation.

### Verification

- Cross-site form POSTs should fail without CSRF token.
- Password change should invalidate older sessions.
- Deactivated users should immediately lose access.

## Priority 7: Enforce First-Login Password Change

### Problem

`mustChangePassword` is returned to the frontend but not enforced by the backend.

### Risk

Students can continue using national ID or weak initial passwords.

### Implementation

- Add a guard or interceptor that checks `request.user.mustChangePassword`.
- Allow only:
  - `GET /api/auth/me`
  - `POST /api/auth/change-password`
  - `POST /api/auth/logout`
- Block other authenticated routes until password is changed.

### Verification

- A new student can log in.
- The student cannot access dashboard data until changing password.
- After changing password, normal access works.

## Priority 8: Harden Excel Uploads

### Problem

Uploaded Excel files are parsed from memory without visible size, MIME, extension, sheet, or row-count limits.

### Risk

Large or malformed files can exhaust memory or CPU. Partial imports can leave inconsistent data.

### Implementation

- Add Multer limits to `FileInterceptor`.
- Accept only `.xlsx` and `.xls`.
- Validate MIME type and extension.
- Reject files above a fixed size, for example 5 MB or 10 MB.
- Reject spreadsheets above a fixed row count.
- Validate required columns before processing rows.
- Process large imports as queued jobs.
- Add per-row validation with clear errors.
- Consider transaction-like behavior for critical imports.

### Verification

- Oversized upload returns `413` or `400`.
- Wrong file type returns `400`.
- Malformed workbook returns a safe validation error.
- Valid upload still imports correctly.

## Priority 9: Escape Search Regex Inputs

### Problem

Search queries are passed directly into Mongo `$regex`.

### Risk

Crafted regex patterns can cause slow queries or regex denial of service.

### Implementation

- Add a helper:

```ts
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- Trim and cap search input length.
- Use escaped values in:
  - students search
  - complaints search
  - courses search
  - academic emails search
  - FAQs search
- Add indexes or Mongo text indexes for common search fields.

### Verification

- Search still works for normal text.
- Special regex characters are treated as literal characters.
- Long search strings are rejected or truncated safely.

## Priority 10: Tighten Roles And Permissions

### Problem

The permissions guard exists, but most routes rely only on broad roles such as `admin` and `staff`.

### Risk

Staff accounts can access broad student, complaint, grade, email, and notification data even when only a subset may be needed.

### Implementation

- Define route-level permissions for sensitive operations:
  - `students:read`
  - `students:write`
  - `grades:read`
  - `grades:write`
  - `complaints:read`
  - `complaints:reply`
  - `emails:send`
  - `notifications:send`
  - `uploads:import`
- Add `@Permissions(...)` to staff-accessible routes.
- Keep `admin` as full access if desired.
- Audit every `@Roles('admin', 'staff')` route.

### Verification

- Staff with missing permission gets `403`.
- Staff with correct permission succeeds.
- Admin still succeeds.

## Priority 11: Improve Logging Hygiene

### Problem

Local logs exist under `apps/api/logs` and include stack traces, local paths, route inventory, failed login events, and process metadata.

### Risk

Logs can leak operational details and help attackers map the system.

### Implementation

- Do not commit logs.
- Remove existing log files from source-controlled artifacts.
- Keep `.gitignore` log rules.
- Redact sensitive values from logs.
- Log auth failures as structured events without stack traces for expected `401` and `403` cases.
- Send production logs to a central log service with retention and access control.

### Verification

- Expected `401`, `403`, and `404` responses do not create noisy error stack traces.
- Production logs do not contain secrets, cookies, tokens, passwords, or national IDs.

## Priority 12: Fix Queue Configuration

### Problem

`REDIS_URL` must use `redis://` or `rediss://`. A bare host value causes queue jobs to run inline.

### Impact

Email and push notification jobs may block request handling and behave differently from production expectations.

### Implementation

- Use a valid Redis URL format:

```env
REDIS_URL=rediss://username:password@host:port
```

- Fail or warn loudly in production if Redis is required but invalid.
- Expose queue health in an internal health endpoint.

### Verification

- Notification/email jobs are queued when Redis is configured.
- Invalid Redis config fails production boot or emits a clear alert.

## Priority 13: Add Security Headers

### Problem

The API does not visibly enable common HTTP hardening headers.

### Implementation

- Add `helmet`.
- Configure:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - basic Content Security Policy where applicable

### Verification

- API responses include expected security headers.
- Swagger, if enabled in development, still renders.

## Priority 14: Data Integrity Improvements

### Problems

- Complaint ticket numbers can collide.
- Upload imports can partially succeed.
- Attendance math accepts inconsistent totals.
- Grade updates accept complete `SaveGradeDto` through a generic partial update path.

### Implementation

- Use a unique index for `ticketNumber`.
- Generate ticket numbers with collision retry or a sequence.
- Validate attendance:
  - attended cannot exceed total
  - absence cannot exceed total
  - attended + absence should be consistent
- Use explicit update DTOs for partial update endpoints.
- Add database-level unique indexes for upsert keys.

### Verification

- Duplicate ticket numbers cannot be saved.
- Invalid attendance values return `400`.
- Partial update endpoints cannot accidentally mutate protected fields.

## Priority 15: Tests To Add

- Auth:
  - login success
  - invalid login throttling
  - inactive user rejected
  - missing JWT rejected
  - forged/expired JWT rejected
- Password:
  - password change success
  - old password rejected after change
  - first-login password change enforcement
- Authorization:
  - student cannot access another student's data
  - staff cannot access routes without permission
  - admin can access admin routes
- Uploads:
  - bad MIME rejected
  - oversized file rejected
  - malformed workbook rejected
  - valid import succeeds
- Search:
  - regex metacharacters are escaped
  - long search is rejected
- Production config:
  - missing JWT secret fails startup
  - weak JWT secret fails startup
  - Swagger disabled in production

## Suggested Implementation Order

1. Rotate secrets and remove real env/log artifacts from shared surfaces.
2. Fix password-change payload and API base URL.
3. Remove JWT fallback secret and add config validation.
4. Add rate limiting and Swagger production gating.
5. Add CSRF/session revocation and first-login enforcement.
6. Harden uploads and regex search.
7. Add permission decorators to staff routes.
8. Improve logging, queue config, headers, and data integrity.
9. Add regression and security tests.

## Release Gate

Before production release, all of these must be true:

- No live secret exists in the repository or deploy artifact.
- `JWT_SECRET` is required and strong.
- Login endpoints are rate-limited.
- Swagger is unavailable or protected in production.
- Password change works from the frontend.
- First-login password change is enforced server-side.
- Uploads have size/type/row limits.
- Search input is regex-escaped.
- Logs do not expose secrets or unnecessary stack traces.
- Critical auth and authorization tests pass.
