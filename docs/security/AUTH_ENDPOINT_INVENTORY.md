# Static endpoint inventory

Generated from source decorators. This is a review index, not proof of ownership validation or runtime behavior. All API routes inherit global guards unless explicitly exempted. Multiline/dynamic decorator expressions require manual review.

| Method | Route | Source | Declared policy / review requirement |
| --- | --- | --- | --- |
| GET | `/api/metrics` | `apps/api/src/core/metrics/metrics.controller.ts:32` | @OptionalAuth() |
| GET | `/api/admin/metrics/locked-accounts` | `apps/api/src/core/metrics/metrics.controller.ts:83` | @Roles('admin') |
| POST | `/api/admin/metrics/unlock-account/:id` | `apps/api/src/core/metrics/metrics.controller.ts:92` | @Roles('admin') |
| POST | `/api/admin/metrics/unlock-all-accounts` | `apps/api/src/core/metrics/metrics.controller.ts:101` | @Roles('admin') |
| GET | `/api/` | `apps/api/src/health.controller.ts:19` | @Public() |
| GET | `/api/health` | `apps/api/src/health.controller.ts:42` | @Public() |
| GET | `/api/admin/advising/students` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:42` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/advising/advisors` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:51` | @Roles('admin', 'staff') @Roles('admin') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| POST | `/api/admin/advising/advisors/assign-students` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:58` | @Roles('admin', 'staff') @Roles('admin') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/advisors/auto-distribute` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:68` | @Roles('admin', 'staff') @Roles('admin') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/cases` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:78` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/cases` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:87` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/advising/cases/:caseId` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:102` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/advising/cases/:caseId/course-map` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:111` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PATCH | `/api/admin/advising/cases/:caseId/status` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:120` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| PATCH | `/api/admin/advising/cases/:caseId/assign` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:130` | @Roles('admin', 'staff') @Roles('admin') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/cases/:caseId/generate-recommendations` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:141` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/cases/:caseId/recommendations` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:151` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PATCH | `/api/admin/advising/recommendations/:id` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:160` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/cases/:caseId/plans` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:170` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/cases/:caseId/plans` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:180` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/advising/plans/:planId` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:189` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PATCH | `/api/admin/advising/plans/:planId` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:198` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/plans/:planId/validate` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:208` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| POST | `/api/admin/advising/plans/:planId/approve` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:217` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/plans/:planId/graph` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:226` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PUT | `/api/admin/advising/plans/:planId/graph` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:235` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/cases/:caseId/notes` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:245` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| POST | `/api/admin/advising/cases/:caseId/notes` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:254` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/advising/cases/:caseId/audit-logs` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:264` | @Roles('admin', 'staff') @Roles('admin') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/advising/rules` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:274` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PATCH | `/api/admin/advising/rules` | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts:280` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/student/advising` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:23` | @Roles('student') |
| GET | `/api/student/advising/recommendations` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:27` | @Roles('student') |
| GET | `/api/student/advising/approved-plan` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:35` | @Roles('student') |
| GET | `/api/student/advising/registration-sheet` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:41` | @Roles('student') |
| POST | `/api/student/advising/request-review` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:52` | @Roles('student') |
| POST | `/api/student/advising/acknowledge` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:56` | @Roles('student') |
| POST | `/api/student/advising/assistant/messages` | `apps/api/src/modules/academic-advising/controllers/student-advising.controller.ts:60` | @Roles('student') |
| GET | `/api/students/me/academic-email` | `apps/api/src/modules/academic-emails/academic-emails.controller.ts:27` | @Roles('student') |
| GET | `/api/admin/academic-emails` | `apps/api/src/modules/academic-emails/academic-emails.controller.ts:34` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ACADEMIC_EMAILS_READ) |
| POST | `/api/admin/academic-emails/sync` | `apps/api/src/modules/academic-emails/academic-emails.controller.ts:44` | @Roles('admin') @RequirePermissions(PERMISSIONS.ACADEMIC_EMAILS_WRITE) |
| PATCH | `/api/admin/academic-emails/:id` | `apps/api/src/modules/academic-emails/academic-emails.controller.ts:60` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ACADEMIC_EMAILS_WRITE) |
| GET | `/api/admin/ai/settings` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:31` | @Roles('admin', 'staff') @Roles('admin') |
| PATCH | `/api/admin/ai/settings` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:38` | @Roles('admin', 'staff') @Roles('admin') |
| GET | `/api/admin/ai/chat-sessions` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:48` | @Roles('admin', 'staff') @Roles('admin') |
| GET | `/api/admin/ai/chat-sessions/:sessionId` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:55` | @Roles('admin', 'staff') @Roles('admin') |
| POST | `/api/admin/ai/analyze-student/:studentId` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:64` | @Roles('admin', 'staff') |
| POST | `/api/admin/ai/summarize-student/:studentId` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:73` | @Roles('admin', 'staff') |
| GET | `/api/admin/ai/usage-stats` | `apps/api/src/modules/ai/controllers/admin-ai.controller.ts:82` | @Roles('admin', 'staff') @Roles('admin') |
| GET | `/api/student/chat/status` | `apps/api/src/modules/ai/controllers/student-chat.controller.ts:20` | @Roles('student') |
| GET | `/api/student/chat/sessions` | `apps/api/src/modules/ai/controllers/student-chat.controller.ts:35` | @Roles('student') |
| GET | `/api/student/chat/sessions/:sessionId/messages` | `apps/api/src/modules/ai/controllers/student-chat.controller.ts:41` | @Roles('student') |
| POST | `/api/student/chat/sessions/:sessionId/end` | `apps/api/src/modules/ai/controllers/student-chat.controller.ts:50` | @Roles('student') |
| GET | `/api/attendance/my-classes` | `apps/api/src/modules/attendance/attendance.controller.ts:73` | @Roles('staff', 'admin') |
| POST | `/api/attendance/sessions` | `apps/api/src/modules/attendance/attendance.controller.ts:80` | @Roles('staff', 'admin') |
| GET | `/api/attendance/sessions` | `apps/api/src/modules/attendance/attendance.controller.ts:97` | @Roles('staff', 'admin') |
| GET | `/api/attendance/export` | `apps/api/src/modules/attendance/attendance.controller.ts:110` | @Roles('staff', 'admin') |
| GET | `/api/attendance/sessions/:id/export` | `apps/api/src/modules/attendance/attendance.controller.ts:133` | @Roles('staff', 'admin') |
| GET | `/api/attendance/sessions/:id` | `apps/api/src/modules/attendance/attendance.controller.ts:157` | @Roles('staff', 'admin') |
| GET | `/api/attendance/sessions/:id/qr` | `apps/api/src/modules/attendance/attendance.controller.ts:166` | @Roles('staff', 'admin') |
| POST | `/api/attendance/sessions/:id/close` | `apps/api/src/modules/attendance/attendance.controller.ts:173` | @Roles('staff', 'admin') |
| GET | `/api/attendance/sessions/:id/records` | `apps/api/src/modules/attendance/attendance.controller.ts:194` | @Roles('staff', 'admin') |
| PATCH | `/api/attendance/records/:id` | `apps/api/src/modules/attendance/attendance.controller.ts:204` | @Roles('staff', 'admin') |
| POST | `/api/attendance/sessions/:id/manual-mark` | `apps/api/src/modules/attendance/attendance.controller.ts:215` | @Roles('staff', 'admin') |
| GET | `/api/attendance/admin/overview` | `apps/api/src/modules/attendance/attendance.controller.ts:226` | @Roles('admin') |
| POST | `/api/attendance/assignments` | `apps/api/src/modules/attendance/attendance.controller.ts:237` | @Roles('admin') |
| GET | `/api/attendance/reports/course/:courseCode` | `apps/api/src/modules/attendance/attendance.controller.ts:249` | @Roles('staff', 'admin') |
| PATCH | `/api/attendance/sessions/:id/location` | `apps/api/src/modules/attendance/attendance.controller.ts:258` | @Roles('staff', 'admin') |
| POST | `/api/attendance/check-in` | `apps/api/src/modules/attendance/attendance.controller.ts:275` | @Roles('student') |
| GET | `/api/attendance/student/live-sessions` | `apps/api/src/modules/attendance/attendance.controller.ts:291` | @Roles('student') |
| GET | `/api/students/me/attendance-history` | `apps/api/src/modules/attendance/attendance.controller.ts:302` | @Roles('student') |
| GET | `/api/students/me/attendance` | `apps/api/src/modules/attendance/attendance.controller.ts:315` | @Roles('student') |
| PATCH | `/api/admin/attendance/:id` | `apps/api/src/modules/attendance/attendance.controller.ts:324` | @Roles('admin') |
| POST | `/api/auth/google/nonce` | `apps/api/src/modules/auth/auth-security.controller.ts:38` | @Public() |
| POST | `/api/auth/reauthenticate` | `apps/api/src/modules/auth/auth-security.controller.ts:48` | Global JWT/CSRF/first-login guards; verify ownership in service |
| GET | `/api/auth/sessions` | `apps/api/src/modules/auth/auth-security.controller.ts:63` | Global JWT/CSRF/first-login guards; verify ownership in service |
| DELETE | `/api/auth/sessions/:id` | `apps/api/src/modules/auth/auth-security.controller.ts:68` | @SensitiveOperation('sessions:id') |
| POST | `/api/auth/logout-all` | `apps/api/src/modules/auth/auth-security.controller.ts:74` | @SensitiveOperation('sessions:all') |
| POST | `/api/auth/student/login` | `apps/api/src/modules/auth/auth.controller.ts:40` | @Public() |
| POST | `/api/auth/admin/login` | `apps/api/src/modules/auth/auth.controller.ts:53` | @Public() |
| GET | `/api/auth/me` | `apps/api/src/modules/auth/auth.controller.ts:65` | Global JWT/CSRF/first-login guards; verify ownership in service |
| GET | `/api/auth/csrf` | `apps/api/src/modules/auth/auth.controller.ts:71` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/logout` | `apps/api/src/modules/auth/auth.controller.ts:85` | @OptionalAuth() |
| POST | `/api/auth/change-password` | `apps/api/src/modules/auth/auth.controller.ts:105` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/google/link/start` | `apps/api/src/modules/auth/auth.controller.ts:118` | @SensitiveOperation('google-link:start') |
| DELETE | `/api/auth/google/link` | `apps/api/src/modules/auth/auth.controller.ts:132` | @SensitiveOperation('google-link:remove') |
| PATCH | `/api/auth/theme` | `apps/api/src/modules/auth/auth.controller.ts:142` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/forgot-password` | `apps/api/src/modules/auth/auth.controller.ts:153` | @Public() |
| POST | `/api/auth/reset-password-otp` | `apps/api/src/modules/auth/auth.controller.ts:166` | @Public() |
| POST | `/api/auth/google/link/verify-otp` | `apps/api/src/modules/auth/auth.controller.ts:179` | @SensitiveOperation('google-link:verify-otp') |
| POST | `/api/auth/google/link/verify-oauth` | `apps/api/src/modules/auth/auth.controller.ts:192` | @SensitiveOperation('google-link:verify-oauth') |
| POST | `/api/auth/google/login` | `apps/api/src/modules/auth/auth.controller.ts:213` | @Public() |
| POST | `/api/auth/heartbeat` | `apps/api/src/modules/auth/auth.controller.ts:231` | Global JWT/CSRF/first-login guards; verify ownership in service |
| GET | `/api/auth/passkeys/capabilities` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:35` | @Public() |
| POST | `/api/auth/passkeys/reauthenticate` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:41` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/passkeys/register/options` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:59` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/passkeys/register/verify` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:73` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/auth/passkeys/login/options` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:90` | @Public() |
| POST | `/api/auth/passkeys/login/verify` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:97` | @Public() |
| GET | `/api/auth/passkeys` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:111` | Global JWT/CSRF/first-login guards; verify ownership in service |
| PATCH | `/api/auth/passkeys/:id` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:116` | Global JWT/CSRF/first-login guards; verify ownership in service |
| DELETE | `/api/auth/passkeys/:id` | `apps/api/src/modules/auth/passkeys/passkeys.controller.ts:133` | Global JWT/CSRF/first-login guards; verify ownership in service |
| POST | `/api/public/complaints` | `apps/api/src/modules/complaints/complaints.controller.ts:41` | @Public() |
| GET | `/api/public/complaints/settings` | `apps/api/src/modules/complaints/complaints.controller.ts:53` | @Public() |
| POST | `/api/public/complaints/query` | `apps/api/src/modules/complaints/complaints.controller.ts:68` | @Public() |
| POST | `/api/public/complaints/reply` | `apps/api/src/modules/complaints/complaints.controller.ts:77` | @Public() |
| POST | `/api/students/complaints` | `apps/api/src/modules/complaints/complaints.controller.ts:87` | @Roles('student') |
| GET | `/api/students/complaints` | `apps/api/src/modules/complaints/complaints.controller.ts:98` | @Roles('student') |
| POST | `/api/students/complaints/:id/reply` | `apps/api/src/modules/complaints/complaints.controller.ts:108` | @Roles('student') |
| GET | `/api/admin/complaints` | `apps/api/src/modules/complaints/complaints.controller.ts:123` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COMPLAINTS_READ) |
| GET | `/api/admin/complaints/assignees` | `apps/api/src/modules/complaints/complaints.controller.ts:131` | @Roles('admin', 'staff') @RequireAnyPermissions(     PERMISSIONS.COMPLAINTS_READ,     PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,   ) |
| GET | `/api/admin/complaints/stats` | `apps/api/src/modules/complaints/complaints.controller.ts:142` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COMPLAINTS_READ) |
| GET | `/api/admin/complaints/settings` | `apps/api/src/modules/complaints/complaints.controller.ts:152` | @Roles('admin', 'staff') @RequireAnyPermissions(     PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS,     PERMISSIONS.COMPLAINTS_READ,   ) |
| POST | `/api/admin/complaints/settings` | `apps/api/src/modules/complaints/complaints.controller.ts:165` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS) |
| PATCH | `/api/admin/complaints/:id` | `apps/api/src/modules/complaints/complaints.controller.ts:178` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE) |
| POST | `/api/admin/complaints/:id/reply` | `apps/api/src/modules/complaints/complaints.controller.ts:192` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COMPLAINTS_REPLY) |
| DELETE | `/api/admin/complaints/all` | `apps/api/src/modules/complaints/complaints.controller.ts:205` | @Roles('admin') @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE) |
| POST | `/api/admin/complaints/bulk-delete` | `apps/api/src/modules/complaints/complaints.controller.ts:213` | @Roles('admin') @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE) |
| DELETE | `/api/admin/complaints/:id` | `apps/api/src/modules/complaints/complaints.controller.ts:224` | @Roles('admin') @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE) |
| GET | `/api/admin/course-schedules/template` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:51` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_READ) |
| POST | `/api/admin/course-schedules/upload-excel` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:72` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE) |
| GET | `/api/admin/course-schedules` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:105` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_READ) |
| POST | `/api/admin/course-schedules` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:115` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE) |
| PATCH | `/api/admin/course-schedules/:id` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:125` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE) |
| DELETE | `/api/admin/course-schedules/:id` | `apps/api/src/modules/course-schedules/course-schedules.controller.ts:135` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE) |
| GET | `/api/courses` | `apps/api/src/modules/courses/courses.controller.ts:43` | @Roles('student', 'admin', 'staff') |
| GET | `/api/students/me/syllabi` | `apps/api/src/modules/courses/courses.controller.ts:50` | @Roles('student') |
| GET | `/api/courses/:id/syllabus/download` | `apps/api/src/modules/courses/courses.controller.ts:62` | @Roles('student', 'admin', 'staff') |
| GET | `/api/admin/courses` | `apps/api/src/modules/courses/courses.controller.ts:84` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_READ) |
| GET | `/api/admin/courses/enrollment-template` | `apps/api/src/modules/courses/courses.controller.ts:92` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_READ) |
| POST | `/api/admin/courses/:id/enroll-students-excel` | `apps/api/src/modules/courses/courses.controller.ts:114` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| POST | `/api/admin/courses/:id/enroll-students-batch` | `apps/api/src/modules/courses/courses.controller.ts:162` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| POST | `/api/admin/courses` | `apps/api/src/modules/courses/courses.controller.ts:184` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| POST | `/api/admin/courses/:id/syllabus` | `apps/api/src/modules/courses/courses.controller.ts:192` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| POST | `/api/admin/courses/:id/cover-image` | `apps/api/src/modules/courses/courses.controller.ts:241` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| PATCH | `/api/admin/courses/:id` | `apps/api/src/modules/courses/courses.controller.ts:290` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| DELETE | `/api/admin/courses/:id/syllabus` | `apps/api/src/modules/courses/courses.controller.ts:301` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| DELETE | `/api/admin/courses/:id/cover-image` | `apps/api/src/modules/courses/courses.controller.ts:309` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| DELETE | `/api/admin/courses/:id` | `apps/api/src/modules/courses/courses.controller.ts:317` | @Roles('admin') @RequirePermissions(PERMISSIONS.COURSES_WRITE) |
| POST | `/api/admin/emails` | `apps/api/src/modules/emails/emails.controller.ts:15` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EMAILS_SEND) |
| GET | `/api/admin/emails` | `apps/api/src/modules/emails/emails.controller.ts:23` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EMAILS_READ) |
| GET | `/api/admin/exam-schedules` | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts:62` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_READ) |
| POST | `/api/admin/exam-schedules` | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts:70` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_WRITE) |
| POST | `/api/admin/exam-schedules/upload-image` | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts:78` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_WRITE) |
| PATCH | `/api/admin/exam-schedules/:id` | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts:128` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_WRITE) |
| DELETE | `/api/admin/exam-schedules/:id` | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts:139` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_WRITE) |
| GET | `/api/faqs` | `apps/api/src/modules/faqs/faqs.controller.ts:30` | @Roles('student', 'admin', 'staff') |
| POST | `/api/faqs/chat` | `apps/api/src/modules/faqs/faqs.controller.ts:37` | @Roles('student', 'admin', 'staff') |
| GET | `/api/admin/faqs` | `apps/api/src/modules/faqs/faqs.controller.ts:44` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.FAQS_READ) |
| POST | `/api/admin/faqs` | `apps/api/src/modules/faqs/faqs.controller.ts:52` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.FAQS_WRITE) |
| PATCH | `/api/admin/faqs/:id` | `apps/api/src/modules/faqs/faqs.controller.ts:60` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.FAQS_WRITE) |
| DELETE | `/api/admin/faqs/:id` | `apps/api/src/modules/faqs/faqs.controller.ts:72` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.FAQS_WRITE) |
| GET | `/api/students/me/results` | `apps/api/src/modules/grades/grades.controller.ts:35` | @Roles('student') |
| GET | `/api/students/me/course-quizzes` | `apps/api/src/modules/grades/grades.controller.ts:44` | @Roles('student') |
| GET | `/api/students/me/results-window` | `apps/api/src/modules/grades/grades.controller.ts:53` | @Roles('student') |
| GET | `/api/admin/grades/settings` | `apps/api/src/modules/grades/grades.controller.ts:64` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_READ) |
| PATCH | `/api/admin/grades/settings` | `apps/api/src/modules/grades/grades.controller.ts:74` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| GET | `/api/admin/grades` | `apps/api/src/modules/grades/grades.controller.ts:87` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_READ) |
| POST | `/api/admin/grades` | `apps/api/src/modules/grades/grades.controller.ts:95` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| PATCH | `/api/admin/grades/:id` | `apps/api/src/modules/grades/grades.controller.ts:103` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| DELETE | `/api/admin/grades/:id` | `apps/api/src/modules/grades/grades.controller.ts:114` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_DELETE) |
| POST | `/api/admin/grades/publish` | `apps/api/src/modules/grades/grades.controller.ts:122` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| POST | `/api/admin/grades/recalculate-progress` | `apps/api/src/modules/grades/grades.controller.ts:132` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| POST | `/api/admin/grades/audit-warnings` | `apps/api/src/modules/grades/grades.controller.ts:149` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.GRADES_WRITE) |
| POST | `/api/students/me/fcm-token` | `apps/api/src/modules/notifications/notifications.controller.ts:31` | @Roles('student') |
| GET | `/api/students/me/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts:41` | @Roles('student') |
| POST | `/api/notifications/register-token` | `apps/api/src/modules/notifications/notifications.controller.ts:51` | @Roles('student') |
| GET | `/api/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts:61` | @Roles('student') |
| PATCH | `/api/students/me/notifications/:id/read` | `apps/api/src/modules/notifications/notifications.controller.ts:71` | @Roles('student') |
| PATCH | `/api/notifications/:id/read` | `apps/api/src/modules/notifications/notifications.controller.ts:81` | @Roles('student') |
| PATCH | `/api/students/me/notifications/:id/unread` | `apps/api/src/modules/notifications/notifications.controller.ts:91` | @Roles('student') |
| PATCH | `/api/notifications/:id/unread` | `apps/api/src/modules/notifications/notifications.controller.ts:101` | @Roles('student') |
| PATCH | `/api/students/me/notifications/read-all` | `apps/api/src/modules/notifications/notifications.controller.ts:111` | @Roles('student') |
| PATCH | `/api/notifications/read-all` | `apps/api/src/modules/notifications/notifications.controller.ts:118` | @Roles('student') |
| DELETE | `/api/students/me/notifications/clear-read` | `apps/api/src/modules/notifications/notifications.controller.ts:125` | @Roles('student') |
| DELETE | `/api/students/me/notifications/:id` | `apps/api/src/modules/notifications/notifications.controller.ts:132` | @Roles('student') |
| POST | `/api/admin/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts:144` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND) |
| GET | `/api/admin/notifications` | `apps/api/src/modules/notifications/notifications.controller.ts:157` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ) |
| DELETE | `/api/admin/notifications/clear-all` | `apps/api/src/modules/notifications/notifications.controller.ts:167` | @Roles('admin') @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND) |
| POST | `/api/admin/notifications/bulk-delete` | `apps/api/src/modules/notifications/notifications.controller.ts:175` | @Roles('admin') @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND) |
| DELETE | `/api/admin/notifications/:id` | `apps/api/src/modules/notifications/notifications.controller.ts:183` | @Roles('admin') @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND) |
| GET | `/api/students/me/quizzes` | `apps/api/src/modules/quizzes/quizzes.controller.ts:53` | @Roles('student') |
| GET | `/api/students/me/quizzes/:id/take` | `apps/api/src/modules/quizzes/quizzes.controller.ts:63` | @Roles('student') |
| POST | `/api/students/me/quizzes/:id/start` | `apps/api/src/modules/quizzes/quizzes.controller.ts:75` | @Roles('student') |
| POST | `/api/students/me/quizzes/:id/save-draft` | `apps/api/src/modules/quizzes/quizzes.controller.ts:88` | @Roles('student') |
| POST | `/api/students/me/quizzes/:id/exit` | `apps/api/src/modules/quizzes/quizzes.controller.ts:101` | @Roles('student') |
| POST | `/api/students/me/quizzes/:id/submit` | `apps/api/src/modules/quizzes/quizzes.controller.ts:115` | @Roles('student') |
| GET | `/api/students/me/quizzes/:id/review` | `apps/api/src/modules/quizzes/quizzes.controller.ts:128` | @Roles('student') |
| GET | `/api/admin/quizzes` | `apps/api/src/modules/quizzes/quizzes.controller.ts:143` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_READ) |
| GET | `/api/admin/quizzes/questions-template` | `apps/api/src/modules/quizzes/quizzes.controller.ts:154` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_WRITE) |
| POST | `/api/admin/quizzes/parse-questions-file` | `apps/api/src/modules/quizzes/quizzes.controller.ts:175` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_WRITE) |
| POST | `/api/admin/quizzes` | `apps/api/src/modules/quizzes/quizzes.controller.ts:208` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_WRITE) |
| GET | `/api/admin/quizzes/:id` | `apps/api/src/modules/quizzes/quizzes.controller.ts:219` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_READ) |
| PATCH | `/api/admin/quizzes/:id` | `apps/api/src/modules/quizzes/quizzes.controller.ts:227` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_WRITE) |
| DELETE | `/api/admin/quizzes/:id` | `apps/api/src/modules/quizzes/quizzes.controller.ts:239` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_WRITE) |
| GET | `/api/admin/quizzes/:id/submissions` | `apps/api/src/modules/quizzes/quizzes.controller.ts:250` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_SUBMISSIONS_READ) |
| GET | `/api/admin/quizzes/:id/export-analysis` | `apps/api/src/modules/quizzes/quizzes.controller.ts:261` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.QUIZZES_SUBMISSIONS_READ) |
| GET | `/api/registration/eligibility` | `apps/api/src/modules/registrations/registrations.controller.ts:43` | @Roles('student') |
| GET | `/api/registration/term` | `apps/api/src/modules/registrations/registrations.controller.ts:50` | @Roles('student', 'staff', 'admin') |
| GET | `/api/registration/available-courses` | `apps/api/src/modules/registrations/registrations.controller.ts:58` | @Roles('student') |
| POST | `/api/registration/submit` | `apps/api/src/modules/registrations/registrations.controller.ts:65` | @Roles('student') |
| POST | `/api/registration/request-advising` | `apps/api/src/modules/registrations/registrations.controller.ts:75` | @Roles('student') |
| POST | `/api/registration/submit-approved-plan` | `apps/api/src/modules/registrations/registrations.controller.ts:86` | @Roles('student') |
| GET | `/api/registration/advising-status` | `apps/api/src/modules/registrations/registrations.controller.ts:96` | @Roles('student') |
| GET | `/api/registration/latest` | `apps/api/src/modules/registrations/registrations.controller.ts:105` | @Roles('student') |
| GET | `/api/registration/history` | `apps/api/src/modules/registrations/registrations.controller.ts:112` | @Roles('student') |
| GET | `/api/registrations/:id/print` | `apps/api/src/modules/registrations/registrations.controller.ts:119` | @Roles('student', 'staff', 'admin') |
| GET | `/api/staff/advising-requests` | `apps/api/src/modules/registrations/registrations.controller.ts:129` | @Roles('staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| PATCH | `/api/staff/advising-requests/:id/review` | `apps/api/src/modules/registrations/registrations.controller.ts:143` | @Roles('staff', 'admin') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/staff/advising-requests/:id/course-map` | `apps/api/src/modules/registrations/registrations.controller.ts:162` | @Roles('staff', 'admin') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| GET | `/api/admin/academic-profiles` | `apps/api/src/modules/registrations/registrations.controller.ts:179` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_READ) |
| POST | `/api/admin/academic-profiles` | `apps/api/src/modules/registrations/registrations.controller.ts:187` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.ADVISING_WRITE) |
| GET | `/api/admin/gpa-rules` | `apps/api/src/modules/registrations/registrations.controller.ts:195` | @Roles('admin', 'staff') @RequireAnyPermissions(     PERMISSIONS.STUDY_PLAN_MANAGE,     PERMISSIONS.ADVISING_READ,     PERMISSIONS.REGISTRATION_READ,   ) |
| POST | `/api/admin/gpa-rules` | `apps/api/src/modules/registrations/registrations.controller.ts:207` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDY_PLAN_MANAGE) |
| PATCH | `/api/admin/gpa-rules/:id` | `apps/api/src/modules/registrations/registrations.controller.ts:215` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDY_PLAN_MANAGE) |
| DELETE | `/api/admin/gpa-rules/:id` | `apps/api/src/modules/registrations/registrations.controller.ts:226` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDY_PLAN_MANAGE) |
| GET | `/api/admin/advising-requests` | `apps/api/src/modules/registrations/registrations.controller.ts:234` | @Roles('admin') |
| GET | `/api/admin/registrations` | `apps/api/src/modules/registrations/registrations.controller.ts:241` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_READ) |
| PATCH | `/api/admin/registrations/:id` | `apps/api/src/modules/registrations/registrations.controller.ts:249` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE) |
| POST | `/api/admin/registrations/proxy` | `apps/api/src/modules/registrations/registrations.controller.ts:261` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_PROXY) |
| POST | `/api/admin/registrations/auto-register-first-year` | `apps/api/src/modules/registrations/registrations.controller.ts:274` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_PROXY) |
| GET | `/api/admin/registrations/roster` | `apps/api/src/modules/registrations/registrations.controller.ts:291` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_READ) |
| GET | `/api/admin/registration-terms` | `apps/api/src/modules/registrations/registrations.controller.ts:302` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_READ) |
| GET | `/api/admin/academic-years` | `apps/api/src/modules/registrations/registrations.controller.ts:310` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_READ) |
| POST | `/api/admin/academic-years` | `apps/api/src/modules/registrations/registrations.controller.ts:318` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE) |
| PATCH | `/api/admin/academic-years/:academicYear/current` | `apps/api/src/modules/registrations/registrations.controller.ts:329` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE) |
| DELETE | `/api/admin/academic-years/:academicYear` | `apps/api/src/modules/registrations/registrations.controller.ts:337` | @Roles('admin') |
| POST | `/api/admin/registration-terms` | `apps/api/src/modules/registrations/registrations.controller.ts:344` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE) |
| PATCH | `/api/admin/registration-terms/:id` | `apps/api/src/modules/registrations/registrations.controller.ts:355` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE) |
| GET | `/api/admin/staff` | `apps/api/src/modules/staff-management/staff-management.controller.ts:32` | @Roles('admin', 'staff') @RequireAnyPermissions(     PERMISSIONS.STAFF_READ,     PERMISSIONS.STAFF_CREATE_ACADEMIC,   ) |
| POST | `/api/admin/staff` | `apps/api/src/modules/staff-management/staff-management.controller.ts:44` | @Roles('admin', 'staff') @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC) |
| GET | `/api/admin/staff/:id` | `apps/api/src/modules/staff-management/staff-management.controller.ts:55` | @Roles('admin', 'staff') @RequireAnyPermissions(     PERMISSIONS.STAFF_READ,     PERMISSIONS.STAFF_CREATE_ACADEMIC,   ) |
| PATCH | `/api/admin/staff/:id` | `apps/api/src/modules/staff-management/staff-management.controller.ts:65` | @Roles('admin', 'staff') @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC) |
| PATCH | `/api/admin/staff/:id/permissions` | `apps/api/src/modules/staff-management/staff-management.controller.ts:77` | @Roles('admin', 'staff') @SensitiveOperation('staff-permissions:id') @Roles('admin') |
| POST | `/api/admin/staff/:id/reset-password` | `apps/api/src/modules/staff-management/staff-management.controller.ts:90` | @Roles('admin', 'staff') @SensitiveOperation('staff-reset:id') @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC) |
| POST | `/api/admin/staff/:id/deactivate` | `apps/api/src/modules/staff-management/staff-management.controller.ts:105` | @Roles('admin', 'staff') @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC) |
| POST | `/api/admin/staff/:id/activate` | `apps/api/src/modules/staff-management/staff-management.controller.ts:119` | @Roles('admin', 'staff') @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC) |
| DELETE | `/api/admin/staff/:id` | `apps/api/src/modules/staff-management/staff-management.controller.ts:130` | @Roles('admin', 'staff') @Roles('admin') |
| GET | `/api/admin/staff/:id/audit` | `apps/api/src/modules/staff-management/staff-management.controller.ts:141` | @Roles('admin', 'staff') @Roles('admin') |
| GET | `/api/admin/students/export/excel` | `apps/api/src/modules/students/controllers/students-export.controller.ts:17` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| GET | `/api/admin/students/tuition/stats` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:33` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_READ) |
| GET | `/api/admin/students/tuition/list` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:43` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_READ) |
| GET | `/api/admin/students/tuition/template` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:54` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_READ) |
| PATCH | `/api/admin/students/tuition/:id/status` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:76` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_WRITE) |
| POST | `/api/admin/students/tuition/bulk-toggle` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:90` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_WRITE) |
| POST | `/api/admin/students/tuition/upload-excel` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:101` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_WRITE) |
| GET | `/api/admin/students/tuition/export` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:134` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_READ) |
| POST | `/api/admin/students/tuition/batch` | `apps/api/src/modules/students/controllers/students-tuition.controller.ts:154` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.TUITION_WRITE) |
| GET | `/api/admin/students` | `apps/api/src/modules/students/students.controller.ts:40` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| GET | `/api/admin/students-stats` | `apps/api/src/modules/students/students.controller.ts:51` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| GET | `/api/admin/students/active-sessions` | `apps/api/src/modules/students/students.controller.ts:59` | @Roles('admin') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| GET | `/api/admin/students/:id` | `apps/api/src/modules/students/students.controller.ts:67` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| POST | `/api/admin/students` | `apps/api/src/modules/students/students.controller.ts:78` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_WRITE) |
| PATCH | `/api/admin/students/:id` | `apps/api/src/modules/students/students.controller.ts:86` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_WRITE) |
| POST | `/api/admin/students/:id/activate` | `apps/api/src/modules/students/students.controller.ts:97` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_WRITE) |
| DELETE | `/api/admin/students/:id` | `apps/api/src/modules/students/students.controller.ts:105` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_WRITE) |
| POST | `/api/admin/students/:id/reset-password` | `apps/api/src/modules/students/students.controller.ts:113` | @SensitiveOperation('student-reset:id') @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_RESET_PASSWORD) |
| GET | `/api/admin/students-must-change-password-summary` | `apps/api/src/modules/students/students.controller.ts:127` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| POST | `/api/admin/students-toggle-all-must-change-password` | `apps/api/src/modules/students/students.controller.ts:137` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_RESET_PASSWORD) |
| POST | `/api/admin/students/transfer-department` | `apps/api/src/modules/students/students.controller.ts:149` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_WRITE) |
| GET | `/api/portal-settings` | `apps/api/src/modules/students/students.controller.ts:164` | @Roles('student', 'staff', 'admin') |
| GET | `/api/admin/portal-settings` | `apps/api/src/modules/students/students.controller.ts:173` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.STUDENTS_READ) |
| PATCH | `/api/admin/portal-settings` | `apps/api/src/modules/students/students.controller.ts:183` | @Roles('admin') |
| POST | `/api/admin/students/reset-academic-records` | `apps/api/src/modules/students/students.controller.ts:193` | @Roles('admin') |
| GET | `/api/students/me/dashboard` | `apps/api/src/modules/students/students.controller.ts:205` | @Roles('student') |
| GET | `/api/students/me/profile` | `apps/api/src/modules/students/students.controller.ts:212` | @Roles('student') |
| PATCH | `/api/students/me/contact` | `apps/api/src/modules/students/students.controller.ts:219` | @SensitiveOperation('profile:contact') @Roles('student') |
| GET | `/api/admin/uploads/templates/bundle` | `apps/api/src/modules/uploads/uploads.controller.ts:40` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
| GET | `/api/admin/uploads/templates/:type` | `apps/api/src/modules/uploads/uploads.controller.ts:60` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
| GET | `/api/admin/uploads/wipe-summary` | `apps/api/src/modules/uploads/uploads.controller.ts:92` | @Roles('admin') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
| POST | `/api/admin/uploads/wipe` | `apps/api/src/modules/uploads/uploads.controller.ts:103` | @Roles('admin') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
| POST | `/api/admin/uploads` | `apps/api/src/modules/uploads/uploads.controller.ts:131` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
| POST | `/api/admin/uploads/batch` | `apps/api/src/modules/uploads/uploads.controller.ts:196` | @Roles('admin', 'staff') @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT) |
