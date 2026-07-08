# Review Checklist

Use this checklist for repo/file review tasks.

## Backend review

Check:

- modules are cohesive and imported/exported correctly
- controllers are thin and use DTOs/guards/decorators consistently
- services contain business logic and handle not-found/forbidden/conflict cases
- DTOs use `class-validator` and do not accept unchecked arbitrary objects
- Mongoose schemas define required fields, indexes, timestamps, refs, enums, and safe defaults
- ObjectId inputs are validated before querying
- queries are paginated, filtered, sorted safely, and not unbounded
- passwords/tokens/secrets are never returned or logged
- auth strategy is consistent with existing cookie/Bearer pattern
- role/permission checks are server-side, not only frontend-side
- Swagger decorators match actual request/response shapes when used
- Winston logs avoid PII and secrets
- BullMQ jobs are idempotent and retry-safe
- Resend/Firebase integrations handle failures without blocking core flows unnecessarily
- Excel import/export validates rows and reports row-level errors

## Frontend review

Check:

- server/client component boundaries are correct
- browser APIs are not used in server components
- hydration-sensitive values are guarded
- API calls go through the existing client/query abstraction
- TanStack Query keys are stable and invalidated after mutations
- Zustand is not used for server state
- forms use RHF/Zod where appropriate
- loading, error, empty, disabled, and success states exist
- Radix components remain accessible
- Tailwind classes use project tokens/utilities where possible
- next-intl messages exist for all new visible text
- RTL/LTR layouts work for Arabic and English
- charts handle empty/large datasets and responsive containers
- exports/printing handle page breaks and browser limitations

## Security and privacy

Flag immediately:

- secrets in frontend code or committed env files
- missing authorization on backend routes
- trusting client-provided role/user IDs
- returning password hashes, reset tokens, national IDs, private notes, or internal audit logs
- unsanitized HTML rendering
- unvalidated file uploads/imports
- unsafe CORS or cookie settings
- missing rate limits on auth or OTP-like flows

## Output severity

Use:

- Critical: breaks security, data integrity, auth, production build, or core user flows
- High: likely bug, missing validation, major performance issue
- Medium: maintainability or UX issue
- Low: naming, style, minor consistency
