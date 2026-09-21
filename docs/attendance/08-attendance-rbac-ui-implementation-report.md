# BH47A — Attendance UI/UX, RBAC, National ID Permission & Authentication Upgrade Report

**Status:** Completed & Verified  
**Date:** September 21, 2026  
**Scope:** Full-Stack Architecture, National ID Authorization Boundary, Student/Staff/Admin Attendance Dashboards, Forced First-Login, Password Policy, and Admin Student Password Reset.

---

## 1. Executive Summary & Verification Matrix

```text
BH47A Attendance & Authentication Upgrade
─────────────────────────────────────────────
National ID Security Boundary (Unmasking & Strict Omission)    ✓ PASS
RBAC & Granular Permission Management                           ✓ PASS
Admin Permission & Password Reset Fix                           ✓ PASS
Staff Attendance Dashboard & Start Confirmation                 ✓ PASS
Cryptographic Rotating QR Attendance                            ✓ PASS
Live Attendee Stream with SSE & Status/Search Filters           ✓ PASS
Student Attendance Dashboard Redesign (KPIs & History)          ✓ PASS
Admin System-Wide Attendance & Correction Audit                 ✓ PASS
Staff-Course Assignment Enforcement                             ✓ PASS
First Login Forced Password Change & National ID Protection     ✓ PASS
Responsive Mobile/Tablet/Desktop Layouts                        ✓ PASS
RTL & Dark Teal Theme Consistency                               ✓ PASS
Unit & Integration Tests (17 suites, 72/72 tests)               ✓ PASS
TypeScript Strict Typecheck & Monorepo Production Builds        ✓ PASS
```

---

## 2. National ID Security & Permission-Based Unmasking

### The Problem
Previously, student National IDs were masked in the database query layer (`301****402`) and projected with `-nationalId`. This caused masked strings to appear with a "Copy" button in admin views, while unauthorized staff and users still received the masked field.

### The Architectural Solution
1. **Permission Definition**:
   Added `PERMISSIONS.STUDENTS_VIEW_NATIONAL_ID: 'students.view_national_id'` to `@student-portal/shared` and included it in `STAFF_ASSIGNABLE_PERMISSIONS`.
2. **Backend Authorization Boundary**:
   In `apps/api/src/modules/students/services/student-query.service.ts`:
   - Inspects caller user object (`role` and `permissions`).
   - If caller is `admin` or possesses `students.view_national_id`:
     - Populates full 14-digit `nationalId` from the database.
     - Strips any legacy `nationalIdMasked` property.
   - If caller is **unauthorized**:
     - Excludes `nationalId` completely from the database projection (`select('-nationalId')`).
     - Strictly omits `nationalId` from the serialized response object (`delete restProfile.nationalId`).
     - Unauthorized API consumers **never receive the field at all** (cannot be inspected via DevTools or network interception).
3. **Frontend Presentation**:
   In `student-table.tsx` and `student-detail-dialog.tsx`:
   - When authorized and present: renders the full 14-digit National ID with the Copy action.
   - When unauthorized or omitted: renders a clean, non-sensitive `Restricted / غير مصرح` badge.

---

## 3. Admin Student Password Reset Fix & Authentication Hardening

### The Problem
In `apps/web/src/app/[locale]/admin/students/page.tsx`, clicking "Reset Password" from the action menu set `isResetOpen(true)`, but **no reset dialog component was mounted in the JSX**, causing the button to silently do nothing. Furthermore, the reset password endpoint needed to securely default to the student's 14-digit National ID hash while forcing password change on next login.

### The Implementation
1. **Dialog Component (`reset-student-password-dialog.tsx`)**:
   - Displays student identity card (Name & Student Code).
   - Informs the administrator of immediate security ramifications:
     - All active student sessions are terminated immediately.
     - The temporary password is set to the student's 14-digit National ID (or an optional custom temporary password).
     - The student is forced to change their password upon their next sign-in.
   - Mounted and wired to `admin/students/page.tsx` with invalidation of student queries on success.
2. **Backend Password Reset Pipeline (`students.service.ts` & `users.service.ts`)**:
   - `resetPassword` checks if `dto.newPassword` is provided; if omitted, it retrieves the student's registered National ID internally.
   - Calls `updatePassword(userId, password, true)` which:
     - Hashes the password with bcrypt (12 rounds).
     - Atomically sets `mustChangePassword = true`.
     - Increments `tokenVersion: 1`, invalidating any stale JWT tokens/sessions.
     - Updates `passwordChangedAt`.
   - Sends a dual-language email notification informing the student of the reset without exposing sensitive plaintext credentials.
3. **Password Change Protection (`auth-password.service.ts`)**:
   - Rejects setting the permanent password equal to the student's National ID (`New password cannot be your National ID / لا يمكن استخدام الرقم القومي ككلمة مرور دائمة`).
   - Rejects reusing the current temporary password.
   - Clears `mustChangePassword = false` upon valid change and increments `tokenVersion`.
   - Distinguishes between mandatory rules (8+ characters, uppercase, lowercase, numbers) and recommended enhancements (special characters `@#$%`).

---

## 4. Student Attendance Dashboard Redesign

### The Problem
Previously, `apps/web/src/app/[locale]/dashboard/attendance/page.tsx` rendered an empty placeholder whenever the legacy `/students/me/attendance` endpoint returned an empty array, completely hiding real-time QR attendance history.

### The New Architecture
Transformed into a multi-dimensional dashboard:
1. **KPI Statistics Banner**:
   - Overall Attendance Percentage with dynamic status badge (`Good Academic Standing` vs `At Risk`).
   - Counts for `Present`, `Late`, `Excused`, and `Absent`.
