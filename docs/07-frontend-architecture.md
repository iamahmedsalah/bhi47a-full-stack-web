# 07 - Frontend Architecture

## UI Style
Arabic RTL, dark teal dashboard, card-based layout, right sidebar, cyan accents.

## Admin Routes

```txt
/admin
/admin/students
/admin/courses
/admin/grades
/admin/academic-emails
/admin/complaints
/admin/uploads
/admin/exam-schedules
/admin/settings
```

## Admin Layout
Based on screenshots:
- top header with institute logo/name
- logout button
- time widget
- right sidebar
- page title badge
- tables
- filters
- action buttons

## Admin Sidebar
```txt
الطلاب
المواد
الدرجات
البريد الأكاديمي
الشكاوى والأعطال
رفع البيانات
جدول الامتحانات
```

## Students Management Page
Must include:
- Add student button
- Search by student code or name
- Table columns:
  - الكود الأكاديمي
  - اسم الطالب
  - الرقم القومي
  - الحالة
  - الإجراءات
- Actions:
  - edit
  - delete/deactivate
  - reset password

## Courses / Materials Page
Must include:
- Add course button
- Level filter:
  - all
  - level 1
  - level 2
  - level 3
  - level 4
- Course table:
  - course name
  - level
  - actions edit/delete

## Grades Management Page
Must include:
- Add grade
- View results
- Exam type tabs:
  - quizzes
  - midterm
  - final
- Search by student code
- Filters:
  - all courses
  - all statuses
- Table:
  - student
  - course
  - grade
  - status
  - actions

## Academic Email Page
Must include:
- Search by code/name/email
- Table:
  - student code
  - student name
  - academic email
  - status
  - update action

## Complaints Admin/Staff Page
Must include:
- total tickets count
- open/close system buttons
- open/close scheduling
- block/unblock student code
- stats cards:
  - by status
  - by type
  - by priority
- filters:
  - search
  - type
  - status
  - priority
- table:
  - ticket number
  - type
  - sender
  - priority
  - status
  - last update
  - date
  - view action
- staff can reply and update status

## Upload Data Page
Must include sections:
- Upload student data
- Upload quiz grades
- Upload midterm grades
- Upload final grades
- Upload attendance
- Upload academic emails
- Download CSV templates
- Show required columns
- Danger zone:
  - delete selected course data
  - delete all data

## Exam Schedules Admin Page
Must include:
- tabs:
  - midterm
  - final
- current schedule preview
- upload new image
- upload/update button
- optionally PDF upload
