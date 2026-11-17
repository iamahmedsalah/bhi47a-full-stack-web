# CI reports and the VPS website link

Open **Actions → CI/CD - VPS → the run → Summary** to see the Jest Test Report. It lists workspace lint, typecheck, build and Control browser outcomes, followed by separate API unit, Admissions, Control integration and API end-to-end test totals. Node.js checks and other browser checks retain their own job step logs; they are not included in Jest totals.

The report runs even after a failed step. Tests that did not run are marked skipped, not passed. Missing/invalid output from a successful test step fails reporting rather than displaying a misleading green result. Failed assertions create file annotations (up to 50); full diagnostics remain in the test logs. JSON reports are downloadable as **api-test-reports** for 14 days. Unit JSON lives inside Turbo's existing `coverage/**` output so cached test runs restore their report too.

The workflow explicitly creates `apps/api/coverage` after dependency installation and before tests. Jest's `--outputFile` does not create missing parent directories: without this preparation, even a fully passing run can exit with `ENOENT` while saving its report. The regression test runs this exact preparation twice on a clean temporary filesystem, then verifies JSON output and Jest exit codes for both failed and passing runs.

The **Deploy reviewed commit to VPS** job uses the existing **production-vps** GitHub environment with `https://bhi47.app` as its environment URL. GitHub displays this as a clickable deployment link. Its summary includes the website, login, deployed commit, SSH/internal health outcome and public HTTPS health/login outcome. Public checks run only after a successful SSH deployment. A failed public check fails the job and requires investigation; it does not automatically roll back a deployed release.

No DNS record changes are needed to display the link. DNS, TLS and the VPS reverse proxy must already serve this domain. Existing production environment approvals/secrets and deployment gates are unchanged: validation plus container smoke tests must pass; only main pushes or manual VPS runs from main may deploy.

The public API health validator checks the real response envelope: `success: true` and `data.status: "ok"`. The API's transform interceptor wraps the health payload under `data`; checking a top-level `status` falsely rejects a healthy deployment. Invalid JSON, unsuccessful envelopes and unhealthy/missing statuses still fail the deployment check.

Jobs use Ubuntu 24.04 explicitly. Checkout, Node setup, caching and pnpm setup use Node 24 action runtimes; artifact upload uses its Node 24 release. The project Node version remains 24 and pnpm remains 10.28.0.

Local regression checks:

```sh
node --test scripts/vps-workflow.test.cjs scripts/ci-test-report.test.cjs
```

The first actual GitHub run is required to verify rendered summaries, artifact upload and the deployment card. Public checks against the real VPS run only when the normal deployment policy permits deployment.

## Lint cleanup and local verification — 13 November 2026

The web lint baseline contained 300 warnings. Unused imports/declarations were removed, API/cache values now use their actual types, form subscriptions use `useWatch`, memo dependencies are stable, and browser hydration/form reset paths were adjusted without disabling lint rules. That cleanup verification used `eslint --max-warnings 0`.

Completed locally: workspace lint (zero warnings/errors), workspace typecheck, all three production builds and root route manifests, 96 API unit suites / 910 tests, 80 web unit checks, 15 CI-report/deployment checks, and Arabic/English Control import, quiz/staff and admissions workflow browser acceptance. The 31 importer tests are included in the API total and cover real XLSX files, component-column input, zero/range/increment checks, conflicts and scoreless statuses.

The broad API E2E process twice exited abnormally on Windows (`-1073740791`) after the isolated localhost database check, without a Jest result. An isolated startup/authentication run first hit its unchanged 30-second fixture setup timeout on the fresh database. Repeating that isolated run against the initialized local fixture passed all 18 tests without changing timeouts/assertions. The complete E2E suite is **not verified**: it still requires a completed run on CI/Linux or diagnosis of the Windows process crash. No deployment was performed by these checks.

The subsequent package remediation makes the production audit clean. The full registry audit retains one low development-only deepmerge warning, with a reproducible local fix and explicit security tests; see [the dependency audit report](production-dependency-audit-2026-11-13.md). Lint/type/build success is not a dependency-security clearance.

## Admissions browser startup regression

The `INTAKE26` wait timed out because importing the admissions hub also imported `next/image` through its access-management panel. In the standalone webpack fixture, Next's image configuration attempted to read `process`, causing `ReferenceError: process is not defined` before React could display any period. The fixture now substitutes a normal image element for `next/image`, as the separate admissions-workflow fixture already does, and invalidates its webpack cache. Production image behavior is unchanged. The existing Arabic/English period and student-code browser assertions pass without increasing timeouts or removing checks.

When browser code fails, the test now includes collected runtime errors in its thrown error. Failed CI jobs also upload the admissions fixtures' failure screenshots, DOM snapshots and runtime-error files as `admissions-browser-failures`, retained for seven days. These fixtures contain synthetic data; compiled bundles and application environment files are excluded.

## Control release browser router fixture

The standalone Control release test reproduced the timeout waiting for the `Course` button. The real release panel now calls Next's `useRouter` to open a grade workbook, but its browser fixture did not provide a Next router. The fixture now supplies an observable navigation adapter, retains the real release controls and API envelopes, and asserts that English final and Arabic midterm selections open their corresponding workbook slugs. The original stale-preview, policy, activation, withdrawal, history and bilingual layout checks remain unchanged, as do their timeouts.

`pnpm run test:control:release:browser` passes locally with the corrected fixture. Runtime errors are printed directly and failure screenshots, DOM snapshots and runtime-error JSON are saved under `outputs/control-release-browser` for diagnosis.

References: GitHub's [job summary commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary) and [deployment environment URLs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment). Action runtime declarations were checked in the official `action.yml` files for [checkout v5](https://github.com/actions/checkout/blob/v5/action.yml), [setup-node v5](https://github.com/actions/setup-node/blob/v5/action.yml), [cache v5](https://github.com/actions/cache/blob/v5/action.yml), [pnpm setup v5](https://github.com/pnpm/action-setup/blob/v5/action.yml) and [artifact upload v6](https://github.com/actions/upload-artifact/blob/v6/action.yml).

