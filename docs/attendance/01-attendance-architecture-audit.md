# BH47A — QR-Based Attendance System: Architecture Audit

**Document Version:** 1.0.0  
**Date:** September 2026  
**Status:** Approved / Planning Phase  
**Author:** Senior Full-Stack Software Architect  

---

## 1. Executive Summary

This architecture audit evaluates the BH47A Student Portal codebase to design and implement a production-grade, secure, rotating QR-based attendance system. The audit covers existing database schemas, authentication/authorization layers, API infrastructure, frontend capabilities, and architectural gaps to ensure zero redundant models are introduced, database constraints guarantee data integrity, and university staff (Doctors & Instructors) can seamlessly manage attendance sessions.

---

## 2. Existing Architecture Overview

### 2.1 Monorepo Structure
The project is a `pnpm` monorepo containing:
- `apps/api`: NestJS 11 backend service running on Node.js / Express with Mongoose 8 and TypeScript.
- `apps/web`: Next.js 16 App Router web frontend with React 19, Tailwind CSS 4, Radix UI primitives, Lucide icons, next-intl for English & Arabic RTL support, and TanStack Query v5.
- `packages/shared`: Shared TypeScript package (`@student-portal/shared`) exposing shared enums, role constants, permission strings, validation rules, and contract types.

### 2.2 Database & ORM
- **Engine**: MongoDB with Mongoose 8.
- **Connection**: Managed via `DatabaseModule` in `apps/api/src/database/database.module.ts`.
- **Conventions**: Explicit schemas using `@Schema({ timestamps: true })`, strong typed documents, and schema-level compound indexes.

### 2.3 Authentication & Authorization
- **Authentication**: JWT authentication with Passport (`JwtStrategy`), supporting httpOnly cookies and Bearer tokens. Password hashing via `bcrypt`.
- **Roles**: Defined in `@student-portal/shared` as:
  - `ROLES.ADMIN = 'admin'`
  - `ROLES.STAFF = 'staff'`
  - `ROLES.STUDENT = 'student'`
- **Staff Profiles & Roles**:
  - Both university Doctors and Instructors operate under `role: 'staff'`.
  - Granular permissions are assigned to staff via `user.permissions: string[]`.
  - Role-based and permission-based route guards (`RolesGuard`, `PermissionsGuard`, `@Roles()`, `@Permissions()`) are implemented in `apps/api/src/modules/auth/guards/`.
  - Frontend admin layout (`apps/web/src/app/[locale]/admin/layout.tsx`) selectively renders pages and checks permissions using `useAuth()`.

---

## 3. Existing Domain Models & Schemas

| Domain Concept | Existing Model & Location | Current Responsibilities & Limitations |
| :--- | :--- | :--- |
| **User** | `User` in `apps/api/src/modules/users/schemas/user.schema.ts` | Holds credentials, roles (`admin`, `staff`, `student`), permissions list, userCode/studentCode, isActive, login security. |
| **Student Profile** | `StudentProfile` in `apps/api/src/modules/students/schemas/student-profile.schema.ts` | Contains student academic metadata: `fullName`, `level`, `group`, `section`, `department`, `academicYear`, `semester`, `enrollmentStatus` (`active`, `suspended`, etc.). |
| **Staff Profile** | `User` with `role: 'staff'` + `StaffAuditLog` in `apps/api/src/modules/staff-management/` | Staff accounts are unified under `User`. Academic title (e.g. Doctor vs. Teaching Assistant/Instructor) and assigned academic duties are not yet formally segregated into a separate profile. |
| **Course** | `Course` in `apps/api/src/modules/courses/schemas/course.schema.ts` | Stores course catalog definitions: `code`, `name`, `nameAr`, `level`, `semester`, `creditHours`, prerequisites. Does **not** link directly to assigned teaching staff. |
| **Course Registration** | `CourseRegistration` in `apps/api/src/modules/registrations/schemas/course-registration.schema.ts` | Stores student semester course selections: `studentId`, `courses: string[]` (array of course codes), `academicYear`, `semester`, `status` (`pending`, `approved`, `rejected`). Source of truth for student course eligibility. |
| **Legacy Attendance** | `Attendance` in `apps/api/src/modules/attendance/schemas/attendance.schema.ts` | Stores aggregate semester lecture counters only: `studentId`, `studentCode`, `academicYear`, `semester`, `totalLectures`, `attendedLectures`, `absenceLectures`, `attendancePercentage`. **Lacks lecture/section session records and check-ins.** |
| **Class/Section Schedule** | **None** (Only `ExamSchedule` exists for exams) | No live timetable or section schedule model exists in the database. Staff currently navigate courses directly. |

