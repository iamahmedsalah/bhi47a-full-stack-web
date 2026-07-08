# 13 - Implementation Master Prompt

Act like a complete senior startup engineering team:
CTO, software architect, senior backend engineer, senior frontend engineer, DevOps engineer, and product engineer.

Build a production-ready MVP for one private institute.

## Important
This is not multi-tenant SaaS yet.
Do not add institutionId everywhere.
Keep it scalable so it can be converted to SaaS later.

## Stack
- Frontend: Next.js App Router + TypeScript + Tailwind + shadcn/ui
- Backend: NestJS + TypeScript
- Database: MongoDB + Mongoose
- Auth: JWT HttpOnly Cookies + RBAC
- Files: Cloudinary
- Queue: BullMQ + Redis
- Email: Resend
- Notifications: Firebase Cloud Messaging
- AI: Basic FAQ chatbot first

## Login
Students login with:
studentCode + nationalId

National ID is the initial password only.
Hash it.
Force password change after first login.
Admin can reset password.

## Roles
admin, staff, student

## Must Build
Student:
- dashboard
- profile
- attendance
- course quizzes with multiple quizzes per course
- midterm/final grades
- academic email
- exam schedules
- exam place
- complaints/ticket inquiry
- notifications
- FAQ chatbot

Admin:
- students management
- courses/materials management
- grades management
- academic email management
- complaints management
- upload data
- exam schedule management
- reset student password

Staff:
- view complaints
- reply to complaints
- update complaint status
- limited access based on permissions

## Admin UI Must Match Screens
- Arabic RTL
- dark teal theme
- top header
- right sidebar
- tables
- filters
- add/edit/delete buttons
- upload sections
- danger zone

## Generate
1. architecture
2. file structure
3. schemas
4. APIs
5. frontend routes
6. RBAC
7. import/export logic
8. production-ready code

Start with architecture, then implement module by module.