## Control audit preview Escape and pagination

CI intermittently timed out waiting for `Next` immediately after Escape closed the nested audit preview. An initial local run did not reproduce the timeout. The audit sheet now intercepts Escape while a preview exists and closes only the preview, including its mount/unmount transition; the nested preview also stops Escape propagation. The audit page remains available underneath. The browser regression repeats preview-open/Escape-close three times per language, asserts pagination remains enabled, visits page two, closes its preview and returns to page one. Original 30-second waits and import assertions are retained. Failure DOM snapshots now accompany screenshots.

Local verification: all three Control browser commands passed in CI order (workbook, import, release). The import command also passed separately with the strengthened regression. The changed component passed ESLint and the web workspace typecheck passed. Logs: `outputs/control-browser-final-acceptance.log`, `outputs/control-import-next-fixed.log`, `outputs/control-audit-next-lint.log` and `outputs/control-audit-next-types.log`.

The web production build and generated root-route check also passed after this fix (`outputs/control-audit-next-build.log`). The remaining permission/visibility follow-up startup/authentication check passed all 18 tests, with unchanged assertions/timeouts (`outputs/visibility-api-startup-accepted.log`); its synthetic localhost MongoDB fixture was stopped afterward. The existing Next.js custom static Cache-Control warning remains separate from this regression. No deployment was performed.
## 14 November: Control performance and official student results

Implemented client-only URL filtering for Control, deferred search, acknowledged-row cache updates after autosave, and a fresh authoritative sheet revision before workflow transitions. Student columns follow released midterm/final rows; coursework is omitted from student rows and certificates but remains in the authorized official final aggregate. Partial exams do not receive a course letter or an estimated official aggregate. Final special states use FX (banned) and IC (explicitly approved incomplete final). IC publication requires other enabled contributions to be complete and carries neither a numeric official outcome nor GPA credit. Admin retains all permissions as confirmed; staff approval remains explicit. Level estimate cards were replaced with the stored warning count. Excel hides revision/duplicate context columns, includes a separate CourseContext sheet, validates marks/status and skips unchanged rows.

Completed interim evidence: four focused API suites / 75 tests passed (`outputs/control-followup-targeted.log`), the 3001-student workbook browser test passed with an assertion that autosave does not redownload the full roster (`outputs/control-followup-workbook-browser.log`), and bilingual result-column/FX/IC/warning browser checks passed (`outputs/control-followup-release-browser.log`). Workspace lint and types passed at the intermediate revision (`outputs/control-followup-lint-final.log`, `outputs/control-followup-types-accepted.log`). These do not establish final acceptance of subsequent changes.

Final verification remains pending. The first Control integration rerun reported 18 passing / 3 failing tests: two existing 30-second timeouts and one outdated expectation that reimporting unchanged coursework creates a new write (`outputs/control-last-e2e.log`). The expectation was corrected to require a skipped row and unchanged audit count, and the suite was extended to test actual IC publication. Existing timeouts were retained. The final browser suite additionally asserts there is no midterm letter and validates submission revisions after autosave. The final local verification processes then stopped responding; attempts to stop only verification processes also did not return promptly. No final all-green build, unit, startup or deployment claim is made. Final evidence is expected in `outputs/control-accepted-*.log` after the local environment recovers. No production data, publication state or deployment was changed.

Local dependency repair: the installed React type package was present under the web workspace but missing from the root hoisted types path; restoring its node_modules junction allowed Next/Recharts to resolve it. This changed no package manifest, dependency version or lockfile. Earlier unrelated implicit-any/ScriptProps errors were caused by that local resolution failure.

## Instructor quiz visibility and narrower Grades dialog

The Grades visibility/publication boundary now covers coursework, midterm and final only. Course-quiz reads use instructor publication and the existing student hold flag; they do not read official result visibility settings. Unscoped official publication uses an explicit three-component filter and no longer updates quiz records. Unsupported quiz visibility/publication requests are rejected. Existing quiz release policies, flags and financial holds are retained. The dialog maximum width is reduced from 1024px to 768px, with three component buttons and a bilingual explanation of instructor ownership.

Verified: workspace lint (3 tasks, zero reported warnings), types (4 tasks), 97 API unit suites / 933 tests, 19 real replica-set tests, and Arabic/English browser acceptance. The integration regression checks quiz visibility despite master closure, excluded levels/components and a future official opening date; it also verifies that an unscoped official publication leaves the quiz publication flag unchanged and that an instructor-hidden quiz is absent. Browser assertions verify the 768px maximum and absence of quiz/practical/oral controls, plus existing mobile layout. Logs: `outputs/quiz-scope-lint-final.log`, `quiz-scope-types.log`, `quiz-scope-unit-final.log`, `quiz-scope-e2e.log`, and `quiz-scope-browser.log`. Windows terminated the first broad unit run without totals (3221226505); the unchanged standalone rerun passed. An initial test-formatting mismatch was corrected before the final passing lint run. The MongoDB fixture was shut down after integrations; no live data or deployment was changed. Production build evidence follows after sequential verification completes.

## Course-level visibility and compact management verification

Tuition follow-up: the results status and row filters now enforce the existing tuition/administrative hold. Arabic and English browser acceptance passed with fee-specific messaging, no result rows during the hold, and course 111 visible again after removal (`outputs/tuition-browser.log`). The targeted visibility suite passed 15 tests (`outputs/tuition-unit.log`). This does not change payment records or activate unpublished grades.

