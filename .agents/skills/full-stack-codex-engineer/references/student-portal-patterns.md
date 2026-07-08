# Student Portal Implementation Patterns

## Backend feature pattern

For a new domain feature, prefer:

- `*.module.ts` to declare module dependencies
- `*.controller.ts` for routes only
- `*.service.ts` for business logic
- `dto/` for create/update/query DTOs
- `schemas/` for Mongoose schemas
- optional `entities/` or `interfaces/` only if the repo already uses them
- tests near the service/controller if existing style supports it

Controller rules:

- validate all inputs through DTOs, pipes, and explicit params parsing
- use guards for auth and roles
- avoid direct Mongoose access
- return consistent response shapes used by the project

Service rules:

- centralize business rules
- use transactions only when the repo/database setup supports them
- handle duplicate and not-found cases explicitly
- avoid leaking raw database errors to users

## Frontend feature pattern

For a new UI feature, prefer:

- route/page files under the existing App Router convention
- focused components under the existing component organization
- API client functions or service layer matching the repo
- TanStack Query hooks for fetch/mutate
- local component state for local UI only
- Zustand store only for cross-route/cross-component UI state
- RHF/Zod for forms with real validation
- next-intl keys for visible copy

Query rules:

- query keys must include resource and filters
- mutations should invalidate or update affected queries
- handle unauthorized and forbidden states intentionally

Form rules:

- align frontend Zod validation with backend DTO rules
- show field errors from client validation and server validation
- disable submit while pending
- show success/error toast only when useful

## Student Portal domain reminders

Common roles may include student, staff, advisor, admin, or super admin. Do not assume exact role names; inspect existing enums/constants first.

Academic workflows often need:

- GPA rules
- course prerequisites
- credit-hour limits
- registration windows
- academic advising assignment
- staff override/audit trail
- printable registration document
- student-facing approval status

For these workflows, always check:

- who can create, edit, approve, reject, or override
- what the student can see before and after approval
- whether changes require audit logs
- whether generated/printed documents need stable snapshots
- whether recommendations are advisory or binding
