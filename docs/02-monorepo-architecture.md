# 02 - Monorepo Architecture

## Structure

```txt
student-portal/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── shared/
│   └── config/
├── docker/
├── docs/
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

## Web Structure

```txt
apps/web/
├── app/
│   ├── (auth)/login/
│   ├── (student)/
│   └── (admin)/
├── components/
├── features/
│   ├── auth/
│   ├── students/
│   ├── courses/
│   ├── grades/
│   ├── academic-emails/
│   ├── complaints/
│   ├── uploads/
│   ├── exam-schedules/
│   └── dashboard/
├── lib/
└── providers/
```

## API Structure

```txt
apps/api/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── students/
│   ├── courses/
│   ├── grades/
│   ├── academic-emails/
│   ├── complaints/
│   ├── uploads/
│   ├── exam-schedules/
│   └── notifications/
├── common/
├── config/
├── database/
├── app.module.ts
├── main.ts
└── worker.ts
```

## Shared Package
Shared constants:
```txt
roles
examTypes
ticketStatuses
courseLevels
gradeStatuses
uploadTypes
```
