# 00 - Project Overview

## Project
Single Institute Student Portal MVP.

## Main Decision
This project is for **one institute only** in the MVP.

Do not build multi-tenancy now.
Do not add `institutionId` everywhere.
Keep the architecture clean so it can become SaaS later.

## Student Login
Students login using:

```txt
studentCode + nationalId
```

The `nationalId` acts as the initial password.

Security:
- Never store nationalId as plain text.
- Store `passwordHash`.
- Store `nationalIdMasked`.
- Force password change after first login.
- Admin can reset password to nationalId or temporary password.

## Student Features
- Dashboard
- Profile
- Attendance percentage
- Course quizzes
- Midterm grades
- Final grades
- Academic email
- Exam schedules
- Exam committee/place based on student code range
- Complaints and maintenance tickets
- Complaint/ticket inquiry
- Announcements
- Notifications
- Basic FAQ chatbot

## Admin/Staff Features
- Admin dashboard
- Manage students
- Manage courses/materials
- Manage grades
- Manage academic emails
- Manage complaints/tickets
- Upload data by Excel/CSV
- Manage exam schedules
- Reset student passwords
- Send notifications
- Manage settings

## Roles
```txt
admin
staff
student
```

## Key Admin Screens Required
Based on screenshots:
- إدارة الطلاب
- إدارة المواد
- إدارة الدرجات
- إدارة البريد الأكاديمي
- الشكاوى والأعطال
- رفع البيانات
- جدول الامتحانات
