# Architecture Quality Audit and Improvement Plan

Date: 2026-07-08

## Scope

This document reverse-engineers the current monorepo architecture and identifies improvements for code quality, scalability, maintainability, performance, accessibility, and developer experience. It is intentionally written as a non-functional refactor plan: existing behavior, routes, payloads, and user workflows should remain unchanged while the codebase is upgraded.

## Current Architecture Breakdown

### Monorepo

The project is a pnpm workspace with three main layers:

- `apps/web`: Next.js 16 App Router frontend, React 19, Tailwind CSS v4, TanStack Query, Axios, next-intl, Radix packages, Recharts, and shadcn-style local UI components.
- `apps/api`: NestJS 11 backend, Mongoose, class-validator, class-transformer, Swagger, JWT cookies, CSRF guard, first-login guard, role/permission decorators, BullMQ, Firebase notifications, Resend email, and XLSX import/export workflows.
- `packages/shared`: shared constants for roles, permissions, enrollment statuses, course levels, grade statuses, ticket statuses, exam types, and upload types.

### Backend Request Flow

Typical backend flow:

1. Browser calls `/api/...` with cookies and optional CSRF header.
2. `main.ts` applies global prefix, CORS, security headers, custom rate limiting, cookie parsing, body parsers, validation pipe, exception filter, and transform interceptor.
3. Global auth guards from `AuthModule` enforce JWT, CSRF for mutations, and password-change gating.
4. Controllers apply `@Roles()` and sometimes `@RequirePermissions()`.
5. DTOs validate and transform input.
6. Services query Mongoose models and execute domain behavior.
7. `TransformInterceptor` wraps successful responses in an API envelope.
8. Frontend Axios interceptor unwraps the response body.

### Frontend Data Flow

Typical frontend flow:

1. App Router locale layout loads messages, direction, theme, query provider, language provider, toasts, and network overlay.
2. Route pages are mostly client components.
3. Pages call Axios directly or through a small feature helper.
4. API responses are cached with TanStack Query in several admin pages.
5. Large page components own table state, filters, pagination, forms, dialogs, upload/export flows, and mutations.
6. Local UI primitives such as `Select`, `CustomDropdown`, `Dialog`, `Button`, `Input`, and table styling are reused inconsistently across pages.

### Domain Modules

Current backend modules include auth, users, students, courses, grades, academic emails, attendance, uploads, exam schedules, complaints, notifications, emails, FAQs, and registrations. The frontend mirrors several of these as admin pages and student dashboard pages, but most feature logic still lives directly in route files rather than dedicated feature modules.

## Critical Problem Areas

### 1. Large Route Components Mix Too Many Responsibilities

Observed large frontend files:

- `apps/web/src/app/[locale]/admin/complaints/page.tsx`: about 58 KB
- `apps/web/src/app/[locale]/admin/students/page.tsx`: about 45 KB
- `apps/web/src/app/[locale]/admin/grades/page.tsx`: about 36 KB
- `apps/web/src/app/[locale]/admin/settings/page.tsx`: about 28 KB
- `apps/web/src/app/[locale]/dashboard/complaints/page.tsx`: about 28 KB

These files combine data fetching, DTO mapping, table rendering, dialogs, form state, filters, mutations, upload/export behavior, and domain formatting. This makes defects like dropdown propagation, stale dialog state, and schema drift much more likely.

Recommended direction:

- Keep route files as orchestration shells.
- Move feature API calls, query keys, hooks, schemas, dialogs, tables, and export helpers into feature folders.
- Keep page files mostly responsible for layout and composition.

### 2. Duplicate Admin CRUD Patterns

Students, courses, grades, academic emails, complaints, exam schedules, and registrations repeat the same concepts:

- Search and filters
- Backend pagination
- Empty/loading/error states
- Bulk upload dialog
- Export current or full data
- Row actions
- Edit/create dialogs
- Status badges
- Selection and bulk actions

This duplication slows changes and causes UI behavior to drift between pages.

Recommended direction:

- Create shared admin primitives:
  - `AdminPageHeader`
  - `AdminToolbar`
  - `AdminDataTable`
  - `AdminPagination`
  - `AdminBulkActions`
  - `DataUploadDialog`
  - `ExportButton`
  - `RowActionGroup`
  - `StatusBadge`
- Keep domain-specific columns, filters, schemas, and mutations in each feature.

### 3. API Access Is Scattered and Weakly Typed

The Axios instance response interceptor returns `response.data`, while many call sites still type calls like Axios responses and then access `res.data`. This currently works because the backend transform envelope contains `data`, but it is non-obvious and easy to break.

