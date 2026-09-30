# 11 - Deployment and DevOps Guide

This pnpm monorepo deploys both applications to separate Vercel projects:

- `apps/web`: Next.js frontend;
- `apps/api`: NestJS backend API;
- `packages/shared`: workspace dependency used by both applications.

Production deployments are controlled by GitHub Actions after validation. The
Vercel Git integration is disabled in each app's `vercel.json` to prevent a
second, ungated deployment for the same commit.

## 1. Deployment structure

### Local testing

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- MongoDB and Redis: Docker Compose
- Cookies: `COOKIE_SAME_SITE=lax`, with no `COOKIE_DOMAIN`

```bash
docker compose up --build -d
```

### Vercel production

Create two projects from this Git repository:

| Project | Root Directory | Framework | Config                 |
| ------- | -------------- | --------- | ---------------------- |
| API     | `apps/api`     | NestJS    | `apps/api/vercel.json` |
| Web     | `apps/web`     | Next.js   | `apps/web/vercel.json` |

Keep **Include source files outside the Root Directory** enabled for both
projects because both import `packages/shared`.

For the Web project, leave the dashboard Build Command and Output Directory
empty. `apps/web/vercel.json` explicitly clears stale overrides and lets the
Next.js adapter generate the Build Output API routes. A platform-level
`404 NOT_FOUND` on every path usually means this Root Directory is not
`apps/web`, the web project has no successful production deployment, or the
web project ID points at the API project.

Recommended custom domains:

- Web: `https://portal.example.com`
- API: `https://api.example.com`

For separate default `*.vercel.app` domains, configure the API with
`COOKIE_SAME_SITE=none` and leave `COOKIE_DOMAIN` unset.

The Kubernetes and Docker files remain available for local testing or a future
always-on deployment, but the production GitHub Actions workflow does not build
or deploy container images.

## 2. GitHub Actions CI/CD

Workflow: `.github/workflows/ci-cd.yml`

The validation job runs for pull requests and pushes to `main`, `staging`, and
`release/*`. It:

1. installs Node.js 24 and pnpm 10.28.0;
2. installs the frozen workspace lockfile;
3. restores the local Turborepo cache;
4. runs root lint and typecheck gates;
5. runs API unit tests;
6. builds the workspace through Turborepo;
7. validates API runtime compatibility and the Next.js route manifest;
8. runs API end-to-end tests with MongoDB and Redis services.

All validation steps are blocking. Jest runs in ESM mode to match NestJS 12;
CI no longer hides lint or test failures with `continue-on-error`.

After validation succeeds on `main`:

1. the API project is pulled, built, and deployed with Vercel CLI;
2. `/api/health` is checked on the new production deployment;
3. the web project is pulled, built, and deployed;
4. the web deployment root is checked.

The workflow pins Vercel CLI `59.23.2` so CI behavior does not change without
a reviewed repository update.

The API deploy intentionally completes before the web deploy. A failed API
deployment or health check prevents a new frontend release.

`workflow_dispatch` can also deploy production when the workflow is manually
run against the `main` branch.

## 3. Required GitHub secrets

Add these under **GitHub repository -> Settings -> Secrets and variables ->
Actions -> New repository secret**:

| Secret                  | Value                                       |
| ----------------------- | ------------------------------------------- |
| `VERCEL_TOKEN`          | Vercel account/team access token            |
| `VERCEL_ORG_ID`         | Vercel user or team ID owning both projects |
| `VERCEL_API_PROJECT_ID` | Project ID for the NestJS API project       |
| `VERCEL_WEB_PROJECT_ID` | Project ID for the Next.js web project      |

Create the token in Vercel account settings under **Tokens**. Project IDs are
shown in each Vercel project's **Settings -> General** page. The organization
ID can be read from a locally linked project's `.vercel/project.json` or from
the Vercel team settings.

Do not add application secrets such as `MONGODB_URI` or `JWT_SECRET` to GitHub
for deployment. Store runtime and build environment variables in the matching
Vercel project. `vercel pull` retrieves them securely for the CI build.

Optionally create GitHub environments named `production-api` and
`production-web` and add required reviewers for manual production approval.

## 4. API Vercel environment

Set these in the API Vercel project for Production:

```bash
NODE_ENV=production
NODE_OPTIONS=--experimental-require-module
MONGODB_URI=mongodb+srv://...
JWT_SECRET=replace-with-at-least-32-random-bytes
JWT_EXPIRES_IN=7d
CLIENT_URL=https://your-web-project.vercel.app
WEB_BASE_URL=https://your-web-project.vercel.app
COOKIE_SAME_SITE=none
COOKIE_DOMAIN=
RATE_LIMIT_STORE=mongo
QUEUE_REQUIRED=false
QUEUE_WORKERS_ENABLED=false
RUN_STARTUP_TASKS=false
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

`NODE_OPTIONS` is already committed as a non-secret runtime setting in
`apps/api/vercel.json`. It enables Node's `require(esm)` bridge because NestJS
12 is ESM-only and Vercel disables that bridge by default. The validation job
checks this setting before a production deploy, and the API deploy command also
passes it explicitly as a runtime variable.

Add Cloudinary, Firebase Admin, Gemini, Google sign-in, SMTP, and rate-limit
variables from `.env.example` only when those integrations are used.

`WEB_BASE_URL` belongs to the **API** environment. The API uses it to generate
attendance QR links that open the web application; set it to the canonical web
origin without a trailing slash.

Do not set `PORT` or `API_PORT` in Vercel. Vercel supplies the runtime port.

Persistent BullMQ consumers do not run inside the Vercel API. Email and push
jobs use the inline fallback. Use a separate always-on worker before enabling
durable Redis queues.

## 5. Web Vercel environment

Set the API address in the web Vercel project:

```bash
NEXT_PUBLIC_API_URL=https://your-api-project.vercel.app/api
```

Add the public Firebase browser variables from `.env.example` if notifications
are enabled. `NEXT_PUBLIC_*` values are embedded into the client during build.

Whenever the final web hostname changes, update the API project's `CLIENT_URL`
and redeploy the API.

## 6. First deployment

1. Configure both Vercel projects and their Root Directories.
2. Add all API and web environment variables in Vercel.
3. Add the four GitHub Actions secrets.
4. Push the workflow and app-level Vercel configurations to `main`.
5. Open **GitHub -> Actions -> CI/CD - Vercel** and follow the three jobs.
6. Confirm the API deployment returns HTTP 200 at `/api/health`.
7. Confirm the web deployment serves `/` and `/ar/login` instead of Vercel's
   platform-level `404 NOT_FOUND` page.
8. Confirm web login, cookie persistence, CSRF requests, logout, uploads,
   email/notifications, and attendance updates.

The expected job order is:

```text
Validate monorepo
  -> Deploy API to Vercel
    -> Deploy web to Vercel
```

## 7. Rollback and operational checks

- Use Vercel's deployment history to promote the previous healthy API or web
  deployment when rollback is required.
- Review Vercel Function logs for environment validation, CORS, and MongoDB
  connection failures.
- Review MongoDB Atlas connection counts after bursts of cold starts.
- Keep production environment changes in Vercel, not committed `.env` files.
- Rotate `VERCEL_TOKEN`, database credentials, JWT secrets, and integration
  keys immediately if they appear in logs or source control.

For detailed API deployment and serverless constraints, see
`docs/deploy-api-to-vercel.md`.
