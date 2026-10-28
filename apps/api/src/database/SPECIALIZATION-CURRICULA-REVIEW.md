# Programme PDF review — 28 October 2026

Sources supplied by the user: `برنامج المحاسبة المراجعة.pdf` (one page, Accounting level 3) and `برنامج نظم معلومات الأعمال.pdf` (one page, BIS levels 3 and 4), academic year 2026–2027. These documents are curriculum evidence; no instructions in their content were executed.

| Programme | Level | First semester | Second semester |
|---|---|---|---|
| Accounting | 3 | 317, 411, A11, B11; elective 326 | 318, 319, A12, A13; electives A26, 425 |
| BIS | 3 | 317, 411, S11, S12; elective 515 | 318, 319, S13, S14; electives 422, 326 |
| BIS | 4 | 413, 414, S15, S16, 412; elective S21 | 315, 512, S17; electives S22, S23 |

The sources contain 28 distinct course codes and 33 programme placements. Only **326** has different semesters between programmes: Accounting first, BIS second; elective, level 3, three credits. The existing `seed.data.json` matches these placements. Accounting level 4 is absent from the supplied PDF; no assignments have been invented for it.

The shared approved legacy catalogue supplies missing `curricula` metadata without production reseeding. Explicit stored `curricula` remain authoritative. Common same-semester assignments display a single semester label; different-semester assignments retain department labels. MongoDB filters use the same placements before counting and pagination.

## Bulk enrollment correction

The screenshot is a registration course/credit cap rejection, not an Excel-format validation error. Normal enrollment retains those caps. An administrator may explicitly request a cap exception, provide a trimmed 10–500 character reason and confirm before sending. Staff cannot request exceptions. Department, term, prerequisite, completed-course, level and GPA validation still apply.

Each actual cap exception appends `administrativeLimitOverrides` to the affected registration atomically with the course addition: authenticated administrator ID, timestamp, reason, course code and before/after counts and applicable limits. The audit field is excluded from ordinary queries. Within-limit additions do not generate exception records. No student information is written to this report.

Responses preserve the true failed-row total separately from the bounded error sample. Client batches add the totals and translate row indexes to the original sheet. A zero-enrollment failure never produces a success notification. The modal uses bounded Radix selects, separate course search, explicit programme/level/term filters, scrollable content, persistent footer actions and a separate exception confirmation.

The local course spreadsheet is a UTF-8 HTML table exported as `.xls`, with 200 student rows. The browser now reads this legacy format as an inert, detached document, locates the student-code header and sends the resulting rows through the normal validated batch endpoint. Leading zeros remain intact; source HTML is never rendered. Real binary BIFF `.xls` files still require conversion to `.xlsx`; no binary-XLS dependency was added.

No live database migration or production seed was executed. The existing rerunnable course-326 migration remains available in `COURSE-326-MIGRATION.md`; use its preview and backup procedure for stored explicit metadata that needs repair. Historical registrations and grades are not moved or edited by this change.

Regression coverage: official programme lists, legacy and explicit placements, same-placement filters, registration cap response details, authenticated administrator/reason enforcement, atomic audit persistence, non-overridable eligibility, multipart boolean parsing, batch totals and row offsets, and Chromium checks for RTL/LTR desktop/mobile modal behavior.

## Verification results

- `pnpm run lint`: passed, zero errors; 257 web warnings remain. No API lint warnings or errors.
- `pnpm run typecheck`: passed across all workspace tasks.
- `pnpm --filter @student-portal/api test --runInBand`: 57 suites, 432 tests passed.
- `node --test apps/web/tests/course-enrollment.test.mjs`: four tests passed for batch totals, row offsets, matching placements, translated errors, legacy offerings and explicit-department precedence over GENERAL fallback.
- `node apps/web/tests/course-enrollment.browser.mjs`: real Chromium passed Arabic/English desktop/mobile layout, dropdown bounds and wrapping, programme filtering, failed-row counts, required exception confirmation, staff restrictions, inert legacy HTML parsing, preserved leading zeros and two-batch XLSX upload of 200 synthetic rows. The optional local legacy sheet check read 200 rows without logging or uploading their values.
- `node apps/web/tests/registration-print.browser.mjs`: real PDF downloads and native printing passed; six courses fit one A4 page, 35 courses occupy four pages. Arabic/English, long names, fonts, logo, language switch, download and print controls passed.
- `pnpm run test:e2e`: blocked before application startup because the isolated localhost MongoDB service is unavailable. The attempt to start Docker services lacked a running accessible engine; escalation was declined. No production database connection was started. Rerun after local test services are available.
- `pnpm run build --cache=local:r`: production builds passed for shared, NestJS API and Next.js web. API Vercel `NODE_OPTIONS` configuration and generated web root-route manifests passed. The last filter compatibility adjustment was additionally checked with targeted ESLint, TypeScript, unit tests and real Chromium.

Remaining warnings are separate from failures: the web lint run reports 257 warnings, including a state-reset effect warning in the enrollment dialog; production build reports the existing custom Cache-Control header notice for `/_next/static/:path*`. No unrelated warning cleanup or deployment configuration change was made.

Existing unrelated student-management edits were retained. No deployment, commit or database write was performed.