---

## 4. Reusable Components & Infrastructure

1. **Authentication & Session Extraction**:
   - `@CurrentUser()` decorator extracts the authenticated user (`_id`, `role`, `studentCode`, `permissions`).
   - `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` protect endpoints reliably.
2. **Student Enrollment Verification**:
   - `CourseRegistration` collection stores approved registrations (`status: 'approved'`) containing enrolled `courses: string[]`.
   - `StudentProfile` contains student `level`, `group`, `section`, and `enrollmentStatus: 'active'`.
3. **Frontend Component System**:
   - Reusable UI primitives in `apps/web/src/components/ui/` (`Card`, `Button`, `Badge`, `Dialog`, `Progress`, feedback states `LoadingState`, `ErrorState`, `EmptyState`).
   - Dark teal theme and RTL layout support via `Cairo` font and Tailwind CSS.
4. **Real-Time Delivery**:
   - NestJS native Server-Sent Events (`@Sse()`) can be utilized using RxJS `Subject` / `Observable` without adding heavy external WebSocket dependencies.

---

## 5. Architectural Problems & Deficiencies Identified

1. **Missing Attendance Session & Check-in Records**:
   - The current `Attendance` schema only tracks aggregate counts (`totalLectures: number`, `attendedLectures: number`). There is no record of individual lectures/sections, dates, times, attendance methods, or verification.
2. **Missing Staff Course Assignment Link**:
   - Courses exist independently of staff accounts. Without an assignment mechanism, any staff member could theoretically attempt to start attendance for any course.
3. **Missing Attendance Permissions**:
   - `packages/shared/src/constants/permissions.ts` defines permissions for students, courses, grades, complaints, advising, and exam schedules, but has zero permissions defined for attendance sessions or manual marking.
4. **No Real-Time QR Invalidation or Rotation**:
   - Static QR codes allow students to take screenshots and share them via WhatsApp/Telegram to absent peers. A cryptographic, short-lived rotating token (20–30s TTL) is required.
5. **No Database Uniqueness Guarantee on Check-ins**:
   - Without a `UNIQUE(sessionId, studentId)` compound index at the database level, concurrent scan requests could lead to duplicate attendance records under high concurrency (e.g. 100+ students scanning at the same second).

---

## 6. Proposed Architectural Changes

```text
User (role: 'staff')
   │
   ├── Staff Course Assignment (CourseStaffAssignment)
   │        │
   │        ├── Course (code, level, semester)
   │        └── Academic Duty (doctor: LECTURE | instructor: SECTION/LAB)
   │
   └── AttendanceSession
            ├── courseCode, sessionType, group, section, academicYear, semester
            ├── createdBy (Staff User ID)
            ├── status: 'OPEN' | 'CLOSED' | 'EXPIRED'
            ├── startsAt, expiresAt, closedAt
            ├── sessionSecret (HMAC secret for rotating QR tokens)
            │
            └── AttendanceRecord [UNIQUE(sessionId, studentId)]
                     ├── studentId (ref: User)
                     ├── studentCode
                     ├── status: 'present' | 'late' | 'excused'
                     ├── method: 'qr' | 'manual'
                     ├── checkedInAt (Server Timestamp)
                     └── auditTrail
```

