# Permission catalog audit - 2026-11-20

101 defined permissions; 99 assignable to staff.

The staff editor now includes the missing `control.grades.grace` entry. All assignable permissions appear exactly once and have Arabic and English labels. Admin account management and danger-zone actions remain excluded from staff assignment. No existing permission was deleted or granted automatically.

The table records source references, not proof of endpoint enforcement. Some older capabilities still use broader permissions or role checks. In particular attendance uses staff/admin roles and course assignment, student Excel export uses students.read, and several tuition capabilities use tuition.read/write. These require a separate backend enforcement migration with regression tests before their individual checkboxes can be described as independent security gates. Existing account grants and workflow behavior were preserved in this UI/catalog change.

Filters affect displayed checkboxes only; hidden selections remain intact. Category select/clear applies only to visible matches. Global select/clear and role presets still apply to the full catalog.

| Permission | Delegation | Backend source references |
| --- | --- | --- |
| `students.read` | Staff assignable | `apps/api/src/modules/students/controllers/students-export.controller.ts`<br>`apps/api/src/modules/students/students.controller.ts` |
| `students.write` | Staff assignable | `apps/api/src/modules/students/students.controller.ts` |
| `students.reset_password` | Staff assignable | `apps/api/src/modules/students/students.controller.ts` |
| `students.view_national_id` | Staff assignable | `apps/api/src/modules/admissions/admission-workflow.service.ts`<br>`apps/api/src/modules/students/services/student-query.service.ts` |
| `students.view_phone` | Staff assignable | No direct backend reference; review required |
| `students.export` | Staff assignable | No direct backend reference; review required |
| `students.manage_status` | Staff assignable | No direct backend reference; review required |
| `courses.read` | Staff assignable | `apps/api/src/modules/courses/courses.controller.ts` |
| `courses.write` | Staff assignable | `apps/api/src/modules/courses/courses.controller.ts` |
| `courses.student_enrollment.manage` | Staff assignable | `apps/api/src/modules/courses/student-enrollment.controller.ts`<br>`apps/api/src/modules/courses/student-enrollment.service.ts` |
| `grades.read` | Staff assignable | `apps/api/src/modules/grades/grades.controller.ts` |
| `grades.write` | Staff assignable | `apps/api/src/modules/grades/grades.controller.ts` |
| `grades.publish` | Staff assignable | `apps/api/src/modules/grades/grades.controller.ts` |
| `grades.historical.publish` | Staff assignable | `apps/api/src/modules/grades/historical-publication.controller.ts` |
| `grades.visibility.manage` | Staff assignable | `apps/api/src/modules/grades/grades.controller.ts` |
| `grades.delete` | Staff assignable | `apps/api/src/modules/grades/grades.controller.ts` |
| `grades.export` | Staff assignable | No direct backend reference; review required |
| `academic_emails.read` | Staff assignable | `apps/api/src/modules/academic-emails/academic-emails.controller.ts` |
| `academic_emails.write` | Staff assignable | `apps/api/src/modules/academic-emails/academic-emails.controller.ts` |
| `complaints.read` | Staff assignable | `apps/api/src/modules/complaints/complaints.controller.ts` |
| `complaints.reply` | Staff assignable | `apps/api/src/modules/complaints/complaints.controller.ts` |
| `complaints.write` | Staff assignable | `apps/api/src/modules/complaints/complaints.controller.ts` |
| `complaints.manage_settings` | Staff assignable | `apps/api/src/modules/complaints/complaints.controller.ts` |
| `emails.read` | Staff assignable | `apps/api/src/modules/emails/emails.controller.ts` |
| `emails.send` | Staff assignable | `apps/api/src/modules/emails/emails.controller.ts` |
| `notifications.read` | Staff assignable | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `notifications.send` | Staff assignable | `apps/api/src/modules/notifications/notifications.controller.ts` |
| `faqs.read` | Staff assignable | `apps/api/src/modules/faqs/faqs.controller.ts` |
| `faqs.write` | Staff assignable | `apps/api/src/modules/faqs/faqs.controller.ts` |
| `uploads.import` | Staff assignable | `apps/api/src/modules/uploads/uploads.controller.ts` |
| `exam_schedules.read` | Staff assignable | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts` |
| `exam_schedules.write` | Staff assignable | `apps/api/src/modules/exam-schedules/exam-schedules.controller.ts` |
| `danger_zone.delete_all` | Admin only | No direct backend reference; review required |
| `registration.read` | Staff assignable | `apps/api/src/modules/registrations/registrations.controller.ts` |
| `registration.write` | Staff assignable | `apps/api/src/modules/registrations/registrations.controller.ts` |
| `registration.proxy` | Staff assignable | `apps/api/src/modules/registrations/registrations.controller.ts` |
| `admissions.periods.read` | Staff assignable | `apps/api/src/modules/admissions/admission-periods.controller.ts` |
| `admissions.periods.manage` | Staff assignable | `apps/api/src/modules/admissions/admission-periods.controller.ts` |
| `student_codes.read` | Staff assignable | `apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/student-codes/student-codes.controller.ts` |
| `student_codes.manage` | Staff assignable | `apps/api/src/modules/student-codes/student-codes.controller.ts` |
| `student_codes.recover` | Staff assignable | `apps/api/src/modules/student-codes/student-codes.controller.ts` |
| `student_codes.delete_student` | Staff assignable | `apps/api/src/modules/student-codes/student-codes.controller.ts` |
| `admissions.requests.read` | Staff assignable | `apps/api/src/modules/admissions/admission-workflow.controller.ts` |
| `admissions.requests.update` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.requests.approve` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.requests.reject` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.requests.waitlist` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.requests.cancel` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.academic.manage` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.groups.manage` | Staff assignable | `apps/api/src/modules/admissions/admission-spreadsheets.service.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.service.ts` |
| `admissions.access.manage` | Staff assignable | `apps/api/src/modules/admissions/admission-periods.controller.ts`<br>`apps/api/src/modules/admissions/admission-workflow.controller.ts` |
| `admissions.export` | Staff assignable | `apps/api/src/modules/admissions/admission-workflow.controller.ts` |
| `admissions.import` | Staff assignable | `apps/api/src/modules/admissions/admission-workflow.controller.ts` |
| `student_codes.export` | Staff assignable | `apps/api/src/modules/student-codes/student-codes.controller.ts` |
| `advising.read` | Staff assignable | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts`<br>`apps/api/src/modules/registrations/registrations.controller.ts` |
| `advising.write` | Staff assignable | `apps/api/src/modules/academic-advising/controllers/admin-advising.controller.ts`<br>`apps/api/src/modules/registrations/registrations.controller.ts` |
| `advising.override_prerequisites` | Staff assignable | No direct backend reference; review required |
| `advising.override_max_hours` | Staff assignable | No direct backend reference; review required |
| `study_plan.manage` | Staff assignable | `apps/api/src/modules/registrations/registrations.controller.ts` |
| `attendance.read` | Staff assignable | No direct backend reference; review required |
| `attendance.write` | Staff assignable | No direct backend reference; review required |
| `attendance.session_create` | Staff assignable | No direct backend reference; review required |
| `attendance.session_close` | Staff assignable | No direct backend reference; review required |
| `attendance.manual_mark` | Staff assignable | No direct backend reference; review required |
| `attendance.reports` | Staff assignable | No direct backend reference; review required |
| `quizzes.read` | Staff assignable | `apps/api/src/modules/quizzes/quizzes.controller.ts` |
| `quizzes.write` | Staff assignable | `apps/api/src/modules/quizzes/quizzes.controller.ts`<br>`apps/api/src/modules/quizzes/quizzes.service.ts` |
| `quizzes.submissions_read` | Staff assignable | `apps/api/src/modules/quizzes/quizzes.controller.ts` |
| `course_schedules.read` | Staff assignable | `apps/api/src/modules/course-schedules/course-schedules.controller.ts` |
| `course_schedules.write` | Staff assignable | `apps/api/src/modules/course-schedules/course-schedules.controller.ts` |
| `tuition.read` | Staff assignable | `apps/api/src/modules/students/controllers/students-tuition.controller.ts` |
| `tuition.write` | Staff assignable | `apps/api/src/modules/students/controllers/students-tuition.controller.ts` |
| `tuition.audit_read` | Staff assignable | No direct backend reference; review required |
| `tuition.export_advanced` | Staff assignable | No direct backend reference; review required |
| `course_materials.read` | Staff assignable | No direct backend reference; review required |
| `course_materials.write` | Staff assignable | `apps/api/src/modules/courses/courses.controller.ts` |
| `course_materials.delete` | Staff assignable | `apps/api/src/modules/courses/courses.controller.ts` |
| `staff.read` | Staff assignable | `apps/api/src/modules/staff-management/staff-management.controller.ts` |
| `staff.create_academic` | Staff assignable | `apps/api/src/modules/staff-management/staff-management.controller.ts` |
| `admins.manage` | Admin only | No direct backend reference; review required |
| `analytics.read` | Staff assignable | `apps/api/src/modules/analytics/analytics.controller.ts` |
| `analytics.export` | Staff assignable | `apps/api/src/modules/analytics/analytics.controller.ts` |
| `control.access` | Staff assignable | `apps/api/src/modules/control/control.controller.ts`<br>`apps/api/src/modules/control/services/control-access.service.ts` |
| `control.sheets.submit` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.sheets.review` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-attempts.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.sheets.approve` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.final.approve` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.import` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.export` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-reports.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.sheets.view` | Staff assignable | `apps/api/src/modules/control/control.controller.ts`<br>`apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-attempts.service.ts`<br>`apps/api/src/modules/control/services/control-sheets.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.sheets.create` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-sheets.service.ts` |
| `control.grades.enter` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-attempts.service.ts`<br>`apps/api/src/modules/control/services/control-grades.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.grades.review_edit` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-grades.service.ts`<br>`apps/api/src/modules/control/services/control-workbook.service.ts` |
| `control.grades.grace` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-grace.service.ts` |
| `control.grades.edit_published` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts` |
| `control.states.manage` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts` |
| `control.sheets.lock` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-sheets.service.ts` |
| `control.sheets.unlock` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-sheets.service.ts` |
| `control.schemes.manage` | Staff assignable | `apps/api/src/modules/control/control.controller.ts`<br>`apps/api/src/modules/control/services/control-access.service.ts` |
| `control.audit.view` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts`<br>`apps/api/src/modules/control/services/control-sheets.service.ts` |
| `control.scope.all` | Staff assignable | `apps/api/src/modules/control/services/control-access.service.ts` |
