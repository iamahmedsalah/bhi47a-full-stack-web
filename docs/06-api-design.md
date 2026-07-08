# 06 - API Design

## Auth

```http
POST /api/auth/student/login
POST /api/auth/admin/login
GET /api/auth/me
POST /api/auth/logout
POST /api/auth/change-password
POST /api/admin/students/:id/reset-password
```

## Students

```http
GET /api/admin/students
POST /api/admin/students
PATCH /api/admin/students/:id
DELETE /api/admin/students/:id
POST /api/admin/students/import
GET /api/students/me/dashboard
GET /api/students/me/profile
```

## Courses / Materials

```http
GET /api/admin/courses
POST /api/admin/courses
PATCH /api/admin/courses/:id
DELETE /api/admin/courses/:id
GET /api/courses?level=1
```

Filters:
```txt
level
semester
status
search
```

## Grades

```http
GET /api/admin/grades
POST /api/admin/grades
PATCH /api/admin/grades/:id
DELETE /api/admin/grades/:id
POST /api/admin/grades/import/quiz
POST /api/admin/grades/import/midterm
POST /api/admin/grades/import/final
POST /api/admin/grades/publish
GET /api/students/me/results?examType=midterm
GET /api/students/me/results?examType=final
GET /api/students/me/course-quizzes
```

## Academic Emails

```http
GET /api/admin/academic-emails
PATCH /api/admin/academic-emails/:id
POST /api/admin/academic-emails/import
GET /api/students/me/academic-email
```

## Attendance

```http
GET /api/students/me/attendance
POST /api/admin/attendance/import
PATCH /api/admin/attendance/:id
```

## Complaints

Student:
```http
POST /api/complaints
GET /api/complaints/search?query=
```

Admin/Staff:
```http
GET /api/admin/complaints
GET /api/admin/complaints/:id
PATCH /api/admin/complaints/:id/status
POST /api/admin/complaints/:id/reply
GET /api/admin/complaints/export
PATCH /api/admin/complaints/settings
POST /api/admin/complaints/block-student-code
POST /api/admin/complaints/unblock-student-code
```

## Uploads

```http
POST /api/admin/uploads/students
POST /api/admin/uploads/quiz-grades
POST /api/admin/uploads/midterm-grades
POST /api/admin/uploads/final-grades
POST /api/admin/uploads/attendance
POST /api/admin/uploads/academic-emails
GET /api/admin/uploads/logs
GET /api/admin/uploads/templates/:type
```

## Exam Schedules

```http
GET /api/exam-schedules
GET /api/exam-schedules?type=midterm
GET /api/exam-schedules?type=final
POST /api/admin/exam-schedules
PATCH /api/admin/exam-schedules/:id
DELETE /api/admin/exam-schedules/:id
```

## Exam Places

```http
GET /api/students/me/exam-place?examType=midterm
GET /api/students/me/exam-place?examType=final
POST /api/admin/exam-seat-assignments
POST /api/admin/exam-seat-assignments/import
PATCH /api/admin/exam-seat-assignments/:id
DELETE /api/admin/exam-seat-assignments/:id
```
