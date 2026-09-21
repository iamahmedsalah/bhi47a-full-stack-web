# Deploy the Student Portal API to Vercel

The web app and API must be two separate Vercel projects connected to the same
repository. The existing root `vercel.json` remains the web deployment. Create
a second Vercel project whose Root Directory is `apps/api`.

Vercel detects `apps/api/src/main.ts` as a NestJS server entry point and turns
the whole API into one Node.js Vercel Function. Do not add an `api/` wrapper,
Lambda adapter, output directory, or route rewrites.

## 1. Prepare external services

1. Create a production MongoDB Atlas database and a least-privilege database
   user. Put the database in a region close to the Vercel Function region.
2. In Atlas Network Access, allow traffic from Vercel. Vercel deployments use
   dynamic outbound IPs unless a paid static-egress option is configured, so a
   common initial setup is `0.0.0.0/0` plus a strong database password and
   least-privilege user. Restrict this later if static egress is available.
3. Configure Resend, or provide both SMTP username and password. Production
   startup validation requires one email provider.
4. Configure Cloudinary if exam schedule image/PDF uploads are used.
5. Configure Firebase and Gemini only when their features are needed.

Do not put production secrets in `.env`, Git, screenshots, or
`NEXT_PUBLIC_*` variables.

## 2. Create the API project in Vercel

1. Open **Vercel Dashboard -> Add New -> Project**.
2. Import this same Git repository again.
3. Name the project, for example, `student-portal-api`.
4. Set **Root Directory** to `apps/api`.
5. Keep **Include source files outside of the Root Directory** enabled. The API
   imports `packages/shared` through the pnpm workspace.
6. Use the detected **NestJS** framework preset.
7. Leave Build Command and Output Directory at their detected defaults. Current
   Vercel NestJS support compiles and bundles `src/main.ts` directly.
8. Use Node.js `24.x`. It is also pinned in `apps/api/package.json`.
9. Enable Fluid compute if the project does not already have it enabled.

The root `postinstall` script builds `@student-portal/shared`, ensuring its
runtime `dist` output exists before Vercel bundles the API.

## 3. Add API environment variables

Add variables under **Project Settings -> Environment Variables**. Apply them
to Production. Add safe equivalents to Preview only if preview deployments
should connect to a non-production database.

### Required

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | MongoDB Atlas SRV connection string |
| `JWT_SECRET` | Random secret of at least 32 bytes |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | Comma-separated allowed web origins |
| `COOKIE_SAME_SITE` | `none` when web and API use separate `*.vercel.app` hosts |
| `COOKIE_DOMAIN` | Leave unset for `*.vercel.app` deployments |
| `RATE_LIMIT_STORE` | `mongo` |
| `QUEUE_REQUIRED` | `false` |
| `QUEUE_WORKERS_ENABLED` | `false` |
| `RUN_STARTUP_TASKS` | `false` |
| `RESEND_API_KEY` | Resend API key, unless SMTP is configured |
| `RESEND_FROM_EMAIL` | A verified sender such as `Portal <portal@example.com>` |

Generate `JWT_SECRET` locally and paste only its output into Vercel:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Example `CLIENT_URL` during the initial Vercel deployment:

```text
https://student-portal.vercel.app,https://student-portal-*.vercel.app
```

Use the actual web project host. Do not include paths or a trailing slash.
The wildcard supports web preview deployment origins. Remove it if previews
must not access the API.

Do not manually set `PORT` or `API_PORT` on Vercel. Vercel supplies `PORT` to
the captured NestJS server.

### Optional integrations

Copy the relevant names from the root `.env.example`:

- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`
- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY`
- Gemini: `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`,
  `AI_MONTHLY_TOKEN_BUDGET`
- Google sign-in: `GOOGLE_CLIENT_ID`
- SMTP alternative: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM_EMAIL`
- Feature-specific rate limits and account lock settings from `.env.example`

For `FIREBASE_PRIVATE_KEY`, preserve the escaped `\n` characters. The API
converts them to real newlines at runtime.

## 4. Deploy and verify the API

Deploy from the Vercel dashboard or push the branch. After Vercel assigns the
API URL, verify:

```text
GET https://student-portal-api.vercel.app/api/health
```

Expected response fields include `status: "ok"` and
`environment: "production"`.

Swagger is disabled in production by default. If it is temporarily required,
set `ENABLE_SWAGGER=true`, redeploy, inspect `/api/docs`, then remove the
variable and redeploy.

Check the first invocation logs for:

- successful MongoDB connection;
- no missing environment-variable error;
- no CORS error for the exact web origin;
- no repeated BullMQ worker registrations.

## 5. Point the web project to the API

In the existing web Vercel project, set:

```text
NEXT_PUBLIC_API_URL=https://student-portal-api.vercel.app/api
```

Redeploy the web project because `NEXT_PUBLIC_*` values are embedded at build
time. The client already sends credentials and CSRF tokens. The attendance SSE
URL now uses the same normalized API base URL, and the UI polls persisted
attendance records every five seconds so updates still work when requests land
on different Vercel Function instances.

If the final web hostname differs from the value in the API's `CLIENT_URL`,
update `CLIENT_URL` and redeploy the API.

## 6. Smoke-test the production flow

Run these checks from the deployed web app:

1. Open `/api/health` directly and confirm HTTP 200.
2. Log in, refresh the browser, and call the profile endpoint. This confirms
   cross-origin cookies are being stored and sent.
3. Submit a state-changing request to confirm CSRF handling.
4. Log out and confirm the session cookies are cleared.
5. Upload a CSV/XLSX file smaller than 4 MB.
6. Upload an exam image/PDF smaller than 4 MB and confirm Cloudinary delivery.
7. Send an email and notification. On Vercel these run inline with the request,
   because persistent BullMQ workers are intentionally disabled.
8. Start an attendance session and confirm new check-ins appear within five
   seconds, even if the SSE connection reconnects.
9. Review Vercel Function logs and Atlas connection counts after a few cold
   starts.

## Serverless constraints in this repository

- Vercel Function request and response payloads are limited to 4.5 MB. The API
  caps uploads and JSON bodies at 4 MB to leave multipart overhead.
- BullMQ workers need an always-on process. The Vercel API falls back to
  processing email and push jobs within the request. If durable queues become
  necessary, deploy a separate worker service and split producer/consumer
  configuration before enabling Redis queues.
- `RUN_STARTUP_TASKS=false` prevents academic-email synchronization and legacy
  grade-index maintenance from running on every cold start. Run the current API
  once in a controlled non-serverless environment with startup tasks enabled
  before the cutover if the production database has never received those
  maintenance operations.
- The in-memory part of attendance SSE is instance-local. Database polling is
  the reliable cross-instance fallback. A future Redis pub/sub adapter can make
  SSE fully distributed.
- The function filesystem is ephemeral. This API already uses memory buffers,
  Cloudinary, MongoDB, and console logging instead of depending on persistent
  local files in Vercel.

## Recommended custom-domain setup

After the first successful deploy, prefer domains such as:

```text
https://portal.example.com
https://api.example.com
```

Then set `CLIENT_URL=https://portal.example.com`, set the web
`NEXT_PUBLIC_API_URL=https://api.example.com/api`, and keep `COOKIE_DOMAIN`
unset unless there is a specific requirement to share cookies with other
subdomains. Redeploy both projects and repeat the login/CSRF smoke tests.