Final tuition checks: workspace lint passed all 3 tasks without reported warnings (`outputs/tuition-lint-final.log`), types passed 4 tasks (`outputs/tuition-types.log`), all 97 API unit suites / 931 tests passed (`outputs/tuition-all-unit-final.log`), and 19 real Control integration tests passed (`outputs/tuition-control-e2e-final.log`). The integration fixture now wires an actual prefixed quiz model and verifies that a published quiz disappears during a hold and returns after removal; its earlier missing-model failure was corrected. An overloaded parallel unit run timed out in HTTP security tests and was stopped; the unchanged sequential rerun passed, without relaxing timeouts. The first lint run observed a subsequently formatted test assertion; the final lint run passed. The isolated database was shut down after acceptance. Build checks remain separate from these functional results; no live records, publication state or deployment were changed.

Final production-build follow-up passed sequentially: isolated Nest API build (`outputs/tuition-api-build.log`) and the default Next.js/Turbopack build (`outputs/tuition-web-build.log`, compilation 6.5 minutes, TypeScript and page generation completed, exit 0). API runtime settings, emitted tuition-gate code and web root-route manifests passed their artifact checks. Temporary files were placed on D. This successful default build supersedes the earlier isolated PostCSS timeout; no tracked Next configuration or build command was changed. The temporary copy still uses a resolution root that accommodates dependency junctions. Earlier overlapping Webpack attempts were stopped to reduce memory pressure; they are not claimed as completed checks for the tuition change. The pre-tuition Webpack build had passed (`outputs/result-ui-webpack-build.log`). An existing custom Cache-Control warning and Jest JSON-import deprecation remain visible in their logs; workspace ESLint reported no warnings. Live deployment and staff pilot approval remain external gates.

The confirmed policy now gates published rows by their course level by default, including old settings without an explicit basis. A Level 3 student with a released Level 1 course can view that result when Level 1 and its component are allowed. The real database suite verifies the saved policy; synthetic course-111 API/browser cases cover present `5/20`, absent and banned results in Arabic and English. Absent/banned output carries zero grade/percentage and the original status, without rewriting stored release evidence.

The management UI uses a compact master strip, four level columns and equal component cells with Eye/EyeOff indicators. It retains Cairo schedule validation, permission separation and student/course overrides. Verified locally: 97 API suites / 930 tests, 18 real Control replica-set tests, 18 startup/authentication tests, workspace types and lint, and final compact bilingual browser acceptance. The first broad unit process terminated abnormally on Windows without totals; its unchanged rerun completed successfully with temporary files on D.

Your development servers were running, so production-build verification moved into ignored source copies under `outputs/result-ui-production-check`, with dependency junctions. The API build passed and its course-level/zero-score contract was verified in the emitted artifact. The isolated Turbopack build timed out waiting for its PostCSS Node subprocess; its first attempt also needed a temporary resolution-root adjustment for junctions. Those temporary changes do not modify repository Next configuration or CI commands. A Webpack production build is a supplementary check, not proof of a passing Turbopack CI build. No build timeout or assertion was relaxed. The synthetic localhost database fixture was stopped after integrations.


## 14 November: edit translations, result columns and publication guidance

Implemented complete AR/EN grade-edit status labels and RTL menus, configured midterm/final columns even before final publication, preserved the official total/status table and course counts, and kept coursework hidden. Admin rendering prioritizes banned FX and incomplete IC over stale stored letters; midterms show marks without a course letter. Publication guidance separates independent review, preview/publication and student visibility; withdrawal requires confirmation. No production records or publication state were changed.

Verified: workspace lint without reported lint warnings, four TypeScript tasks, 97 API unit suites / 945 tests, the complete shared/API/Next.js production build, exact API runtime option and web root manifests. All three Control browser scripts passed, including the new enabled-but-unpublished final-column case, AR/EN edit status options and withdrawal confirmation. Real Control replica-set tests passed 22/22, including retained contributions and final F/FX/IC outcomes.

The broad API E2E run did not pass locally: 4 suites failed and 2 passed (29 failed / 8 passed tests). Failures included fixture setup deadlines and Mongo connection/pool timeouts on the installed local MongoDB 9.0 replica set. The first default-database attempt also stopped safely because localhost MongoDB was absent. The dedicated temporary replica set was then created on port 27039 and stopped after verification. These failures remain a full-CI acceptance limitation; no test timeout/assertion was relaxed and no deployment was performed. Existing Next static Cache-Control and Jest JSON-import notices remain outside ESLint.


## 14 November: publication latency, release history and component states

Changes: batch transactional academic baselines; defer durable outbox processing until after publication commit; schedule administrative retries immediately; process reconciliation in 25-job batches; use the existing worker enablement defaults. Control scopes are excluded from duplicate synchronous legacy post-processing. History is a compact read-only table with active snapshot, creation time and scoped pending counts. Guidance explains that replacement publication, not withdrawal, is the normal correction workflow, and that 504 responses require checking committed history. Workflow/publication dots, final-by-default selection, sheet-to-publisher scope links and compact aligned filters are included.

The earlier indicator/filter revision passed workspace lint/types and release browser acceptance. Final batching/background/history edits received syntax/format/whitespace checks only. The attempted new API unit run was not executed: automatic approval review failed because of the account usage limit, not a safety determination. Do not claim the previously passing 945 unit tests, 22 integration tests or production build cover these latest edits. Full tests, replica-set integration, browser acceptance and build must be rerun. Added a deferred-work/coalescing unit regression and adjusted the integration fixture to explicitly drain jobs before academic-effect assertions. No production database, publication state or deployment was changed.


## 14 November: percentage-only totals, administrator reset and self-approval

Implemented percentage-only official totals in the student table with the existing progress bar. Admin may approve their own submitted sheet; staff retain independent review and explicit component approval permissions. Added a server- and UI-enforced administrator-only reset scoped by course/year/term, requiring typed course-code confirmation and a reason. Reset clears the three component marks, withdraws active pointers, resets drafts and default scheme/policy, invalidates import previews and queues academic reconciliation while preserving enrolments, instructor quizzes, baselines, immutable snapshots and audit evidence. No live reset was executed.

