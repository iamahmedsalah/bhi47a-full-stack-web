# Control permissions and student result visibility — 13 November 2026

## Independent permissions

Admins retain full access. Staff need explicit permissions; changing a staff member's permissions takes effect on their next authenticated API request.

| Action | Permission |
| --- | --- |
| Return or reopen a sheet for review | `control.sheets.review` |
| Approve midterm or coursework | `control.sheets.approve` |
| Approve final results | `control.final.approve` |
| Publish or withdraw approved results | `grades.publish` |
| Configure student access, levels, components, overrides and schedules | `grades.visibility.manage` |

Control actions still require `control.access` and the appropriate course scope. The publishing course picker needs Control view access. The Grades administrative page retains its `grades.read` access requirement. Neither review nor ordinary sheet approval implies final approval. Editing grades (`grades.write`) does not grant publication or visibility management, including an attempted `isPublished` field in a single-grade request. Newly added legacy grades default to unpublished.

Existing historical approvals/publications are retained. Administrators can use the existing reopen, return and withdrawal actions to review results previously approved by a review-only account. This change does not erase grades or reverse academic records automatically.

## Visibility and publication are separate

### Instructor quizzes are independent

The Grades visibility dialog and publication APIs manage **coursework, midterm and final** results only. Quizzes remain under the course instructor's own publication/release settings. Closing the official results switch, changing its dates or levels, and adding course/student visibility overrides do not hide or reveal quizzes. Bulk official-grade publication no longer updates quiz publication flags, including when no component is selected. Explicit quiz publication or visibility requests through these official-grade endpoints are rejected. Existing quiz publication records are retained; there is no backfill that publishes quizzes.

Student course-quiz reads still require the quiz record to be published and continue to respect financial/administrative holds. Coursework's quiz contribution remains part of the official coursework total; it is distinct from publishing individual quizzes. The dialog now has a 768px maximum width and exposes only the three official components in both component controls and override selection.

1. Enter and review component marks in Control.
2. An authorized approver approves the appropriate component sheet.
3. An authorized publisher previews and activates the release on Grades. Activation includes the preview digests; stale previews must be repeated.
4. Student visibility settings decide whether a released result can be shown. Enabling a level never publishes drafts or bypasses approval.

The new dialog displays the effective master/window restriction and has separate controls for student levels, exam components, and course/student overrides. Clearing a schedule sends explicit `null` values and removes the stored deadlines. Picker values are interpreted in `Africa/Cairo`, independent of the browser timezone. Invalid or reversed schedules are rejected, including a partial update that conflicts with the other stored deadline.

All of these must permit viewing: the master switch, opening/closing window, and the result's course academic level. Per the confirmed institute policy, **course level is the default**, including historical settings without `gradesLevelBasis`. A Level 3 student may see a released Level 1 course when Level 1 is allowed. An explicit `student` basis remains available if the administration deliberately wants current-student-level restrictions instead. Component settings then apply, followed by matching course/student rules in order; the last matching rule wins. A rule with both codes targets that student in that course only. Overrides never bypass master, time or the selected level basis.

For example, to expose only one student's midterm in course 111, hide midterm globally and add a visible midterm rule containing both codes. Ensure the master switch is open, the course's level is allowed, the current time is within the window, and the result has already been approved and published. Approval alone does not activate a release. Existing releases are not changed by editing visibility settings.

The API applies visibility to both legacy and released Control results, and to quiz-grade inquiry. Hidden components are omitted; complete official totals are omitted if they could disclose a hidden component by subtraction. Visibility settings do not change stored marks, release evidence, GPA or academic progression.

Opening is inclusive and closing is exclusive: results hide at `now >= closeAt`. The student page schedules a deadline refresh and hides its cached results at the closing boundary without a reload. It checks the portal settings every minute; changed visibility versions trigger a result refresh. API reads always check the current settings.

## Attendance belongs to each component

Each mark is identified by student, course, year, term **and component**. The status dropdown edits the currently selected component; the column heading names it explicitly. A student can be absent in midterm and present in final, or the reverse. Student results preserve each component's status rather than replacing every status with one global attendance value.