2. **Course Breakdown Cards**:
   - Shows attendance percentage and progress bar per enrolled course.
   - Breakdown of present, late, and absent sessions.
   - Quick-filter button to view sessions for that specific course.
3. **Filterable Session History Log**:
   - Dropdown filters for Course Code and Attendance Status (`All | Present | Late | Excused | Absent`).
   - Desktop view: responsive data table with course, session type badge, check-in time, method (`QR Code` vs `Manual`), and status badge.
   - Mobile view: stacked cards optimized for touch screens and smaller viewports.
   - Informative empty state explaining how rotating QR check-in works in class.

---

## 5. Staff Attendance Management & Live Operations

### Assigned Classes & Pre-Session Confirmation
1. **Staff Course Assignment**:
   - Doctors and Teaching Assistants see only courses assigned to them via `CourseStaffAssignment`.
   - "Start Attendance" presents a configuration dialog displaying:
     - Course name, code, and academic level.
     - Session Type selection (`Lecture`, `Section`, `Lab`).
     - Group and Section inputs.
     - Configurable session duration (default: 15 min), late threshold (default: 10 min), and anti-cheat rotation interval (25 sec).

### Live Presenter & Stream
2. **Active Presenter View (`active-session-presenter.tsx`)**:
   - Large, high-contrast QR code for lecture hall projectors.
   - Real-time rotating token countdown with visual progress bar.
   - Live KPI cards: Total Checked In, Present (on-time), Late.
   - Real-time Server-Sent Events (SSE) attendee list.
   - **New**: Live attendee toolbar with search by name/code and status filter tabs (`All`, `Present`, `Late`).
   - Manual override action allowing staff to correct attendance status with reason recording.

---

## 6. Admin Attendance Operational Dashboard

### Dual-Tab Architecture (`admin/attendance/page.tsx`)
Administrators have access to:
1. **My Classes & QR**: Launching attendance for courses taught directly.
2. **System Overview & Sessions (`admin-attendance-overview.tsx`)**:
   - System-wide KPIs: Total Sessions, Active Live Sessions, Total Checked In, Present, Late.
   - Global filter: Status (`All`, `Active LIVE`, `Closed`), Search by course code, name, or staff member.
   - Sessions data table with live status, attendee counters, and quick actions.
   - Session Attendance Register modal allowing administrators to inspect every student check-in for any session.
   - Manual status correction dialog with audit log reason.

---

## 7. Files Created & Modified

### Created Files:
1. `apps/web/src/features/students/components/reset-student-password-dialog.tsx`: Confirmation dialog for administrator password reset with session revocation warning.
2. `apps/web/src/features/attendance/components/admin-attendance-overview.tsx`: Operational overview dashboard for administrators.
3. `docs/attendance/08-attendance-rbac-ui-implementation-report.md`: This comprehensive implementation report.

### Modified Files:
1. `packages/shared/src/constants/permissions.ts`: Added `STUDENTS_VIEW_NATIONAL_ID`.
2. `apps/api/src/modules/students/services/student-query.service.ts`: Permission-aware National ID unmasking & strict omission.
3. `apps/api/src/modules/students/students.controller.ts`: Passed `CurrentUser` into `findAll`, `findOne`, and `resetPassword`.
4. `apps/api/src/modules/students/students.service.ts`: Defaulted temporary password to 14-digit National ID, set `mustChangePassword = true`, incremented `tokenVersion`.
5. `apps/api/src/modules/students/dto/student.dto.ts`: Made `newPassword` optional in `ResetPasswordDto`.
6. `apps/api/src/modules/users/users.service.ts`: Supported optional `mustChangePassword` in `updatePassword`.
7. `apps/api/src/modules/auth/services/auth-password.service.ts`: Prohibited setting permanent password to National ID or previous password.
8. `apps/api/src/modules/attendance/services/attendance-report.service.ts`: Added course-level breakdown to `getStudentAttendanceHistory`.
9. `apps/api/src/modules/attendance/services/attendance-session.service.ts`: Added `getAdminOverview` and typed with `AdminOverviewResponse`.
10. `apps/api/src/modules/attendance/attendance.controller.ts`: Added `GET /api/attendance/admin/overview`.
11. `apps/web/src/features/attendance/api/attendance-api.ts`: Added `getAdminOverview` and updated `StudentAttendanceHistoryResponse`.
12. `apps/web/src/features/students/api.ts`: Updated `resetStudentPassword` signature.
13. `apps/web/src/features/students/components/student-table.tsx`: Unmasked National ID display and removed legacy masked fallback.
14. `apps/web/src/features/students/components/student-detail-dialog.tsx`: Unmasked National ID display and removed legacy masked fallback.
15. `apps/web/src/app/[locale]/admin/students/page.tsx`: Mounted `ResetStudentPasswordDialog` and updated permission checking.
16. `apps/web/src/app/[locale]/login/change-password/page.tsx`: Differentiated mandatory vs. recommended password rules.
17. `apps/web/src/app/[locale]/dashboard/attendance/page.tsx`: Complete dashboard redesign.
18. `apps/web/src/app/[locale]/admin/attendance/page.tsx`: Added admin tab switcher and mounted `AdminAttendanceOverview`.
19. `apps/web/src/features/attendance/components/active-session-presenter.tsx`: Added live attendee search and status filter tabs.

---

## 8. Verification Results

- **Unit & Integration Tests**:
  ```powershell
  pnpm --filter @student-portal/api test
  # Test Suites: 17 passed, 17 total
  # Tests:       72 passed, 72 total
  ```
- **Monorepo Production Builds**:
  ```powershell
  pnpm --filter @student-portal/shared build  # Exit code 0
  pnpm --filter @student-portal/api build     # Exit code 0
  pnpm --filter @student-portal/web build     # Exit code 0 (all 37 Next.js routes compiled)
  ```