Verified on the updated sources: workspace lint passed without reported ESLint warnings; workspace TypeScript passed; 97 API unit suites / 948 tests passed; the production shared/API/Next.js Turbopack build passed; exact API runtime and root-route manifest checks passed. The release/results/edit browser suite passed, including percentage output, hidden staff reset controls, typed confirmation, and the scoped reset request. Real Control MongoDB integration passed 23/23, including administrator self-approval, staff rejection, scoped clearing, preserved other-course marks/enrolments/audit, and deactivated releases. These runs also exercise the earlier publication batching/deferred-work and workflow-indicator changes. The broad application E2E limitation from the earlier local run remains separately recorded; it is not claimed as passed here.

Initial failures were fixed in test fixtures and expectations: the former blanket self-approval prohibition now applies to staff; reset mock labels use the correct Unicode course separator; totals expect percentages; synthetic status students now include required year/semester fields. The isolated local MongoDB fixture used a fresh workspace directory and was stopped after acceptance. No test assertions or application timeouts were relaxed. Its startup allowance was increased to accommodate local WiredTiger initialization; test timeouts were unchanged. Existing Next static Cache-Control and Jest JSON-import notices remain. No commit, push, deployment or live student-data mutation was performed.

## 14 November: optional workbook reasons, collapsible help and XLSX row review

Completed optional lock/unlock/reopen reasons across coursework/midterm/final while retaining permissions, revisions, audit and required approval/return/special-status/reset reasons. Explanations in Control, scheme editing, import and Grades publication use accessible collapsed help; validation errors remain visible. Frozen scheme, coursework allocation and busy-reset conflicts have bilingual recovery guidance, and reset conflicts display inline without closing the dialog.

XLSX exports now include alternating rows, input coloring, frozen headers/identifiers, filters and landscape printing. Preview returns valid, invalid and unchanged source rows, names/codes, before/after values and translated issues; the UI supports an invalid-only view and independent 50-row display pagination. Commits remain sequential 500-row batches with stale-preview protection and receipt reuse after a lost response. Empty missing-grade workbooks explain how to download the full workbook. Added indexed normalized Arabic/code search and cancelable Grades fetches without stacking debounce delays. Authorized Grades readers can open the existing student academic record; its grades fetch now includes every page. Legacy mutations/uploads are hidden for Control components, matching the existing server restriction; admin retains Control permissions.

Final verification:

- Workspace lint passed, 3 tasks, with no ESLint warnings reported; TypeScript passed, 4 tasks.
- API unit tests passed: 98 suites, 951 tests.
- Real isolated Control replica-set integration passed: 23/23, including 3,001-student review, 501-row XLSX commits, reset conflicts preserving marks, scoped clearing and release withdrawal. The first run alongside heavy checks timed out and failed dependent assertions; the isolated rerun passed without relaxing assertions or test timeouts. The temporary MongoDB process was stopped.
- Workbook browser acceptance, import/audit browser acceptance and release/results browser acceptance passed, including bilingual help toggles, all-row/invalid-only preview, sequential batches, lost-response retry, mobile layout and reset conflict recovery.
- Seven focused web tests passed for bilingual validation, empty-file recovery, normalized Arabic/digit search and complete paginated academic records, including later-page failures.
- Final production build passed for shared/API/web, including Next.js TypeScript and all 17 static pages. Exact API NODE_OPTIONS and root-route artifact checks passed. Whitespace check passed.

The broader unrelated application E2E limitation recorded earlier was not rerun or claimed as passing. Existing Next.js static Cache-Control and Jest JSON-import deprecation notices remain. No live reset, deployment, commit or push was performed. See `docs/control-import-and-search-plan.md` for implemented changes and the remaining measured-performance follow-up; no live data was seeded for benchmarking.

Follow-up confirmation: removed Add/Edit/Delete from the Grades page entirely, including local dialogs, mutation handlers, action column and unused imports/state. Control remains the entry/correction workflow. The changed page passed ESLint with `--max-warnings 0`; web TypeScript passed. The earlier full-build/unit results above precede this UI cleanup. No deployment was performed.

## 14 November: upload-style Control preview and code-based academic record

Moved the academic-record link from student name to student code, preserving the student-read permission check. The Control import button now opens a dedicated chooser with click/keyboard selection and drag/drop, a scoped full-workbook download, authorized audit-history access, and file replacement within the preview flow. It accepts one XLSX up to the existing 2 MB limit. The preview uses sticky gray headers, red invalid rows, status icons, exam-state and rule metadata, and avoids repeating every row error below the table. The 500-row sequential commit and receipt/revision safeguards remain.

Unchanged imports now skip before mark-rule/revision validation; changed rows still reject stale revisions. Mark failures identify the configured maximum/increment and distinguish numeric, range, decimal and exam-status problems in Arabic/English. The pictured original XLSX was not supplied; exported workbook round trips, stale unchanged/changed inputs and configured mark failures received regression tests. No silent rebase of changed rows was added.

Verified: workspace lint and TypeScript passed; the shared/API/web production build passed, including Next TypeScript and all 17 static pages; exact API runtime and root-route artifact checks passed. All 98 API unit suites / 953 tests passed. The final preview-metadata assertions were additionally verified in the 40-test workbook suite and an API rebuild. Eight focused web tests passed. Import browser acceptance passed for Arabic/English drag/drop, invalid file selection, choosing/replacing a file, colored invalid rows, 501-row commits, lost-response retry and actual launcher-to-preview mobile layout. Workbook browser acceptance passed with 3,001 students and autosave/retry. Arabic desktop and mobile screenshots were visually inspected as local test artifacts.

The initial Control database runs hit a 30-second timeout in the existing combined policy/publication/window test (21/23 then 22/23). Policy versioning/stale-policy rejection and approval/publication/window assertions are now separate scenarios; every original assertion and the original per-test timeout remain. The final isolated real replica-set run passed 24/24 in 14.831 seconds, including 3,001-student review and 501-row XLSX persistence. The temporary database process was stopped. No live data, deployment, commit or push was changed.