Current pattern risk:

```ts
const res = await api.get<PaginatedResponse<Student>>('/admin/students');
return res.data;
```

Because the interceptor unwraps the HTTP response object, `res` is not a normal Axios response. The type signature hides the real runtime shape.

Recommended direction:

- Add a typed request wrapper that makes envelope unwrapping explicit.
- Move direct endpoint calls into feature API files.
- Type query keys and parameter objects.

Target API shape:

```ts
// apps/web/src/lib/api-client.ts
import type { AxiosRequestConfig } from 'axios';
import api, { ApiEnvelope } from './api';

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const envelope = await api.request<ApiEnvelope<T>, ApiEnvelope<T>>(config);
  return envelope.data;
}
```

Feature usage:

```ts
// apps/web/src/features/students/api.ts
export interface StudentListParams {
  page: number;
  limit: number;
  search?: string;
  level?: string;
  enrollmentStatus?: string;
}

export function listStudents(params: StudentListParams) {
  return apiRequest<PaginatedResponse<Student>>({
    url: '/admin/students',
    method: 'GET',
    params,
  });
}
```

### 4. Dropdown and Select Architecture Is Fragile

There are currently two custom dropdown paths:

- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/custom-dropdown.tsx`

Radix Select is installed, but the project relies on hand-rolled positioning, portals, scroll listeners, outside-click handling, and ARIA behavior. This has already produced z-index, placement, and maximum update depth bugs. The complaints table also contains a migrated `CustomDropdown` while still carrying hidden legacy `Select` markup nearby, which increases maintenance cost.

Recommended direction:

- Choose one project-wide select/dropdown primitive.
- Prefer Radix Select for form fields unless there is a hard blocker.
- Keep `CustomDropdown` only for row action/status menus if it has full keyboard, focus, escape, outside-click, portal, RTL, and scroll-container behavior.
- Remove hidden legacy select markup after migration.
- Add a Storybook-style test page or Playwright interaction smoke tests for dropdowns inside modals, tables, drawers, and near viewport edges.

Target props:

```ts
export interface AppSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface AppSelectProps {
  value?: string;
  defaultValue?: string;
  options: AppSelectOption[];
  onValueChange?: (value: string) => void;
  placeholder?: React.ReactNode;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  contentClassName?: string;
}
```

### 5. Backend Services Are Becoming Too Broad

Observed large backend files:

- `apps/api/src/modules/uploads/uploads.service.ts`: about 18 KB
- `apps/api/src/modules/registrations/registrations.service.ts`: about 17 KB
- `apps/api/src/modules/complaints/complaints.service.ts`: about 16 KB
- `apps/api/src/modules/notifications/notifications.service.ts`: about 12 KB

These files are not yet unmanageable, but they are growing in directions that should be split before they become expensive to change.

Recommended direction:

- Split services by use case:
  - query service for reads
  - command service for writes
  - policy service for authorization/domain limits
  - importer service per upload type
  - notification/email side-effect service
- Keep controllers thin.
- Keep services testable without HTTP context.

Example:

```ts
@Injectable()
export class ComplaintReplyPolicy {
  assertCanReply(ticket: Complaint, actor: AuthUser): void {
    // Check ownership, role, status, and closed-ticket behavior.
  }

