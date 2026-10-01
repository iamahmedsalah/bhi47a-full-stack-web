---
name: ci-cd-verifier
description: Post-coding verification workflow for GitHub Actions CI/CD pipeline on the Student Portal monorepo. Use after making code changes to run linting, typechecking, unit tests, e2e tests, builds, and Vercel deployment validation checks before committing and pushing.
---

# CI/CD Verifier Skill

This skill enforces a comprehensive, automated post-coding verification workflow matching the exact GitHub Actions pipeline in `.github/workflows/ci-cd.yml`.

Run this workflow whenever code changes are made across `apps/api`, `apps/web`, or `packages/shared` before committing or pushing to ensure GitHub Actions runs green.

---

## The GitHub Actions Pipeline Matrix

The repository CI/CD workflow (`.github/workflows/ci-cd.yml`) executes the following sequential stages in the `validate` job:

| Stage | Command | Scope | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **1. Lint** | `pnpm run lint` | `@student-portal/shared`, `@student-portal/api`, `@student-portal/web` | **0 errors**. No fatal React Compiler or `@typescript-eslint` errors. |
| **2. Typecheck** | `pnpm run typecheck` | Monorepo root + all 3 packages | **0 type errors** (`tsc --noEmit` exits with code 0). |
| **3. Unit Tests** | `pnpm run test -- --runInBand` | `@student-portal/api` | **All suites pass** (20/20 test suites, 86+ tests). |
| **4. Build** | `pnpm run build` | `@student-portal/shared`, `@student-portal/api`, `@student-portal/web` | All packages compile; Next.js static and dynamic routes generate cleanly. |
| **5. API Runtime Audit** | Node script check | `apps/api/vercel.json` | `NODE_OPTIONS` must contain `--experimental-require-module`. |
| **6. Web Route Audit** | Node script check | `apps/web/.next` manifests | Root route `'/'` exists in `routes-manifest.json` and `appRoutes['/page'] === '/'`. |
| **7. E2E Tests** | `pnpm run test:e2e -- --runInBand` | `@student-portal/api` | App boots, DB connects, rate limiter initializes, `/health` returns 200 `{ status: "ok" }`. |

---

## Step-by-Step Verification Protocol

When you finish modifying or writing code, run the following steps in sequence:

### Step 1: Workspace Linting
```bash
pnpm run lint
```
- **Validation**: Ensure all 3 packages finish with exit code 0.
- **Rules to watch**:
  - `apps/web`: `eslint-config-next@16` + `eslint-plugin-react-hooks@7` enable React Compiler rules (`react-hooks/preserve-manual-memoization`, `react-hooks/set-state-in-effect`, `react-hooks/immutability`). Because `reactCompiler: false` is configured in `next.config.ts`, ensure these remain configured as `warn` or `off` in `apps/web/eslint.config.mjs`.
  - `@typescript-eslint/no-explicit-any` should not fail builds (warn/off).
  - Never mutate hook-returned states directly (e.g., `user.mustChangePassword = false`).

### Step 2: TypeScript Typechecking
```bash
pnpm run typecheck
```
- **Validation**: Ensure 4/4 tasks pass (`@student-portal/shared`, `@student-portal/api`, `@student-portal/web`, root).

### Step 3: API Unit Tests
```bash
pnpm run test -- --runInBand
```
- Or per-filter: `pnpm --filter @student-portal/api test`
- **Validation**: All test suites in `apps/api/src/**/*.spec.ts` must pass.

### Step 4: Monorepo Production Build
```bash
pnpm run build
```
- **Validation**: Next.js 16 app compiles, pages generate without SSG/SSR errors, and NestJS build outputs to `apps/api/dist`.

### Step 5: Vercel Artifact Validations (Matches CI)

**API Vercel Compatibility Check:**
```bash
node -e "const c = require('./apps/api/vercel.json').env.NODE_OPTIONS; if (c !== '--experimental-require-module') throw new Error('Invalid NODE_OPTIONS in vercel.json');"
```

**Web Route Manifest Check:**
```bash
node -e "const r = require('./apps/web/.next/routes-manifest.json'); const a = require('./apps/web/.next/app-path-routes-manifest.json'); if (!r.staticRoutes.some(({page}) => page === '/') || a['/page'] !== '/') throw new Error('Root route missing in manifest');"
```

### Step 6: API E2E Test Suite (Crucial for ESM/CJS)
```bash
pnpm run test:e2e -- --runInBand
```
- Or per-filter: `pnpm --filter @student-portal/api test:e2e`
- **Validation**: `test/app.e2e-spec.ts` must pass.
- **Node Experimental VM Modules Gotcha**:
  - Jest runs with `node --experimental-vm-modules`.
  - Mongoose is CommonJS without named exports in Node ESM.
  - **NEVER** write `import { Connection } from 'mongoose'`.
  - **ALWAYS** write `import type { Connection } from 'mongoose'` or `import mongoose from 'mongoose'`.

---

## Automated Shortcut Commands

To run the complete fast pre-flight check in one go:

**Windows PowerShell:**
```powershell
pnpm run lint; pnpm run typecheck; pnpm --filter @student-portal/api test; pnpm run test:e2e
```

**Linux / CI Bash:**
```bash
pnpm run lint && pnpm run typecheck && pnpm run test -- --runInBand && pnpm run test:e2e -- --runInBand
```

---

## Critical Rules & CI Invariants

1. **Strict Type-Only Imports for Mongoose Classes**:
   In any file loaded by NestJS dependency injection or tests, import Mongoose types using `import type { ... } from 'mongoose'`. Never import `{ Connection }` as a runtime value.
2. **React 19 Immutability**:
   Never mutate objects directly from React hooks or stores (e.g., `user.xxx = yyy`). Update via state setter, store action, or refetch.
3. **No Standalone ESLint Crashers**:
   Ensure `apps/web/eslint.config.mjs` properly sets React compiler rules to `warn` or `off` whenever `reactCompiler: false` is active in `next.config.ts`.
4. **Git Cleanliness**:
   Before committing, verify `git status -s` to ensure no unexpected scratch files, logs, or uncommitted breaking edits exist.
