# Student Portal Tech Stack Reference

Use this reference when decisions depend on the user's declared package stack.

## Backend package profile

Package name: `@student-portal/api`

Runtime and framework:

- NestJS `^11.0.1`
- TypeScript `^5.7.3`
- Node types `^24.0.0`
- Express platform via `@nestjs/platform-express`

Data and validation:

- MongoDB through `mongoose ^8.10.0` and `@nestjs/mongoose ^11.0.0`
- DTO validation with `class-validator ^0.14.1`
- Serialization with `class-transformer ^0.5.1`

Auth and security:

- `@nestjs/jwt ^11.0.0`
- `@nestjs/passport ^11.0.0`
- `passport ^0.7.0`
- `passport-jwt ^4.0.1`
- `bcrypt ^6.0.0`
- `cookie-parser ^1.4.7`

Operations and integrations:

- Config: `@nestjs/config ^4.0.0`, `dotenv ^17.4.2`
- Queue: `bullmq ^5.63.0`
- Push notifications: `firebase-admin ^14.1.0`
- Email: `resend ^6.6.0`
- Logging: `winston ^3.19.0`
- Excel: `xlsx ^0.18.5`
- API docs: `@nestjs/swagger ^11.0.0`

Backend scripts:

- `build`: `nest build`
- `dev` / `start:dev`: `nest start --watch`
- `start:prod`: `node dist/main`
- `lint`: `eslint "{src,apps,libs,test}/**/*.ts" --fix`
- `test`: `jest`
- `test:e2e`: `jest --config ./test/jest-e2e.json`
- `seed`: `ts-node src/database/seed.ts`

## Frontend package profile

Package name: `@student-portal/web`

Runtime and framework:

- Next.js `16.2.9`
- React `19.2.4`
- React DOM `19.2.4`
- TypeScript `^5`
- Next App Router assumed unless repo proves otherwise
- Dev script uses `next dev --webpack --port 3000`
- React Compiler plugin: `babel-plugin-react-compiler 1.0.0`

Styling and UI:

- Tailwind CSS `^4`
- `@tailwindcss/postcss ^4`
- Radix UI component packages
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react`
- `sonner`
- `framer-motion`

Data, forms, state:

- Server state: `@tanstack/react-query ^5.101.2`
- HTTP: `axios ^1.7.0`
- Client state: `zustand ^5.0.14`
- Forms: `react-hook-form ^7.61.1`
- Resolver: `@hookform/resolvers ^3.10.0`
- Validation: `zod ^3.25.76`

Internationalization and theme:

- `next-intl ^4.0.0`
- `next-themes ^0.3.0`

Data display and export/import:

- `recharts ^2.15.4`
- `read-excel-file ^6.0.1`
- `html2canvas`, `html2canvas-pro`

Frontend scripts:

- `dev`: `next dev --webpack --port 3000`
- `build`: `next build`
- `start`: `next start`
- `lint`: `eslint`

## Version-sensitive guidance

- Do not assume older Next.js or React behavior. Inspect existing App Router patterns, server/client component boundaries, and compiler constraints.
- Keep browser-only code inside client components and guard access to `window`, `document`, and `localStorage`.
- Avoid hydration mismatches: read theme, locale, persisted state, and media queries with mounted guards or server-compatible defaults.
- Keep secrets out of `NEXT_PUBLIC_*` unless intentionally public.

## Product and architecture references added 2026-07-08

For large implementation prompts, align with `implementation-master-prompt.md`:

- Single private institute MVP, not multi-tenant SaaS yet.
- Do not add `institutionId` broadly unless converting to SaaS is requested.
- Student login starts with `studentCode + nationalId`, with the national ID hashed and treated only as an initial password.
- Force password change after first login.
- Roles: `admin`, `staff`, `student`.
- Core integrations: Cloudinary for files, BullMQ + Redis for queues, Resend for email, Firebase Cloud Messaging for notifications, FAQ chatbot as the first AI scope.

For refactoring and audits, align with `architecture-quality-audit.md`:

- Thin frontend route files and feature-owned folders.
- Typed API boundary around the Axios/envelope flow.
- Shared admin table/toolbar/pagination/upload/export primitives.
- One accessible select/dropdown system.
- Split large backend services by query/command/policy/importer/repository responsibilities.
- Redis-backed rate limiting for production.
- Import/export pipeline with row-level validation and background jobs for large files.
- Explicit permissions for admin/staff actions.
