# 04 - Database Design

## User

```ts
{
  role: "admin" | "staff" | "student",
  name: string,
  email?: string,
  phone?: string,
  studentCode?: string,
  passwordHash: string,
  nationalIdHash?: string,
  nationalIdMasked?: string,
  mustChangePassword: boolean,
  isActive: boolean,
  permissions?: string[],
  fcmTokens: [{
    token: string,
    platform: "web" | "android" | "ios",
    lastUsedAt: Date
  }],
  lastLoginAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
```txt
studentCode unique sparse
email unique sparse
role
isActive
```

## StudentProfile

```ts
{
  userId: ObjectId,
  studentCode: string,
  fullName: string,
  nationalIdMasked: string,
  academicEmail?: string,
  department?: string,
  level: string,
  group?: string,
  section?: string,
  academicYear: string,
  semester: string,
  enrollmentStatus: "active" | "inactive" | "graduated" | "suspended",
  seatNumber?: string,
  createdAt: Date,
  updatedAt: Date
}
```

## Course

```ts
{
  name: string,
  code: string,
  level: "1" | "2" | "3" | "4",
  semester: "first" | "second" | "summer",
  department?: string,
  creditHours?: number,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
```txt
code unique
level
name
isActive
```

## AcademicEmail

```ts
{
  studentId: ObjectId,
  studentCode: string,
  studentName: string,
  academicEmail: string,
  status: "active" | "inactive",
  lastUpdatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
```txt
studentCode unique
academicEmail unique
status
```

## Attendance

```ts
{
  studentId: ObjectId,
  studentCode: string,
  academicYear: string,
  semester: string,
  totalLectures: number,
  attendedLectures: number,
  absenceLectures: number,
  attendancePercentage: number,
  isPublished: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## CourseQuiz

Each course can have more than one quiz.

```ts
{
  studentId: ObjectId,
  studentCode: string,
  courseId: ObjectId,
  courseName: string,
  courseCode: string,
  academicYear: string,
  semester: string,
  quizzes: [{
    quizNumber: number,
    title: string,
    grade: number,
    maxGrade: number,
    status: "present" | "absent" | "banned",
    date?: Date
  }],
  totalGrade: number,
  maxTotalGrade: number,
  percentage: number,
  isPublished: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## Grade / Result

```ts
{
  studentId: ObjectId,
  studentCode: string,
  courseId: ObjectId,
  courseName: string,
  courseCode: string,
  examType: "quiz" | "midterm" | "final",
  grade: number,
  maxGrade: number,
  status: "present" | "absent" | "banned",
  academicYear: string,
  semester: string,
  isPublished: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## ExamSchedule

```ts
{
  title: string,
  type: "midterm" | "final",
  thumbnailUrl?: string,
  imageUrl?: string,
  pdfUrl?: string,
  academicYear: string,
  semester: string,
  isPublished: boolean,
  uploadedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## ExamSeatAssignment

```ts
{
  examType: "midterm" | "final",
  academicYear: string,
  semester: string,
  fromStudentCode: string,
  toStudentCode: string,
  committeeNumber: string,
  building?: string,
  floor?: string,
  room?: string,
  locationText: string,
  notes?: string,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## ComplaintTicket

```ts
{
  ticketNumber: string,
  type: "complaint" | "maintenance",
  priority: "low" | "normal" | "high" | "urgent",
  studentCode: string,
  senderName: string,
  phone?: string,
  email?: string,
  subject: string,
  details: string,
  imageUrl?: string,
  status: "waiting" | "under_review" | "resolved" | "closed" | "rejected",
  replies: [{
    repliedBy: ObjectId,
    role: "admin" | "staff",
    message: string,
    attachments?: string[],
    createdAt: Date
  }],
  createdAt: Date,
  updatedAt: Date
}
```

## ComplaintSettings

```ts
{
  isOpen: boolean,
  openAt?: Date,
  closeAt?: Date,
  blockedStudentCodes: string[],
  messageWhenClosed?: string,
  updatedBy: ObjectId,
  updatedAt: Date
}
```

## UploadImportLog

```ts
{
  type: "students" | "quiz_grades" | "midterm_grades" | "final_grades" | "attendance" | "academic_emails" | "exam_seats",
  fileUrl?: string,
  totalRows: number,
  successRows: number,
  failedRows: number,
  errors: [{
    row: number,
    message: string
  }],
  uploadedBy: ObjectId,
  createdAt: Date
}
```
