# Repository Architecture Audit — 2026-09-30

## Executive summary

The repository is a pnpm/Turborepo modular monolith with a Next.js web application, a NestJS API, MongoDB/Mongoose persistence, and a small shared package. The architecture is directionally sound: global authentication/authorization is centralized, list endpoints are generally bounded, sensitive fields use projections, domain modules exist, imports use dedicated importer classes, and email/notification delivery can use BullMQ.

The main structural problem is incomplete migration. New patterns have been introduced without finishing the removal of old ones. Examples include the typed API client beside direct Axios calls, URL table state beside Zustand table state, extracted registration services beside a 1,800+ line facade that still duplicates their logic, and an injected rate limiter beside a second fallback implementation. This creates contract drift and is the root cause of several real failures found during this review.

No public route, payload, or user workflow was intentionally changed by the fixes in this audit.

## Actual technology and repository shape

The installed versions, rather than older project notes, are authoritative:

- `apps/web`: Next.js 16.3.5, React 19.3, TypeScript 6, Tailwind 4, TanStack Query 5, Zustand 5, Axios, next-intl, Radix UI, React Hook Form, and Zod 4.
- `apps/api`: NestJS 12, TypeScript 6, Mongoose 8.24, Passport/JWT, class-validator, BullMQ 6, Firebase Admin, Resend, ExcelJS, Swagger, and Winston.
- `packages/shared`: roles, permissions, statuses, upload types, password constants, and a limited set of validation rules.
- Root orchestration: pnpm 10 and Turborepo 2.

This is a modular monolith, not microservices. That is the correct deployment model for the current single-institute product. The useful boundary is feature ownership inside the monolith, not network boundaries between services.

## End-to-end data flow

### Interactive request

1. A locale-scoped Next.js route renders a client-oriented feature/page.
2. The page or feature uses TanStack Query for server state. Several older pages call the Axios singleton directly; newer slices call `apiGet`, `apiPost`, `apiPatch`, or `apiDelete`.
3. The Axios request interceptor adds the locale and the double-submit CSRF header. JWT and CSRF cookies are sent with credentials.
4. Nest middleware applies CORS, security headers, cookies, body limits, and route-specific rate limiting.
5. Global guards execute in order: JWT, CSRF, first-login/password-change gate, role gate, and permission gate.
6. The global validation pipe strips/rejects unknown fields and transforms DTO input.
7. A controller delegates to a domain service. Services query Mongoose models directly; some larger modules have begun extracting query, command, policy, or settings services.
8. Read paths usually paginate and call `.lean()`. Writes use Mongoose documents, `findOneAndUpdate`, or importer `bulkWrite` operations.
9. The response interceptor wraps the result as `{ success, data, timestamp }`.
10. The Axios interceptor returns that envelope; the typed API wrapper explicitly returns `envelope.data`.

### Authentication flow

Student/admin login is public and rate-limited. The API validates credentials, issues an HTTP-only JWT cookie, supplies a readable CSRF token, and exposes `/auth/me`. Protected mutations require both the cookie-authenticated user and matching CSRF cookie/header tokens. `mustChangePassword` blocks all routes except the small first-login allow-list. Roles are broad gates; permissions refine staff capabilities where decorators are present.

### Upload flow

Uploads are multipart requests buffered in memory up to 4 MB. `UploadsService` parses up to 5,000 rows, normalizes headers, validates with a type-specific importer, and commits via bulk operations. This entire path currently executes inside the HTTP request. BullMQ exists, but only email and notification services use it; imports are not queued.

### Async delivery flow

Email and notification services enqueue jobs when a durable worker connection is enabled. In serverless or missing-Redis environments they intentionally fall back to inline processing. The queue abstraction is therefore best-effort, not a guaranteed durable command bus.

## Findings by severity

### Critical/high — fixed in this change

1. **Academic advising note contract drift.** The schema persists `advisingCaseId` and accepts `INTERNAL | STUDENT_VISIBLE`, while the query service used `caseId` and filtered student notes with `STUDENT`. Note creation could fail required-field validation, and valid student-visible notes were never selected. Cause: schema and service evolved independently without a typed repository/contract test.

2. **Student reset left orphaned advising data.** The wipe path deleted notes and audit logs with `caseId`; both collections persist `advisingCaseId`. It also used the wrong case field in the recommendation fallback. A successful reset could therefore leave private notes and audit history detached from deleted students.

3. **Registration build failure from partial service extraction.** During the audit, `RegistrationsService.toggleRegistrationTerm()` delegated to `registrationTermService`, but the facade neither imported nor injected that provider. Nest production compilation failed with `TS2339`. The current worktree restores a compiling facade implementation, but the same behavior now exists in both the facade and `RegistrationTermService`; consolidation is still required.

4. **CORS rejection classification drift.** The CORS callback emitted `CORS origin not allowed`, while the exception filter only recognized messages beginning with `CORS blocked`. Denied origins could bypass the intended 403 response classification. A shared classifier now owns the contract.

5. **Duplicate rate-limit execution paths.** Bootstrap populated a module-global service, but the middleware also carried a complete second store, message catalog, and response implementation. The fallback was unreachable in normal bootstrap and already lacked newer rules. Middleware is now created directly from the injected service.

### High — next refactoring phase

1. **Runtime multi-document operations are not transactional.** No runtime domain module uses `startSession`/`withTransaction`; only a database reset script does. Student imports write users, profiles, academic profiles, and academic emails in separate bulk operations. Advising approval, registrations, and destructive wipes also span collections. A mid-operation failure can leave split state. Transactions require a replica set and must be added per use case, not through a generic transaction wrapper that hides domain boundaries.