Compact preview follow-up: reduced table body/issue text to 11px, headings to 12px and validation badges to 10px, with tighter cell padding. Preview width increases moderately from 896px to 1024px maximum and reserves mobile side margins. Fixed column allocation gives names 176px and uses the remaining width for validation details, allowing the full table to fit at desktop width while retaining mobile scrolling. The changed component passed ESLint with zero warnings and web TypeScript. Import browser acceptance passed; Arabic desktop and mobile screenshots were inspected. This styling-only follow-up did not rerun API unit/integration or the production build. No deployment was performed.

## CI E2E TypeScript follow-up

Fixed TS2339 in the course-reset integration fixture: the dynamic Mongoose model lookup now selects `_id`, supplies the single-document lean result type `{ _id: Types.ObjectId }`, and explicitly fails if the synthetic course is missing. Removed four non-null assertions. No production behavior or compiler settings changed.

Verified the exact failing CI command `pnpm --filter @student-portal/api typecheck:e2e` successfully, including a final repeat; the changed test file passed ESLint with zero warnings. All 24 real Control replica-set integration tests passed in 111.037 seconds. Whitespace checks passed and the temporary MongoDB process was stopped. Previous workspace typechecks did not include this separate E2E tsconfig; their success was not sufficient evidence for this CI stage. No deployment, commit or push was performed.

## 15 November: single-sheet entry templates and Control reports

Added Templates and Control reports dialogs to the workbook toolbar. Moved missing-mark and exception exports into template row selection. Templates select coursework, midterm or final and download exactly one named `رصد ...` sheet; the hidden revision/scope columns remain on that worksheet. Import validates the course, year, term, component and scheme version without a Scope tab. Legacy Marks/Scope workbooks remain supported. The import chooser's download uses the new format.

Course reports contain the three component marks/statuses, registration, tuition payment/exemption and blocking status, plus a separate analytical worksheet with entry/missing/state counts, numeric averages and Excel data bars. Consolidated reports select a level and use the open workbook's year/term, with all current level profiles and active course/curriculum-level term courses, three mark/status pairs per course and approved-registration flags. Reports are read-only and do not publish results. Export and source-workbook scope checks apply; consolidated reports require all-course scope. Projected batched queries and explicit student/course/cell limits bound report generation. Tuition values represent current profile state.

Verification:

- Workspace lint passed (3 tasks) without reported ESLint warnings; workspace TypeScript passed (4 tasks); separate API `typecheck:e2e` passed after adding the real report tests.
- All API unit tests passed: 100 suites / 968 tests. Single-sheet round trips for all three components, mismatched component rejection, fee/status/registration report contents and scope restrictions are covered.
- Real isolated Control integration passed 25/25 in 146.432 seconds. The 501-row persistence test now imports the new one-sheet template. Added real course/consolidated report assertions with paid/unpaid and registered/unregistered fixtures. The temporary MongoDB process was stopped.
- Workbook browser acceptance passed, including both new dialogs, selected component/level/term download queries, Arabic desktop and mobile layout, and existing 3,001-student autosave/retry behavior. Import/audit browser acceptance and five focused bilingual error-message tests passed. Arabic template and report screenshots were inspected.
- Production builds for shared/API/web passed, including Next.js TypeScript and 17 static pages; API runtime/root-route artifacts and whitespace checks passed. A final production artifact refresh covers the last guidance/analysis edits.

During implementation, the installed ExcelJS implementation was checked because its data-bar color runtime field is omitted from its declaration; a typed intersection preserves checking without `any`. Initial formatter/type issues were corrected before acceptance. The broader application E2E limitation recorded earlier was not rerun or claimed as passed. Existing Next static Cache-Control and Jest JSON-import deprecation notices remain. No live database mutation, deployment, commit or push was performed.

## 15 November: optional reasons for exam statuses and excuses

Removed the minimum/mandatory reason rule for banned, incomplete, excused and withheld exam-status transitions in Control entry and XLSX preview. Existing restricted-state permissions still apply to both old and new statuses. Supplied notes remain audited; actor/time/revision/old-new value evidence remains recorded when the reason is omitted. Workbook reason guidance and the legacy XLSX instructions now state that exam-status reasons are optional. The legacy grid no longer opens a mandatory-reason prompt solely for a restricted status. Review decisions, published-edit workflows and destructive reset keep their separate existing reason requirements.

Verified workspace lint and TypeScript, the separate `typecheck:e2e`, production shared/API/web builds, exact API runtime/root-route artifacts and whitespace checks. All 100 API unit suites / 977 tests passed; the updated audit assertion additionally passed the 19-test grade service suite. The real isolated Control replica-set suite passed 25/25 in 106.94 seconds with exam-status acceptance reasons omitted, retaining final FX/IC/status behavior and earlier component contributions. The temporary database process was stopped. The real workbook browser suite passed banned/incomplete/excused autosave with the reason field left blank, alongside existing 3,001-student navigation/save/retry acceptance. No live records, deployment, commit or push were changed; the broader unrelated application E2E suite was not claimed as passed.

## 15 November: student results initial-level race

Reproduced the release-browser timeout for course 111: when the profile arrived before results, the results page selected the student's current Level 3 and retained it after the published Level 1 course arrived. The failure DOM confirmed the empty Level 3 transcript. Initial level selection now waits for both queries to settle; subsequent valid student level selections remain preserved.

The release browser regression now forces profile-first and results-first responses in Arabic and English. It passed after the fix, retaining the original 30-second locator timeout and assertions for midterm marks, final absence, FX, IC, publication, withdrawal, tuition blocking and automatic window closing. Workspace TypeScript passed all four tasks. Browser-script syntax and whitespace checks passed. An earlier standalone TypeScript attempt encountered generated Next development files removed during the concurrent production build; the subsequent workspace check passed.

