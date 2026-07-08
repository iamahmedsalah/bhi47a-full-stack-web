# 05 - Authentication & RBAC

## Login Methods

### Student
```txt
studentCode + nationalId/password
```

### Admin/Staff
```txt
email + password
```

## Password Rules
- nationalId is only initial password
- password is hashed
- student must change password after first login
- admin can reset password

## Roles

```txt
admin
staff
student
```

## Permissions

### admin
Can:
- manage students
- manage courses
- manage grades
- manage academic emails
- manage schedules
- manage complaints
- open/close complaints system
- upload data
- delete data
- reset passwords
- manage staff permissions

### staff
Can:
- view students
- view courses
- view complaints
- reply to complaints
- update complaint status
- export complaints if allowed
- cannot delete all data
- cannot reset passwords unless allowed

### student
Can:
- view own profile
- view own attendance
- view own quizzes/results
- view exam schedules
- view exam place
- create complaint
- search own ticket
- view notifications

## Permission Examples
```txt
students.read
students.write
students.reset_password
courses.read
courses.write
grades.read
grades.write
grades.delete
academic_emails.read
academic_emails.write
complaints.read
complaints.reply
complaints.manage_settings
uploads.import
exam_schedules.write
danger_zone.delete_all
```

## Guards
- JwtAuthGuard
- RolesGuard
- PermissionsGuard
- CurrentUser decorator
- Public decorator
