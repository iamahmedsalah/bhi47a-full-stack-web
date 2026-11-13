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

1. Enter and review component marks in Control.
2. An authorized approver approves the appropriate component sheet.
3. An authorized publisher previews and activates the release on Grades. Activation includes the preview digests; stale previews must be repeated.
4. Student visibility settings decide whether a released result can be shown. Enabling a level never publishes drafts or bypasses approval.

The new dialog displays the effective master/window restriction and has separate controls for student levels, exam components, and course/student overrides. Clearing a schedule sends explicit `null` values and removes the stored deadlines. Picker values are interpreted in `Africa/Cairo`, independent of the browser timezone. Invalid or reversed schedules are rejected, including a partial update that conflicts with the other stored deadline.

All of these must permit viewing: the master switch, opening/closing window, and the student's academic level. Component settings then apply, followed by matching course/student rules in order; the last matching rule wins. A rule with both codes targets that student in that course only. Overrides never bypass master, time or level restrictions.

For example, to expose only one student's midterm in one course, hide midterm globally and add a visible midterm rule containing both codes. Ensure the master switch is open, the student's level is allowed, the current time is within the window, and the result has already been approved and published.

The API applies visibility to both legacy and released Control results, and to quiz-grade inquiry. Hidden components are omitted; complete official totals are omitted if they could disclose a hidden component by subtraction. Visibility settings do not change stored marks, release evidence, GPA or academic progression.

Opening is inclusive and closing is exclusive: results hide at `now >= closeAt`. The student page schedules a deadline refresh and hides its cached results at the closing boundary without a reload. It checks the portal settings every minute; changed visibility versions trigger a result refresh. API reads always check the current settings.

## Attendance belongs to each component

Each mark is identified by student, course, year, term **and component**. The status dropdown edits the currently selected component; the column heading names it explicitly. A student can be absent in midterm and present in final, or the reverse. Student results preserve each component's status rather than replacing every status with one global attendance value.

An absent component contributes zero to the total, while retaining its absent status. Under the configurable default policy, an absent midterm does not automatically fail a present final; an absent final fails the official course result. Excused, incomplete and withheld states retain their existing separate policies.

## Verification

Regression coverage includes the independent permission matrix, direct unauthorized approval, single-grade publication bypass attempts, scoped visibility, exact schedule boundaries, date clearing, and independent midterm/final absence. The browser release acceptance also exercises bilingual settings, mobile width, visibility-only staff, grade-edit-only staff, and hiding a real already-open student results page at its deadline. Replica-set integration verifies persistence and publication with actual synthetic MongoDB records.

This document describes local implementation. Production verification and deployment sign-off remain separate; no live student records were modified.

### Completed local evidence

- Workspace lint passed, with no reported warnings/errors; workspace types and all three production builds passed. Root-route and API runtime artifact checks passed.
- Final API unit run: 97 suites / 927 tests passed.
- Real isolated Control replica-set integration: 17 tests passed. The expanded publication scenario initially exceeded its unchanged 30-second limit; independent visibility scenarios replaced the added work in that scenario, and the complete integration suite passed with the same limits and assertions.
- Bilingual workbook and release/visibility browser checks passed, including mobile layout, both directions of component absence and automatic hiding on an already-open results page.
- General startup/authentication initially exceeded its fresh database setup limit. A warm rerun passed 17/18, with a student WebAuthn case exceeding 30 seconds; that case passed alone with its unchanged timeout. The final complete startup/authentication rerun subsequently passed **18/18**, with no skipped tests and no timeout/assertion changes (`outputs/visibility-api-startup-accepted.log`). This verifies the startup/authentication file, not every broad API E2E file. The synthetic localhost MongoDB fixture was stopped after verification.

The new permissions must be assigned explicitly to staff who need publication or visibility control. Existing staff with only `grades.write` lose those unrelated powers; admins retain access. Review prior approvals in the existing audit history where the former review-to-approval implication may have affected results.
