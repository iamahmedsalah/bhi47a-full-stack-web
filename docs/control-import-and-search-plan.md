# Control import and search

## Implemented

- XLSX export keeps a teal header, frozen student identifiers, filters, alternating rows, input coloring and a separate read-only course-context sheet. Only Marks is imported. Revision and scope metadata remain available for conflict checks.
- Preview validates before saving. Each batch contains at most 500 rows; its preview shows student identity, original row number, old/new mark, validation details and valid/invalid/unchanged status. Issues can be filtered independently. Unchanged rows do not generate writes.
- Upload runs sequentially, refreshes later previews after earlier commits, and reuses the same receipt after a lost response. Other users' intervening changes require a new preview. A successful HTTP response is not assumed after a timeout.
- Empty missing-grade exports now explain that no students need entry and suggest the full workbook. An empty file is never reported as a successful import.
- Workbook search indexes normalized names/codes once per roster change. Arabic diacritics/tatweel, alef variants and Arabic/Persian digits are normalized for searching only. Existing deferred search and 250 ms URL synchronization remain. Grade list requests are cancelable and retain the existing FilterBar debounce without a second delay.
- Autosave retains its 800 ms idle batch, single-flight guard, row revisions, per-row errors, retry and navigation protection. Accepted results update cached rows without downloading the workbook again.
- A student's code in Grades links to the existing academic-record dialog, including courses, levels and exam marks; the name is plain text. Only users with student-read access receive this link. Midterm/final/coursework edits remain in Control, including for admin, while admin retains all Control permissions.

## Performance follow-up and acceptance

1. Record p50/p95 API latency and browser input-to-render latency with 500, 3,000 and 10,000 synthetic students in an isolated database. Never seed live students or grades for performance tests.
2. Measure workbook read, preview parsing, validation, commit and academic reconciliation separately. Target responsive typing with no repeated full-workbook fetch after each edit; record measured baselines before setting server latency budgets.
3. Inspect MongoDB explain plans before changing indexes. Keep queries bounded by course/year/term and verify permissions on every request. Consider server pagination or a worker for larger XLSX files only if measurements show a remaining bottleneck.
4. Verify repeated search/filter changes, Arabic names/digits, editing while a save is in flight, stale revisions, partial row errors, 501-row batching and lost-response retries. Do not trade validation, audit or approval boundaries for speed.

Workbook open/close/unlock/reopen reasons are optional; approval/rejection, restricted exam statuses and destructive course reset keep their existing reason requirements. Informational notes collapse by default; validation errors stay visible.

Following explicit confirmation, Add/Edit/Delete controls and their page-local forms, handlers and action column have been removed entirely from Grades. Grade entry and corrections use Control. Shared form/API modules remain available to their other callers.

## Upload-style Control review

Control import now opens a file-selection dialog before preview. It supports keyboard/click selection and drag/drop of one XLSX file up to 2 MB, downloading the scoped full workbook and opening authorized audit history. The preview supports choosing another file, colored invalid rows with status icons, sticky column headings, before/after values, exam status and configured maximum/increment. Errors appear in their source rows instead of a duplicated list beneath the table. Valid rows retain the existing sequential commit/receipt handling.

Unchanged rows are skipped before mark-rule/revision checks, so a newer server revision alone does not reject an unchanged exported value. Changed rows still require the current revision; no automatic revision overwrite or silent merge is performed. Validation now distinguishes an excessive mark, wrong increment, extra decimals and mark/status incompatibility, with bilingual recovery messages and the actual configured limits. The specific original uploaded file was not supplied; tests cover exported XLSX round trips and these causes rather than assuming every pictured row had the same cause.