Absent and banned components contribute zero to the total while retaining their original statuses. Student API output normalizes their numeric grade to zero, even if an old mark retained a number; Arabic results show `غائب` or `محروم` and English results show `Absent` or `Banned`. The original stored mark and release evidence are unchanged. Under the configurable default policy, an absent midterm does not automatically fail a present final; an absent final fails the official course result. Excused, incomplete and withheld states retain their existing separate policies.

## Verification

Regression coverage includes the independent permission matrix, direct unauthorized approval, single-grade publication bypass attempts, scoped visibility, exact schedule boundaries, date clearing, and independent midterm/final absence. The browser release acceptance also exercises bilingual settings, mobile width, visibility-only staff, grade-edit-only staff, and hiding a real already-open student results page at its deadline. Replica-set integration verifies persistence and publication with actual synthetic MongoDB records.

This document describes local implementation. Production verification and deployment sign-off remain separate; no live student records were modified.

### Completed local evidence — earlier permission increment

- Workspace lint passed, with no reported warnings/errors; workspace types and all three production builds passed. Root-route and API runtime artifact checks passed.
- Final API unit run: 97 suites / 927 tests passed.
- Real isolated Control replica-set integration: 17 tests passed. The expanded publication scenario initially exceeded its unchanged 30-second limit; independent visibility scenarios replaced the added work in that scenario, and the complete integration suite passed with the same limits and assertions.
- Bilingual workbook and release/visibility browser checks passed, including mobile layout, both directions of component absence and automatic hiding on an already-open results page.
- General startup/authentication initially exceeded its fresh database setup limit. A warm rerun passed 17/18, with a student WebAuthn case exceeding 30 seconds; that case passed alone with its unchanged timeout. The final complete startup/authentication rerun subsequently passed **18/18**, with no skipped tests and no timeout/assertion changes (`outputs/visibility-api-startup-accepted.log`). This verifies the startup/authentication file, not every broad API E2E file. The synthetic localhost MongoDB fixture was stopped after verification.

The new permissions must be assigned explicitly to staff who need publication or visibility control. Existing staff with only `grades.write` lose those unrelated powers; admins retain access. Review prior approvals in the existing audit history where the former review-to-approval implication may have affected results.

## Course 111 and compact result management follow-up

### Tuition holds

Student results and quizzes now respect the existing Student Profile `isBlocked` flag. An unpaid, blocked student receives no grade rows and sees “النتيجة محجوبة بسبب عدم سداد المصروفات الدراسية” / “Results withheld due to unpaid tuition fees” when the results window is otherwise open. Other administrative holds use a generic message; internal block notes are not exposed. Master closure, dates and level restrictions keep their precedence.

Removing the hold restores access only to approved, published and otherwise visible results. Payment status alone does not override an explicit hold or create a new hold for an administratively unblocked student. Paid/exempt students without a hold remain eligible. The status visibility version includes the hold state, so the existing 60-second status refresh also refreshes grade data after a hold changes. A student can reload immediately after staff remove the hold. No student records or financial status are changed by reading results.

Tuition follow-up verification passed: **97 unit suites / 931 tests**, **19 real Control integration tests**, bilingual release/visibility browser acceptance, all workspace lint and typecheck tasks, and the isolated API production build. The integration case verifies both a released grade and an actual published quiz before/after removing a hold. Detailed evidence and build limitations are recorded in `docs/ci-reports.md`.

The final isolated default Next.js/Turbopack production build also passed, including TypeScript, page generation and the root-route manifest audit. This supersedes the earlier local PostCSS timeout; production deployment and live-course sign-off are still separate.

The reported student belonged to Level 3 while only Levels 1 and 2 were allowed. The earlier student-level gate hid every result before considering that course 111 belongs to Level 1. The institute confirmed that visibility should follow **course level**. Missing/old settings now default to that policy; explicit current-student-level mode remains a deliberate option. Only the student's own published results are read. This does not disclose other students' marks, publish drafts or bypass release approval.

