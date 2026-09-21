# 01 - System Architecture

## High-Level Architecture

```txt
Browser
  |
  v
Next.js Web App - Vercel
  |
  v
NestJS API - Vercel Functions
  |
  +-- MongoDB Atlas
  +-- Cloudinary
  +-- Redis / Upstash (optional)
  +-- Inline email/push jobs on Vercel
  +-- Resend
  +-- Firebase Cloud Messaging
  +-- OpenAI later
```

## Backend Modules

```txt
auth
users
students
courses
academic-emails
attendance
course-quizzes
grades
results
exam-schedules
exam-seat-assignments
complaints
surveys
announcements
notifications
uploads
chatbot
admin
settings
common
```

## Role Access

### admin
Full access:
- students CRUD
- courses CRUD
- grades CRUD/import/delete
- academic emails CRUD/import/update
- complaints management
- upload all data
- exam schedules management
- password reset
- system danger zone

### staff
Limited access:
- view students
- manage complaints/tickets
- reply to complaints
- update ticket status
- manage selected academic data if allowed
- cannot delete all data
- cannot reset admin passwords
- cannot access danger zone by default

### student
Own portal only:
- view own data
- submit complaint
- search ticket
- view schedules/results/quizzes/attendance

## Staff Complaint Flow
```txt
Staff login
→ opens complaints page
→ filters tickets
→ opens ticket
→ replies
→ changes status
→ notification sent to student
```

## Admin Upload Flow
```txt
Admin uploads Excel/CSV
→ API validates file type and rows
→ preview errors/success
→ import into MongoDB
→ show import report
```