2. **Uploads remain synchronous.** Parsing and committing 5,000 rows inside a request risks function timeout and event-loop pressure. Memory is bounded by the 4 MB HTTP limit, but CPU time and database write duration are not. Persist the uploaded object, enqueue a job, expose status/progress, and keep the current synchronous path only below a measured small-file threshold.

3. **Registration is a god service with a half-finished extraction.** `registrations.service.ts` exceeds 1,800 lines while `GpaRuleService`, `AcademicProfileService`, and `RegistrationTermService` coexist. Most facade methods still duplicate the extracted services instead of delegating. Finish one vertical slice at a time, add parity tests, then delete duplicate implementations.

4. **Search will degrade with collection size.** Multiple endpoints use unanchored case-insensitive regex across several fields. Existing text/single-field indexes do not make those predicates efficient. Use exact/prefix search for institutional codes, Atlas Search or a normalized search field for names/text, and compound indexes matching filter plus sort shapes after measuring `explain('executionStats')`.

### Medium

1. **Frontend boundary migration is incomplete.** There are roughly 123 direct Axios method call sites versus limited adoption of the explicit API wrapper. The raw Axios generic type describes an Axios response even though the interceptor returns an API envelope at runtime. Continue migration feature-by-feature and prevent new direct imports with an ESLint restriction.

2. **Twenty-nine TS/TSX files exceed 500 lines.** The largest is `advising-workspace.tsx` at about 2,686 lines. Other large surfaces mix query state, dialogs, forms, tables, export logic, and rendering. Extract stateful feature controllers/hooks first, then pure presenters; avoid cosmetic file splitting that leaves all state coupled.

3. **Table state has two owners.** Students use URL-synchronized `useTableState`, while courses and complaints still use feature/global Zustand stores for filters or selection. This causes lost deep links, cross-tab coupling, and inconsistent back-button behavior. Keep server-query inputs in the URL and only ephemeral row selection/dialog state locally.

4. **Dashboard overfetches.** The admin landing page issues separate count and analytics queries for students, courses, and complaints, then sometimes invalidates the entire query cache. Add a permission-aware summary endpoint and invalidate only key factories owned by the mutated feature.

5. **Raw collection access bypasses schema typing.** The wipe defect was possible because string collection names and untyped field objects bypassed Mongoose models. Destructive maintenance operations should live in a typed cleanup service with explicit dependency order, transaction support, and audit records.

6. **Mojibake exists in source literals.** Several Arabic messages and startup banner characters are stored as mojibake. Move user-facing messages to UTF-8 locale resources and add a CI scan for common corruption markers.

## Target architecture

```text
apps/api/src/
  common/                 cross-cutting HTTP concerns only
  core/                   logger, queues, infrastructure adapters
  modules/<feature>/
    controllers/          transport and Swagger metadata
    dto/                  validated input contracts
    schemas/              persistence definitions and indexes
    queries/              bounded read models using lean projections
    commands/             transactional write use cases
    policies/             authorization and domain decisions
    repositories/         typed persistence operations where needed
    <feature>.module.ts

apps/web/src/
  app/[locale]/...        thin route composition
  features/<feature>/
    api.ts                typed API boundary only
    queries.ts            key factory and query/mutation hooks
    schema.ts             form validation
    components/           domain UI
  components/ui/          accessible, domain-free primitives
  hooks/use-table-state.ts

packages/shared/src/
  constants/              roles, permissions, statuses
  contracts/              stable transport types only
  validation/             portable domain rules
```

The API should remain a modular monolith. Split by use case inside modules; do not introduce microservices until independent scaling, ownership, or reliability requirements justify the operational cost.

## Refactoring sequence

1. Lock in the fixes from this audit with contract tests and a one-off data check for legacy advising notes containing `caseId` or invalid visibility values.
2. Finish the registration-term extraction and route controllers directly to focused services. Repeat for GPA rules and academic profiles.
3. Introduce transaction boundaries for student import, advising approval-to-registration, and destructive reset. Add failure-injection tests.
4. Move large uploads to durable jobs with idempotency keys, progress records, bounded batch size, and retry-safe commits.
5. Migrate one frontend feature at a time to the typed API wrapper, query-key factories, and URL-owned filters. Add an import restriction after each migration wave.
6. Decompose `advising-workspace`, attendance presenters, and large admin pages around behavior/state boundaries.
7. Profile real queries and add indexes/search infrastructure based on execution plans rather than speculative indexes.

## Hidden edge cases and operational checks

- Existing legacy note documents with `caseId` will not automatically become valid. Inspect and migrate them to `advisingCaseId`; map `STUDENT` to `STUDENT_VISIBLE` if such values exist.
- Duplicate registration submissions can race past the pre-check. The unique compound index protects integrity, but duplicate-key errors should be translated to HTTP 409 rather than 500.
- A wipe/import failure after some parallel operations has completed is not reversible today. Do not advertise atomic reset semantics until transactions are implemented.
- Queue fallback means a request may perform email/push work inline. Production should fail startup when queues are required rather than silently changing latency/durability characteristics.
- Mongo-backed fixed-window rate limiting is shared across API instances, but its current read-then-update reset path should be concurrency-tested; Redis Lua or a single atomic Mongo pipeline update is safer at high contention.
- Case-insensitive regex over Arabic and Latin names has collation/normalization edge cases. Store normalized search forms and test Arabic variants explicitly.

## Verification performed

- API production build: passed.
- API type-check: passed.
- API unit suite: 20 suites, 84 tests passed.
- API lint: the first full run completed and found seven pre-existing formatting errors; those errors were corrected. Final lint retries were stopped after several minutes without output because the shared host was heavily contended by other Node processes. `git diff --check` passed.
- Added regression coverage for advising note field/visibility contracts, advising cleanup filters, and CORS error classification.
