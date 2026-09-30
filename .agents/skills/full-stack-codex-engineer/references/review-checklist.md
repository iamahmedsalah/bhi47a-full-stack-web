# Review Checklist

Use this checklist for all repository and file code review tasks.

---

## 1. Backend & Persistence Review

- [ ] **Modules & Dependencies:** Modules are cohesive and cleanly imported/exported.
- [ ] **Controllers:** Kept thin; delegate immediately to services; no direct Mongoose model queries in controllers.
- [ ] **Services:** Business logic is encapsulated in query or command services; conflict and not-found cases throw semantic NestJS HTTP exceptions.
- [ ] **DTO Validation:** Inputs use `class-validator` with strict types; unknown properties are stripped via `whitelist: true`.
- [ ] **Mongoose Schemas:** Required fields, indexes (compound indexes for frequent queries, text indexes for search), timestamps, and refs are properly configured.
- [ ] **Sensitive Field Projections:** Passwords, password hashes, reset tokens, OTPs, and private notes have `select: false`.
- [ ] **Query Bounds:** All list queries are bounded and paginated; heavy read queries use `.lean()`.
- [ ] **Transactions:** Multi-document write operations wrap mutations in MongoDB sessions (`startSession`).
- [ ] **Rate Limiting:** Auth, login, OTP verification, complaints, export, and chat endpoints have distributed sliding-window rate limiters.

---

## 2. Frontend & Component Review

- [ ] **Server/Client Boundaries:** Server and client component boundaries are clean; no browser-only APIs (`window`, `localStorage`) invoked in server components.
- [ ] **Data Fetching:** API calls use typed feature endpoints; TanStack Query keys are stable and properly invalidated on mutation.
- [ ] **State Management:** URL search parameters (`useTableState`) manage table pagination and filters; Zustand is never used for server data.
- [ ] **Forms:** Use React Hook Form + Zod; form schemas mirror backend validation rules; submit buttons are disabled while mutating.
- [ ] **UI States:** All views deliberately handle loading (skeletons), empty, no results, error, and mutating states.
- [ ] **Table Standards:**
  - Bulk selection uses custom theme-aware Checkbox; supports "Select All" and bulk action bar.
  - Row actions are strictly confined to a single 3-dots (`MoreVertical`) dropdown menu; no standalone Pencil/Trash buttons in rows.
  - Headless Radix UI primitives (`Select`, `Dialog`, `DropdownMenu`) are used instead of native HTML controls.

---

## 3. RTL, LTR & Bilingual Localization Review

- [ ] **Zero Untranslated Enums:** Status badges and enums (e.g. `ACTIVE`, `PENDING`, `COMPLETED`) are resolved through `next-intl` translation keys; never rendered in raw English in Arabic views.
- [ ] **Portaled Overlay Direction:** All Radix portaled overlays (`DropdownMenuContent`, `SelectContent`, `PopoverContent`, `DialogContent`) explicitly receive `dir="rtl"` in Arabic mode.
- [ ] **Dropdown Menu Alignment:** Dropdown items align right in Arabic: icons anchored at the start (right), text aligned right, no left-hanging icons.
- [ ] **Dialog Footer Layout:** `DialogFooter` uses logical spacing (`gap-2`) and supports natural RTL reading order (`rtl:sm:justify-start`).
- [ ] **LTR Input Enforcement:** Numeric, code, and technical input fields (`studentCode`, `nationalId`, phone numbers, emails, passwords) have `dir="ltr"` and `text-left`.
- [ ] **Bidirectional Text Isolation:** Inline codes and numbers embedded in Arabic sentences are isolated using `<bdi>` or unicode markers.
- [ ] **Bilingual Entity Display:** Primary entities display localized names (`fullNameAr || fullName`, `nameAr || name`) depending on the active locale.
- [ ] **Date Localization:** Dates are formatted with `Intl.DateTimeFormat` using `Africa/Cairo` timezone and appropriate locale (`ar-EG` or `en-GB`).
- [ ] **Logical CSS Properties:** Layouts use logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) instead of directional physical properties (`ml-*`, `mr-*`, `left-*`, `right-*`).

---

## 4. Security, Validation & Privacy

- [ ] **No Secrets Exposed:** No API keys, credentials, or secrets in frontend bundles, logs, or repository files.
- [ ] **Server-Side Authorization:** Roles and permissions are strictly enforced on backend endpoints using `@Roles` and `@RequirePermissions`.
- [ ] **Egyptian Domain Rules:** Mobile numbers validate against Egyptian operator prefixes (`010`, `011`, `012`, `015`); National IDs validate against 14-digit format and date logic.
- [ ] **Timezone Safety:** Pure calendar dates (birthdays, attendance dates) use `YYYY-MM-DD` and backend `dateOnlyToUtc` conversion to prevent UTC offset shifts.
- [ ] **Standardized Errors:** Validation errors return structured envelopes with dot-separated field paths and stable translation keys.

---

## 5. Review Output Severity

Categorize review findings strictly by impact:
- **Critical:** Security vulnerabilities, data integrity violations, broken authentication, or production crash bugs.
- **High:** Functional bugs, missing validation boundaries, broken RTL layouts, or noticeable performance degradation.
- **Medium:** Maintainability issues, improper state placement (e.g. table state in Zustand), or missing empty/skeleton states.
- **Low:** Minor typography inconsistencies, styling polish, or code naming cleanups.
