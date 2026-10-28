# Course 326 verification — 2026-10-28

Implemented one shared course/book with Accounting in level 3, first semester, and BIS in level 3, second semester. Existing course identity, files, registrations and grades are preserved. This workflow did not run a production migration or deploy the application.

## Passed

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | All workspace packages passed |
| `pnpm --filter @student-portal/api test --runInBand` | 55 suites, 403 tests passed, including 32 new regression tests |
| `pnpm run lint` | No errors; web still reports 262 warnings across the existing application |
| Final PDF files lint | Passed after the last visual correction |
| `pnpm run build --cache=local:r` | Shared, API and web production builds passed; cache writing disabled for the final run to avoid a local Turbo archive delay |
| API E2E fixture typecheck | Passed with `tsc --noEmit --incremental false -p tsconfig.e2e.json` |
| `pnpm --filter @student-portal/web test:registration` / browser harness | Passed in Chromium; rerun after the final PDF visual correction |
| API Vercel runtime | Correct `NODE_OPTIONS` and successful NestJS runtime import |
| Web Vercel artifacts | Root route exists in both build manifests |
| `git diff --check` | Passed |

Regression tests cover department/semester selection, shared book identity, current-period books, retakes, duplicate and conflicting placements, enrollment errors and duplicate enrollment, PDF upload permissions/size/storage failure/deletion, fee-based download withholding, XLSX export/import round-trip, recommendations, historical print data and print ownership.

Chromium downloaded real Arabic and English PDFs, checked their PDF signatures and page counts, verified every course appears exactly once across page boundaries, exercised language switching/download/print controls, and checked native A4 printing. Six courses fit one page; 35 courses span four pages. Arabic long names and final rendered images were reviewed. Synthetic PDFs and PNG previews are in the ignored `outputs/course-326-print/` directory; normal PDFs are approximately 300KB.

## Environment limitations

`pnpm run test:e2e` could not start because the isolated localhost MongoDB service was unavailable. `pnpm run test:services` was attempted, but Docker Desktop returned HTTP 500 for its Linux engine ping. The E2E guard stopped before loading the application or connecting to production. After repairing Docker, rerun those two commands to complete live API/auth/database integration validation.

The web build also reports the existing custom Cache-Control header notice for `/_next/static/:path*`. No unrelated lint-warning cleanup or deployment configuration change was made.

## Data rollout

Follow [COURSE-326-MIGRATION.md](./COURSE-326-MIGRATION.md) for read-only preview, explicit apply with a new backup, and restore. The script was prepared and typechecked; this workflow did not run it against a database. Review the historical inconsistency report manually; registrations and grades are never moved or deleted by this migration.