The manager now uses a compact full-width master strip instead of an expanded grid cell around one button. Levels occupy four columns on wide screens; exam components use equal three-column cells with consistent `Eye`/`EyeOff` icons and visible/hidden labels. Dates use two side-by-side fields with Cairo placeholders. Course/student overrides and release actions occupy their own sections. Arabic RTL and mobile layouts are covered by the browser fixture.

Synthetic course-111 acceptance uses a Level 3 student and a Level 1 midterm result: present `5 / 20`, absent `غائب` / `Absent`, and banned `محروم` / `Banned`. The student API returns zero grade and percentage for absent/banned components, preserving the original status and stored release evidence. The misleading “not approved” level message now describes visibility restrictions explicitly.

The real replica-set suite includes saving course-level visibility for an enrolled higher-level student. Local browser evidence is in `outputs/control-release-browser/visibility-ar-desktop.png`, `visibility-ar-mobile.png` and the `course111-<locale>-<status>.png` screenshots. These contain synthetic data, not live student records. Production deployment and live-course verification remain separate.

Final functional evidence for this increment: **97 API unit suites / 930 tests**, **18 Control replica-set tests**, and **18 startup/authentication tests** passed. The final compact browser acceptance passed both languages, all three course-111 statuses, automatic closing, permission separation and mobile geometry. Workspace TypeScript and lint passed; the compact web follow-up also passed ESLint. The first broad unit process exited abnormally on Windows (`-1073740791`) without totals; its unchanged rerun with temporary files on D completed successfully. No assertion, timeout or failure policy was relaxed.

Build verification uses source copies under `outputs/result-ui-production-check` because the user's development servers are running. Production web output and API compilation are isolated from their `.next` and `dist` directories. The first copied web build needed a temporary Turbopack root correction to resolve dependency junctions; that change exists only in ignored verification files, not repository configuration. The synthetic database fixture was shut down after integration checks.


## 14 November: performance and student exam presentation

- Control search and filters use native URL history for client-side state, avoiding a server navigation per change. Search input is debounced/deferred; typing a mark no longer reruns the full roster text filter. Autosave applies acknowledged row revisions to the cached workbook and refreshes only sheet metadata. Workflow submission fetches the current sheet revision, preserving concurrency checks. Failed requests retain drafts and idempotency keys.
- Student columns reflect available midterm/final rows only. Coursework is always excluded from student rows, controls and certificate columns; its attendance/quiz inputs and component breakdown are stripped from the response. A published final authorizes the official aggregate including coursework. This intentionally replaces the earlier rule that withheld the aggregate whenever coursework was hidden.
- Midterm shows a numeric mark or exam status, without a letter grade. Only official final results receive a course letter; published final special states show FX for banned and IC for incomplete. Absent/banned midterms contribute zero only to that component. Absent/banned finals retain coursework/midterm contributions, display their exam state and earn zero grade points. No historical student grades are rewritten automatically.
- Level GPA/performance cards were replaced by the stored academic warning count. Admin retains every permission as explicitly confirmed; staff approval/final approval remain separate explicit permissions.
- Excel entry keeps required identifiers, score/status and an optional reason (required for restricted-state changes). Revision and duplicate context columns are hidden, preserving legacy imports and stale-edit checks. A separate CourseContext sheet shows all contributions and exam statuses; score validation and status dropdowns guide entry. Unchanged rows are skipped. Absent/banned scores accept blank or zero and retain the exam status.

Verification for this increment is recorded in `docs/ci-reports.md`. No live student records or deployment were changed.


### Final clarification: midterm marks and incomplete finals

Midterm rows and printed certificates show marks/status only, without a course letter or a partial official aggregate. The API removes midterm letter grades. Normal course letters require an official final outcome; published final exceptions retain FX (banned) and IC (incomplete). Explicitly approved incomplete finals may release IC only when the other enabled contributions are entered; missing or other deferred components still block publication. IC carries no numeric official total or GPA points and does not award credit. This is status publication, not completion of the course result.