  assertWithinDailyLimit(replyCount: number): void {
    if (replyCount >= 3) {
      throw new TooManyRequestsException('Daily reply limit reached.');
    }
  }
}
```

### 6. Permission Coverage Is Inconsistent

Some controllers combine `@Roles()` with `@RequirePermissions()`, while other admin write routes rely only on `@Roles('admin')`. This may be acceptable in early development, but it weakens the permission model as staff/admin capabilities become more granular.

Examples to review:

- Courses write routes
- Grades write routes
- Exam schedule write routes
- FAQ write routes
- Complaint admin list/update/reply routes
- Registration admin actions
- Upload routes

Recommended direction:

- Define a permission matrix per module.
- Require explicit permissions for every admin/staff read and write operation.
- Keep role checks as broad gates and permissions as capability gates.
- Add controller tests for permission denial.

### 7. Rate Limiting Is In-Memory

The custom middleware handles important limits for login, password changes, complaints, student complaint replies, public complaints, FAQ chat, uploads, and notification/email sends. The rules are good, but the storage is a local `Map`.

Risks:

- Limits reset on server restart.
- Limits do not work across multiple API instances.
- Memory can grow without a central eviction strategy.
- IP-based limits can punish users behind shared NAT and miss credential-based abuse.

Recommended direction:

- Move counters to Redis or another shared store.
- Include route, actor id where authenticated, student code where relevant, and IP as dimensions.
- Keep business limits, such as three student complaint replies per day, in the database where they already belong.
- Return consistent `Retry-After` headers and user-facing error codes.

Target storage contract:

```ts
export interface RateLimiterStore {
  increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: Date }>;
}
```

### 8. Upload Workflows Need a Pipeline

`uploads.service.ts` centralizes import logic for students, courses, grades, quizzes, attendance, and academic emails. It normalizes rows and processes many domain-specific branches in one service.

Risks:

- Hard to test each import type.
- Hard to return row-level validation in a consistent format.
- Slow for large files if each row performs independent database work.
- Difficult to support background processing and progress reporting.

Recommended direction:

Use a shared pipeline:

1. Parse file.
2. Normalize headers.
3. Validate each row with a schema.
4. Map rows to commands.
5. Execute with `bulkWrite` or bounded concurrency.
6. Return row-level successes, warnings, and errors.
7. For large files, enqueue a job and expose progress.

Target importer shape:

```ts
export interface Importer<Row, Result> {
  readonly type: string;
  parse(rawRows: unknown[]): Row[];
  validate(row: Row, index: number): ImportValidationResult;
  commit(validRows: Row[], actorId: string): Promise<Result>;
}
```

### 9. Internationalization and Encoding Are Not Stable Enough

There are hardcoded strings across large route components, and some Arabic text appears mojibaked in source/output. The app already uses next-intl, so strings should move toward message files.

Recommended direction:

- Move route UI copy into locale message files.
- Keep only domain constants in shared packages.
- Add an encoding check in CI to detect replacement characters or mojibake patterns.
- Avoid mixing Arabic literals inside dense TSX where possible.

### 10. Lint and Type Debt Is Visible

Examples found:

- `any` in frontend store/utilities and backend filters/importers.
- `eslint-disable` in a few UI components.
- Service filters typed as `any`.
- Upload controller uses `file: any`.
- Some page files likely need hook cleanup and extracted callbacks.

Recommended direction:

- Introduce typed Mongo filter aliases per model.
- Replace broad `any` in importers with row DTOs.
- Make lint fail in CI without auto-fixing backend code during normal lint.
- Track existing warnings as a baseline and reduce them by feature.

## Performance Bottlenecks

### Frontend

- Large client route components increase bundle size and hydration work.
- Repeated inline handlers and large JSX trees make rerenders harder to reason about.
- Admin dashboard fetches multiple endpoints separately; acceptable now, but a dedicated dashboard summary endpoint would reduce network waterfall and overfetching.
- Client-side full export flows page through all data from the browser. This is fine for small datasets but should become backend export jobs for large datasets.

### Backend

- Most list endpoints use pagination and `.lean()`, which is good.
- Regex search across fields can become slow without carefully selected indexes.
- Uploads can become slow if row processing performs many independent queries/writes.
- Notification/email send flows should be consistently queued or bounded to avoid blocking requests.

## Scalability Risks

- In-memory rate limits will not scale past one API instance.
- Large services and large route files increase change risk as the team grows.
- Permission enforcement is not uniformly capability-based.
- Upload/import logic is centralized and will become harder to extend.
- Frontend API calls are not feature-owned, making contract changes expensive.
- UI primitives are custom and need accessibility proof before broad reuse.
- Shared package contains constants but not typed API contracts or DTO-derived client models.

## Refactoring Strategy

### Phase 1: Stabilize the UI System

- Pick one select primitive and migrate all form selects to it.
- Keep one custom dropdown only if it has production-grade keyboard and portal behavior.
- Remove hidden legacy select markup after each migration.
- Create reusable admin table, toolbar, pagination, status badge, and row action primitives.
- Add Playwright smoke tests for dropdowns in modals, drawers, tables, and bottom-of-viewport rows.

### Phase 2: Introduce Feature Folders

Suggested frontend structure:

```text
apps/web/src/features/students/
  api.ts
  queries.ts
  schema.ts
  types.ts
  components/
    StudentFormDialog.tsx
    StudentProfileDialog.tsx
    StudentsTable.tsx
    StudentsToolbar.tsx

apps/web/src/features/complaints/
  api.ts
  queries.ts
  schema.ts
  types.ts
  components/
    ComplaintDetailsDrawer.tsx
    ComplaintsTable.tsx
    ComplaintFilters.tsx
    ComplaintSettingsPanel.tsx
