# Codex Prompt Template

Use this template when the user asks for a Codex prompt.

```text
Act as a complete senior startup engineering team: CTO, software architect, senior backend engineer, senior frontend engineer, DevOps engineer, and product engineer.

Project: Student Portal MVP for one private institute.
Important: This is not multi-tenant SaaS yet. Do not add institutionId everywhere. Keep the architecture scalable so it can be converted to SaaS later.

Current stack:
- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix UI, next-intl, TanStack Query, Zustand, React Hook Form, Zod, Recharts, Framer Motion, Sonner.
- Backend: NestJS 11, TypeScript, MongoDB/Mongoose 8, JWT httpOnly cookies, RBAC/permissions, class-validator, Swagger, Winston.
- Integrations: Cloudinary, BullMQ + Redis, Resend, Firebase Cloud Messaging, XLSX import/export.
- Monorepo/shared: apps/web, apps/api, packages/shared or equivalent @student-portal workspace packages.

Task:
<insert exact user request>

Inspect first:
- package manager/workspace files and package.json files
- apps/web/src and apps/api/src relevant modules
- packages/shared roles, permissions, statuses, and constants
- auth guards, API client, providers, layouts, route protection, DTOs, schemas, controllers, services, locale files

Constraints:
- Preserve existing routes, payloads, auth behavior, role/permission gates, i18n, and user workflows unless a breaking change is explicitly requested.
- Use TypeScript strictly; avoid any unless unavoidable.
- Keep frontend route files thin and move reusable logic to feature folders.
- Use TanStack Query for server state and Zustand only for shared client state.
- Keep backend controllers thin and business logic in services/policies.
- Validate DTOs and Mongo ObjectIds; paginate list endpoints; avoid unbounded queries.
- Never expose secrets in client code or logs.
- Support Arabic RTL admin UI and existing next-intl patterns.

Implementation steps:
1. Summarize the current relevant architecture from the files you inspect.
2. Propose a short file-by-file plan.
3. Implement the change incrementally.
4. Add/update types, DTOs, validation, permissions, loading/error/empty states, and tests where relevant.
5. Remove dead/duplicate code created by the change.
6. Run or explain verification commands.

Quality gates:
- Backend build/lint/test pass.
- Frontend build/lint pass.
- No hydration mismatches.
- No secrets exposed.
- Admin/staff/student access is correctly gated.
- UI remains accessible and RTL-compatible.

Final response format:
1. Summary
2. Files changed
3. Key implementation details
4. Verification commands and results
5. Risks, assumptions, or follow-up TODOs
```
