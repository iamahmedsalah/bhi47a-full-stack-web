# Student Portal Implementation Patterns

## 1. Backend Feature Pattern

For a new domain feature, structure modules under `apps/api/src/modules/<feature>`:

- `*.module.ts`: Declares module dependencies, controllers, and providers.
- `*.controller.ts`: Thin routing layer; delegates to services immediately.
- `services/`:
  - `<feature>-query.service.ts`: Read models, paginated filters, aggregations (`.lean()`).
  - `<feature>-command.service.ts`: Write models, transactions, mutations, side-effects.
- `dto/`: Input DTOs with `class-validator` rules, strict typing, and transformation.
- `schemas/`: Mongoose schemas with compound indexes, projections (`select: false` on sensitive fields), and virtuals.
- `tests/`: Unit and e2e integration tests.

### Controller & Service Rules:
- **Thin Controllers:** Validate all inputs through DTOs and explicit pipes (`ParseObjectIdPipe`). Never access Mongoose models directly in controllers.
- **Authorization & Guards:** Always enforce `@UseGuards(JwtAuthGuard, RolesGuard)` and explicit `@Roles(...)` or `@RequirePermissions(...)`.
- **Transactions:** Wrap multi-document writes (e.g. course registration + student credit update + audit log) in MongoDB replica set sessions (`startSession`).
- **No Leaking Errors:** Catch database conflicts (e.g. `11000` duplicate key) and throw semantic NestJS `ConflictException` or `BadRequestException`.

---

## 2. Frontend Feature Pattern

For a new UI feature, structure under `apps/web/src/features/<feature>`:

- `api.ts`: Typed API client functions using the centralized Axios client.
- `queries.ts`: TanStack Query key factories and custom hooks (`useQuery`, `useMutation`).
- `schema.ts`: Zod validation schemas aligned with backend DTOs.
- `types/`: Domain TypeScript interfaces and API response envelopes.
- `components/`:
  - `<Feature>Table.tsx`: Composed `<DataTable<T>>` with memoized columns and bulk selection.
  - `<Feature>Toolbar.tsx`: Debounced search, category filters, and action triggers.
  - `<Feature>FormDialog.tsx`: Create/Edit modal dialog with RHF + Zod.
  - `<Feature>KpiCards.tsx`: Stat cards for summary metrics.

---

## 3. RTL, LTR & Bilingual UI Patterns

- **RTL Dialog Footers:** Ensure action buttons in `DialogFooter` support RTL reading direction (`rtl:sm:justify-start`).
- **Radix Portal Direction:** Explicitly pass `dir={isRtl ? 'rtl' : 'ltr'}` to portaled dropdowns, selects, and dialog contents.
- **LTR Field Enforcement:** Inputs containing technical codes (`studentCode`, `nationalId`, phone numbers, emails, passwords) must explicitly specify `dir="ltr"` and `text-left`.
- **Bilingual Entity Names:** Support `fullNameAr || fullName` or `nameAr || name` when rendering in Arabic mode.
- **Status Badges & Dates:** Enums and dates must be localized via `next-intl` and `Intl.DateTimeFormat(locale, { timeZone: 'Africa/Cairo' })`. Never show raw English status strings like `ACTIVE` in Arabic.

---

## 4. Table & Interface Patterns

- **Bulk Selection:** Support checkbox selection column with "Select All" and floating bulk action bar.
- **3-Dots Actions Column:** Restrict table row actions strictly to a single `MoreVertical` dropdown menu. Never put raw `Pencil` / `Trash` buttons inside table cells.
- **URL-Synchronized Filter State:** Synchronize pagination and filters with URL search parameters using `useTableState`.

---

## 5. Academic Workflows & Domain Patterns

Core academic rules to enforce across features:
- **Credit-Hour Limits:** Check minimum (e.g. 12 hours) and maximum (e.g. 18-21 hours based on GPA) during registration.
- **Prerequisites Engine:** Validate that prerequisite courses have been completed and passed before allowing course registration.
- **Exam Place & Schedules:** Provide read-only views for students showing hall name, seat number, and localized date/time.
- **Grade Management:** Protect grade finalization behind admin approval; student view must reflect finalized status.
- **Complaints & Tickets:** Track complaints through status transitions (`PENDING` -> `IN_REVIEW` -> `RESOLVED` / `DISMISSED`) with full audit reply threads.