```

Route file target:

```tsx
export default function StudentsPage() {
  return (
    <AdminStudentsFeature />
  );
}
```

### Phase 3: Type the API Boundary

- Add `apiRequest<T>()`.
- Add feature API files.
- Use shared `PaginatedResponse<T>`.
- Avoid direct `api.get` calls from route files.
- Consider OpenAPI type generation after controllers are fully documented.

### Phase 4: Split Backend Services by Use Case

Suggested backend structure:

```text
apps/api/src/modules/complaints/
  complaints.controller.ts
  complaints.module.ts
  services/
    complaint-query.service.ts
    complaint-command.service.ts
    complaint-settings.service.ts
  policies/
    complaint-reply.policy.ts
    complaint-status.policy.ts
  repositories/
    complaint.repository.ts
```

Use the same pattern for uploads and registrations.

### Phase 5: Productionize Rate Limiting and Imports

- Replace the in-memory rate limiter store with Redis-backed storage.
- Keep business daily limits in database queries.
- Move large imports/exports to BullMQ jobs.
- Return job ids for large operations and expose progress endpoints.

## Production-Grade Code Patterns

### Typed Query Key Factory

```ts
export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (params: StudentListParams) => [...studentKeys.lists(), params] as const,
  detail: (id: string) => [...studentKeys.all, 'detail', id] as const,
};
```

### Feature Query Hook

```ts
export function useStudents(params: StudentListParams) {
  return useQuery({
    queryKey: studentKeys.list(params),
    queryFn: () => listStudents(params),
    placeholderData: keepPreviousData,
  });
}
```

### Reusable Admin Table API

```ts
export interface AdminTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export interface AdminTableProps<T> {
  rows: T[];
  columns: AdminTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  emptyState?: React.ReactNode;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}
```

### Backend Query Service Pattern

```ts
@Injectable()
export class StudentQueryService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
  ) {}

  async list(params: ListStudentsDto): Promise<PaginatedResponse<Student>> {
    const filter = buildStudentFilter(params);
    const { page, limit, skip } = normalizePagination(params);

    const [items, total] = await Promise.all([
      this.studentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.studentModel.countDocuments(filter),
    ]);

    return toPaginatedResponse(items, total, page, limit);
  }
}
```

### Upload Importer Pattern

```ts
@Injectable()
export class StudentImporter implements Importer<StudentImportRow, ImportResult> {
  readonly type = 'students';

  parse(rawRows: unknown[]): StudentImportRow[] {
    return rawRows.map(parseStudentImportRow);
  }

  validate(row: StudentImportRow, index: number): ImportValidationResult {
    return validateStudentImportRow(row, index);
  }

  async commit(rows: StudentImportRow[], actorId: string): Promise<ImportResult> {
    return commitStudentsWithBulkWrite(rows, actorId);
  }
}
```

## Priority Roadmap

### Immediate

- Make the select/dropdown primitive decision.
- Remove hidden legacy dropdown/select code after migration.
- Add typed API request wrapper.
- Move direct API calls for students and complaints into feature API files first.
- Add a lint baseline and fix the highest-risk hook/state issues.

### Short Term

- Extract students, complaints, courses, grades, and academic emails into feature folders.
- Introduce shared admin table, toolbar, pagination, upload, export, and action components.
- Audit every admin/staff controller route for explicit permissions.
- Add component-level tests for select/dropdown, dialogs, and admin tables.

### Medium Term

- Split uploads service into per-importer services.
- Use bulk writes and row-level validation reports.
- Replace in-memory rate limiting with Redis-backed rate limiting.
- Add background jobs for large imports, exports, notifications, and emails.
- Add dashboard summary endpoints to avoid multi-request aggregation in the browser.

### Long Term

- Generate frontend API types from Swagger/OpenAPI.
- Add e2e tests for admin workflows and student dashboard workflows.
- Add observability around slow endpoints, failed imports, rate-limit hits, and notification/email delivery.
- Make `packages/shared` the source for stable constants and generated API types, not page-local duplicated values.

## Best Practices Going Forward

- Keep pages thin and feature-owned.
- Keep backend controllers thin and services split by use case.
- Use one dropdown/select system everywhere.
- Keep form schemas aligned with backend DTOs.
- Treat import/export as backend workflows, not page utilities.
- Prefer explicit permission checks on every admin/staff route.
- Use Redis or a shared store for infrastructure rate limits.
- Keep business limits in domain services and database-backed checks.
- Add tests around bugs once fixed, especially dropdowns, modals, pagination, import validation, and permission denial.
- Refactor incrementally with the same endpoints and UI behavior so users do not feel the cleanup happening underneath them.
