# 03 - Backend Architecture

## Backend Stack
- NestJS
- TypeScript
- MongoDB + Mongoose
- JWT HttpOnly Cookies
- RBAC Guards
- Cloudinary
- BullMQ + Redis
- Firebase Admin SDK
- Resend
- Swagger

## Required Modules

### Auth
- student login by studentCode + nationalId/password
- admin/staff login by email + password
- logout
- me
- change password
- admin reset student password

### Students
Admin:
- add student
- edit student
- delete/deactivate student
- search by name/studentCode/nationalId
- import students from Excel/CSV
- reset student password

Student:
- dashboard
- profile

### Courses / Materials
Admin:
- add course
- edit course
- delete course
- filter by level
- search by course name

Course fields:
- name
- code
- level
- semester
- department
- isActive

### Grades / Results
Admin:
- add grade manually
- view grades
- filter by course/status/exam type
- import quiz grades
- import midterm grades
- import final grades
- delete specific course data
- danger zone delete all grade data

Student:
- view own quiz/midterm/final grades

### Academic Emails
Admin:
- view all academic emails
- search by code/name/email
- update email
- import academic emails
- activate/deactivate

Student:
- view own academic email

### Complaints / Tickets
Student:
- submit complaint/maintenance ticket
- inquiry by ticket number or student code

Staff/Admin:
- view all tickets
- filter by status/type/priority
- reply
- update status
- open/close complaints system
- disable/enable specific student codes
- export tickets

### Uploads
Admin upload page must support:
- student data Excel
- quiz grades Excel
- midterm grades Excel
- final grades Excel
- attendance Excel
- academic emails Excel
- exam seat assignments Excel

### Exam Schedules
Admin:
- upload/update midterm schedule image/PDF
- upload/update final schedule image/PDF

Student:
- see cards/thumbnails
- open/download schedule

## Common Requirements
- DTO validation
- Swagger
- error handling
- file validation
- import reports
- audit logging
- RBAC guards
- rate limiting