### 6.1 Domain Schemas to Introduce
1. **`AttendanceSession`** (`apps/api/src/modules/attendance/schemas/attendance-session.schema.ts`):
   - Manages the lifecycle of a class attendance window.
   - Centralizes session configuration (`durationMinutes: 15`, `qrRotationSeconds: 25`, `lateAfterMinutes: 10`).
   - Stores a cryptographically secure `sessionSecret` (never exposed to clients) used to generate and verify rotating TOTP-style QR tokens.
2. **`AttendanceRecord`** (`apps/api/src/modules/attendance/schemas/attendance-record.schema.ts`):
   - Manages individual student check-ins.
   - Enforces database constraint: `{ sessionId: 1, studentId: 1 }, { unique: true }`.
   - Records server check-in timestamp, method (`'qr'` vs `'manual'`), status (`'present'`, `'late'`, `'excused'`), and an audit log of manual staff overrides.
3. **`CourseStaffAssignment`** (`apps/api/src/modules/attendance/schemas/course-staff-assignment.schema.ts`):
   - Links staff members to courses/groups/sections with their academic position (`'doctor'` for lectures, `'instructor'` for sections/labs).
   - Allows staff to immediately see "My Classes" when opening the attendance dashboard.
   - Enforces backend authorization: staff can only initiate attendance for courses/sections assigned to them (Admins bypass this restriction).

### 6.2 QR Security & Rotation Architecture
- **No Sensitive / Control Data in QR**: The QR payload contains only a check-in URL with an opaque token:
  `/attendance/check-in?t=<OPAQ_TOKEN>`
- **Token Composition**:
  - `token = base64url(sessionId + ":" + timeBucketIndex + ":" + hmacSignature)`
  - `timeBucketIndex = Math.floor(Date.now() / (25 * 1000))`
  - `hmacSignature = hmac_sha256(sessionId + ":" + timeBucketIndex, sessionSecret)`
- **Validation Pipeline**:
  1. Authenticate student via JWT cookie.
  2. Parse token and verify HMAC against the session's internal `sessionSecret`.
  3. Validate `timeBucketIndex` against current server time bucket (accepting only current or previous bucket for a 5s network grace period; any older token is rejected with `ATTENDANCE_QR_EXPIRED`).
  4. Verify `AttendanceSession` is `OPEN` and within `startsAt` to `expiresAt`.
  5. Verify student enrollment in `CourseRegistration` for this `courseCode`.
  6. Verify group/section if the session is a `section` or `lab`.
  7. Compute status: if `serverTime <= startsAt + lateAfterMinutes` -> `PRESENT`, else -> `LATE`.
  8. Atomic insert into `AttendanceRecord` (idempotent duplicate scan handling).
  9. Emit real-time event to staff's SSE channel.

### 6.3 Real-Time Staff Feed
- Endpoint: `GET /api/attendance/sessions/:id/live` (SSE stream).
- Staff screen subscribes when displaying the active QR code.
- Each verified student check-in instantly streams to the staff dashboard without polling.

### 6.4 Permissions to Add to `@student-portal/shared`
- `ATTENDANCE_READ: 'attendance.read'`
- `ATTENDANCE_WRITE: 'attendance.write'`
- `ATTENDANCE_SESSION_CREATE: 'attendance.session_create'`
- `ATTENDANCE_SESSION_CLOSE: 'attendance.session_close'`
- `ATTENDANCE_MANUAL_MARK: 'attendance.manual_mark'`
- `ATTENDANCE_REPORTS: 'attendance.reports'`

---

## 7. Migration & Backwards Compatibility
- The existing `Attendance` aggregate model (`/students/me/attendance`) is preserved and will be automatically synchronized or updated whenever sessions close or student records are marked, ensuring the student portal dashboard KPIs remain intact.