The changed results page passed focused ESLint with zero warnings. The additional full workspace lint, API unit and production-build attempts were interrupted after prolonged local disk contention (D: disk queue 19). They are not reported as passing for this change. The broader API E2E suite was not rerun for this frontend-only fix. No live data, deployment, commit or push was changed.

## 15–16 November: performance plan review and authentication incident

Reviewed `docs/performance/WEBSITE_FULL_PERFORMANCE_PLAN.md` against installed Next.js documentation and current source. Added an implementation ledger and corrected unsafe/outdated proposals. Applied parallel session/account validation without caching authorization; coalesced repeated normalized route/action/device heartbeats; shared bounded in-flight database pings between health and metrics; added lockout/assignee/outbox lease indexes; coalesced warm online-stat reads. Preserved logout-aware comparisons and session revocation.

Reduced analytics overview counts from 13 operations to four parallel collection groups. Indexed analytics membership preserves ObjectId and legacy string references. Cached hydrated course lists by caller and role with staff profile/permission invalidation. Notification history computes exact read totals before slicing readers and hydrates references in one batch. The header does not request or render notification data without permission. Complaint summaries skip national-ID enrichment, full list responses omit screenshots (detail reads remain intact), and public identity-verified ticket reads are bounded. Control release previews run four independent reads at a time while preserving digest order; transaction writes remain serial.

Public marketing routes skip session probes; hybrid complaints, login, password-change and attendance check-in retain bootstrap. Post-login cookie verification remains. Reduced passkey polling, aligned student registration/quiz keys and exam/email freshness, split settings/chat UI, and deferred PDF/canvas/XLSX-inspection dependencies. Removed idle Control course polling without changing release/withdrawal permissions or result closing/tuition checks. The remaining namespace/ISR/dashboard aggregation/cache invalidation/batch-storage work is explicitly pending in the plan; no whole-plan completion or production timing target is claimed.

Final verification completed so far:

- Workspace lint passed all three tasks after the last production code change; no ESLint diagnostics were emitted. Workspace TypeScript passed all four tasks; separate API E2E TypeScript passed after the final heartbeat change.
- All 103 API unit suites / 986 tests passed, including the real AuthService-normalized heartbeat path, current permissions/token versions, revocation, exact notification read counts, cache role separation and bounded previews. Initial fixture failures and an incorrect targeted test filename were repaired/superseded by the full passing run.
- Shared/API/web production build passed, including Next TypeScript and all 17 static pages. The API production artifact was refreshed successfully for the final heartbeat comparison. Exact API runtime/root-route artifact checks passed.
- Real AuthProvider browser acceptance passed marketing probe suppression, admin/staff/student navigation, hybrid complaint identity, and blocked-cookie rejection with no protected navigation. Control release browser acceptance passed Arabic/English publication, withdrawal, history, result status/visibility and tuition/window safeguards. Real Arabic/English registration PDF/print export passed, including a four-page 35-course export.
- Seven public-route/retry/metrics tests and all 18 deployment/report/auth-readiness tests passed. The report-generator fixture initially exceeded its unchanged 60-second child deadline under disk contention; its isolated rerun passed. No timeout or assertion was weakened.

Local real-database Control verification passed 25/25 tests on a fresh localhost replica set. The broader API E2E retry passed four suites but failed three during local MongoDB 9 setup/database timeouts; it is not a passing full E2E result. Helpers use credential-free localhost URIs and do not touch the installed application database.

The separate live incident was confirmed by public health HTTP 503 (`Database is unavailable`) and capabilities HTTP 500 after the reported Atlas Flex upgrade. MongoDB documents restarting application clients after Free-to-Flex upgrades. Public health and anonymous auth readiness subsequently passed, and the user confirmed browser login works. No restart, deployment, Atlas configuration change or live password login was performed by this agent. See `docs/performance/ATLAS_FLEX_RECOVERY.md`. No commit or push was performed.

## 2026-11-16 ? Historical uploads and revised Control defaults

Implemented admin-only historical grade batches in the existing Uploads preview/drag-and-drop workflow. Explicit previous academic year, term and component are required. Marks are insert-only and hidden; existing Control scopes and different grades are rejected. Same-value retries are idempotent. Requests are limited to 100 rows and four concurrent row operations. Strict numeric normalization preserves invalid input for rejection instead of silently treating it as a blank/default. No historical publication was added, as requested.

New Control defaults are coursework 20, midterm 30, final 50; stored schemes remain unchanged. New midterm entries allow present/absent only in UI, API and Excel; final status handling and permission-based audit access remain unchanged. Removed the redundant template card from the import launcher. Operator guide: `docs/historical-grades-import.md`.

Validation completed: workspace lint (zero diagnostics) and workspace typecheck passed before the final strict-number adjustment; the affected API files were then linted separately. All 104 API unit suites / 1008 tests passed after that adjustment. The historical persistence E2E passed against a new localhost MongoDB process: hidden storage, same-value retries, conflict rejection and Control scope protection. Both Control grid and import Chromium suites passed. Nine Control error/preview Node tests passed, including real XLSX and CSV historical input, zero absent scores, duplicate detection and red invalid-row preview. No timeout or assertion was weakened.

The earlier broad API E2E run remains distinct from these passing checks: local MongoDB 9 collection/index setup caused failures in targeted-performance/app setup and cascading database timeouts; it must not be reported as a passing full CI run. The refreshed full Control integration passed all 25 tests in 538 seconds on localhost, including the 1,108-student fixture updated for the new defaults. API E2E TypeScript also passed. The API production artifact was refreshed successfully after the final template adjustment. Historical import tests passed again (18/18), including whole-column text formatting for leading-zero codes. Full Next Webpack production build passed TypeScript, all 17 static pages and route generation; exact API runtime/root-route manifest checks passed. The first default Turbopack build was manually stopped after a long compilation (its final log confirmed compilation succeeded and TypeScript had started); that interrupted run is not a full passing build. The exact default `pnpm run build` retry then passed all three tasks in 2m38s, superseding the interrupted attempt. API runtime and root-route checks passed again against those default-build artifacts. Final workspace lint passed all three tasks with zero diagnostics after renaming a test-only local variable flagged by Next lint. The nine Control validation/real-file preview tests passed again after that test-only fix. No commit, push, deployment or live database mutation was performed.


## 2026-11-16 ? IC summer continuation and whole-attempt improvement

Implemented a reviewer-only, course-scoped comparison dialog with bilingual old/new whole-attempt marks, paginated choices, stale-source protection and audited decisions. Highest percentage wins even if the older attempt is failed/FX; equal percentages retain the older attempt. A reviewer may decline a higher new attempt. Component marks are never mixed across attempts, and GPA/course credits use a single complete attempt. Existing latest policies are read as best-attempt policies; previous release evidence is retained.

For the latest IC attempt, an approved summer registration allows copying the original coursework and midterm into hidden, read-only summer contributions. Only the final is entered anew. Maximums, increments and coursework allocations must match; no rescaling occurs. Copies remain subject to normal sheet approval and publication. Entry/review permissions and course scope are checked server-side. Draft copies can be undone without touching either final or the source. Excel preview rejects attempted changes to carried contributions with bilingual guidance. Historical import remains hidden and separate from publication.

Validation so far: full API unit run passed 105 suites / 1,017 tests. After the final IC Excel-preview validation and equal-percentage regression tests, all four affected Control suites passed 100 tests. All four Chromium acceptance suites passed: existing workbook (3,001 students), batched import, release/student results, and the new bilingual comparison/carry/undo dialog. Sixteen Node validation, real-file preview and workflow safety tests passed. Initial workspace lint and typecheck/E2E-typecheck passed; final lint/types and production build are being recorded below once complete.

The MongoDB 9 local attempts timed out during index setup and one existing tuition-hold test. No behavioral test timeout or assertion was weakened. A portable official MongoDB 7 fixture matching CI's major version was downloaded into ignored outputs and SHA256-verified. On that fresh localhost replica set, both Control persistence suites passed all 30 tests, including transactional rollback, idempotent carry, stale comparison rejection, higher-attempt acceptance/retention, release-digest changes and hidden historical results. Full API E2E is a separate check. No live database, deployment, commit or push was changed.


### Follow-up verification of commit 02463da

Rechecked the implemented IC and whole-attempt workflows on the current checkout. The bilingual comparison/carry/undo Chromium suite passed again, along with all 16 validation, real XLSX preview and VPS workflow safety tests. Removed the redundant `/_next/static/:path*` Cache-Control override from `next.config.ts`: the installed Next documentation specifies that immutable asset caching is managed by Next itself. This removes its build warning while preserving the framework's production asset caching.

The initial fresh local MongoDB attempt could not start before readiness expired; no application test ran in that attempt. A direct server version check passed and the isolated MongoDB 7 retry started successfully. Full lint/types, production build and database checks are recorded separately below after completion. Public GitHub Actions access returns HTTP 404 for this repository, so remote workflow status cannot be certified from this session. No commit, push, deployment or live database mutation was performed.


The supplied GitHub run 43847229962 failed in `test:security` while waiting for the Portal services panel in Admin Settings. The isolated browser fixture served only `bundle.js`, although Settings now uses real lazy-loaded panels. Updated the fixture to serve emitted single-directory JavaScript chunks with the correct MIME type and explicitly assert that chunks were requested; retained the actual Settings components, RTL/mobile checks, permission assertions and existing timeouts. Session presentation tests now transpile the real TypeScript source into an explicit ESM data URL using the installed TypeScript package, removing the ambiguous-package-type warning without changing the web package's module mode. All four session presentation tests pass without warnings.

Fresh MongoDB 7 Control persistence retry passed both suites / all 30 tests (639 seconds). The full API E2E phase follows separately. Parallel local lint/build checks were interrupted after available physical RAM fell below 500 MB; stopping only this task's process trees restored about 4.4 GB. These interrupted runs are not passes. Lint/types are being rerun with the installed Turbo's `--concurrency=1` option, then production build separately. The initial malformed local option forwarding was corrected; CI commands were not changed.

The reported security browser acceptance now passes completely: Arabic/English, 290?1536px, real lazy Settings panels, per-key reauthentication, portal toggles, cancelled resets, restricted staff permissions, maps, retry and empty states. The four session presentation tests also pass with no module-type or experimental-loader warning.

The fresh full API E2E attempt is not green: 4 suites passed / 4 failed (8 tests passed / 32 failed). Failures include targeted-performance and performance-remediation fixture setup timeouts, app setup timeout and MongoDB network timeouts in passkeys-store on the isolated localhost fixture. These are retained as failures; Control's separate 30 passing tests and the repaired security browser test do not constitute a passing full pipeline.

Final workspace lint passed all three tasks with zero diagnostics using one package at a time (12m35s locally). The fresh production build has loaded the updated Next configuration without the previous immutable-static-cache warning. The failed broad API run left open handles after reporting its failures; only that verified isolated Jest process was stopped, allowing its helper to close its own MongoDB.

Final workspace TypeScript passed all four tasks (5m07s locally). Production build of the final source passed all three tasks (6m14s, two cache hits). Next compiled, typechecked and generated every route without the redundant Cache-Control warning. Fresh artifact checks passed for the root route, removal of the duplicate static cache override and API runtime flag. A final API-only E2E retry is being run after these tools have completed, using a new isolated MongoDB 7 process.

API E2E fixture TypeScript completed with exit 0. The API-only replica-set retry still exceeded targeted-performance setup/teardown deadlines while localhost createIndexes commands took 57?63 seconds, despite recovered free RAM. It was stopped after the setup failure was recorded. A final fresh standalone localhost API fixture is being checked to match CI's general API server topology (Control continues to use its separately verified replica set). No production index or test deadline was changed.


### Final follow-up status

| Check | Result |
| --- | --- |
| Reported security/settings Chromium failure | PASS after serving actual lazy JavaScript chunks; original assertions/timeouts retained |
| Session presentation | PASS 4/4, repeated on final source with no module-type warning |
| Attempt comparison Chromium | PASS, bilingual pagination, stale review, IC carry/undo |
| Control real database workflow | PASS 30/30 across two suites |
| Validation / real XLSX / workflow safety | PASS 16/16 |
| Workspace lint | PASS all 3 tasks, zero diagnostics |
| Workspace TypeScript | PASS all 4 tasks |
| API E2E fixture TypeScript | PASS |
| Final production build | PASS all 3 tasks; no duplicate Next static-cache warning |
| API runtime / root route / static-cache artifacts | PASS |
| Full API E2E on local Windows | NOT PASS: replica-set fixture setup/network timeouts; standalone retry exited before tests with Windows process code 3221226505 |
| Remote GitHub workflow after these edits | Not run or certified; repository Actions require authenticated access |

The standalone retry's test runner exited with process code 3221226505 before emitting JavaScript/test diagnostics, and its helper closed its own test MongoDB. No more database retries were made. This is a validation limitation, not a claim that all CI stages passed. The supplied security failure has a tested fix. Final diff check passed. No commit, push, deployment or live database mutation was performed.

### 2026-11-16: CI fixture index URL mismatch

The supplied GitHub API E2E log reports seven passing suites and one failing
suite: `fixture-indexes.e2e-spec.ts` rejects the workflow's
`mongodb://localhost:27017/student-portal-e2e` URL before any index provisioning.
Its guard accepted only `127.0.0.1`, unlike `run-e2e.cjs`.

The fixture now accepts the runner's same explicit loopback hosts and isolated
test database naming rule. It still rejects remote hosts, credentials, query
parameters and non-test database names. No application code, production indexes,
test assertions or timeouts changed.

Validation: changed-file ESLint and E2E TypeScript passed using the installed
tools directly; the database runner safety tests passed 4/4. Sandboxed child
processes stalled, and the local pnpm launcher could not verify/download its
configured version from the registry, so those attempts are not passing checks.
The successful checks were repeated outside the sandbox without changing
package versions or bypassing package signature verification.

The repaired fixture passed both real-MongoDB tests (2/2) on a fresh standalone
localhost database, including idempotent index creation, unique/TTL/partial
index metadata, duplicate rejection and rejection of a remote model before DDL.
The broad local API retry hit the previously observed targeted-performance
60-second setup timeout; it was stopped after recording that failure and its
helper closed its own database. That suite passed in the supplied GitHub log.
The targeted fixture result is not a claim that the full remote workflow has
already passed. No commit, push, deployment or production data change occurred.

### 2026-11-16: missing post-deployment authentication probe

Release `6fc0b33a95156637eb84195f49636e938556f99c` passed its internal
deployment health checks, but the runner could not load
`scripts/auth-readiness.cjs`. Both that probe and its tests existed locally but
were excluded by the broad `/scripts/*` gitignore rule and absent from the Git
checkout. Explicit exceptions now make both files available for inclusion in the
release. The deployment job also installs Node 24 before verification, matching
the validation job, and the probe command indentation is corrected.

The workflow regression checks require both files to exist and be allowed by
gitignore, and require Node 24 setup before public verification. The probe uses
only anonymous GET requests: it expects valid passkey capability JSON and a
normal 401 response for `/api/auth/me`. Its live read-only check against
`https://bhi47.app` passed both endpoints. This confirms those public endpoints;
it does not claim an authenticated login or a new deployment was tested.

Verification: the exact workflow policy/report/readiness command passed 19/19
tests outside the sandbox. Its earlier sandboxed run timed out in the existing
real-Jest report contract; no timeout or assertion was relaxed. Both readiness
files are now visible as new Git files and must be included with the workflow
and gitignore changes in the next commit. Final diff whitespace checks passed.

### 2026-11-16: deployment setup-node requires an absent pnpm executable

The added deployment Node setup omitted `package-manager-cache: false`.
`actions/setup-node@v5` automatically detects the root `packageManager` field and
tries `pnpm store path` to restore its cache. The deploy-only job does not install
pnpm because its public checks use standalone Node scripts. Explicitly disabling
automatic package-manager caching for that step removes this unnecessary
dependency; validation still installs pnpm before enabling its explicit cache.

Regression checks cover both configurations, the auth probe and the existing
deployment gates: 12/12 tests passed. No application code or dependency version
changed. The reported punycode deprecation warning is separate from the fatal
missing-executable error. The updated remote workflow has not been run here.

### 2026-11-17: restore banned midterm entry

Restored `banned` alongside `present` and `absent` in the shared midterm state
contract. The real workbook select, Excel validation lists, mutation validation
and historical CSV/XLSX validation now use that contract. Other special midterm
states remain unavailable. Control state-management permission is still required
for banning, with no mandatory reason. The component contributes zero while
retaining its status; coursework and final remain independent. A banned midterm
does not by itself produce a final FX outcome. Arabic/English help and validation
messages reflect the updated rule.

Validation passed: 93 tests across Control mutation, workbook XLSX round-trip and
official-result suites; seven historical preview tests; real bilingual workbook
browser acceptance with 3,001 synthetic students, banned-midterm autosave without
a reason and existing retry/navigation checks; API and web TypeScript; changed
API file ESLint; shared build. A new test fixture argument and an old invalid-status
expectation were corrected before these final passing runs. No production data
was changed and no deployment was performed. Existing in-progress historical
publication changes were preserved; these results do not certify that separate
feature or the complete remote CI workflow.
