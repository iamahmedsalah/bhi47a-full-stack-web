# 11 - Deployment & DevOps Guide

This project is a pnpm monorepo with:

- `apps/web`: Next.js frontend.
- `apps/api`: NestJS backend API.
- `packages/shared`: shared contracts and constants.

Use three deployment lanes:

1. Local tester lane: Docker Compose on one machine.
2. QA URL lane: frontend on Vercel, backend on Railway, database on MongoDB Atlas, Redis on Upstash or Railway Redis.
3. Kubernetes lane: retained for later production-style cluster deployment.

---

## 1. Recommended Deployment Structure

### Local test

Use this for testers and before QA releases.

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- MongoDB: Docker Compose service `mongodb`
- Redis: Docker Compose service `redis`
- Auth cookies: `COOKIE_SAME_SITE=lax`, no `COOKIE_DOMAIN`

Command:

```bash
docker compose up --build -d
```

### QA URL

Use this for stakeholder QA.

- Frontend: Vercel project connected to `apps/web`
- Backend: Railway service using `Dockerfile.api`
- Database: MongoDB Atlas
- Redis: Upstash Redis or Railway Redis
- Health check: `https://api-qa.example.com/api/health`

Recommended domains:

- Web: `https://qa.example.com`
- API: `https://api-qa.example.com`

Keep the web and API on the same parent domain. The app uses httpOnly auth cookies plus a readable `csrf_token` cookie; same-parent domains let the frontend read the CSRF cookie when `COOKIE_DOMAIN=.example.com`.

Avoid using only the default `*.vercel.app` and `*.railway.app` domains for authenticated QA, because those are cross-site and the CSRF cookie flow is less reliable.

### Kubernetes

Keep `/k8s` as the scalable deployment lane, but treat it as a template. Replace image names, hostnames, TLS secret names, and secret values per environment before applying.

---

## 2. Local Test Setup

Create `.env` from `.env.example` and set at minimum:

```bash
JWT_SECRET=replace-with-at-least-32-random-bytes
MONGODB_URI=mongodb://localhost:27017/student-portal
REDIS_URL=redis://localhost:6379
CLIENT_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000/api
API_PORT=4000
PORT=4000
NODE_ENV=development
QUEUE_REQUIRED=false
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
```

Start the full local test stack:

```bash
docker compose up --build -d
docker compose ps
```

Optional seed:

```bash
docker compose exec api npm run seed
```

Smoke checks:

```bash
curl http://localhost:4000/api/health
curl http://localhost:3000
```

---

## 3. QA: Vercel Frontend

Use the root `vercel.json`.

Expected Vercel settings:

- Framework Preset: Next.js
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @student-portal/web build`
- Output Directory: `apps/web/.next`

Required Vercel environment variables:

```bash
NEXT_PUBLIC_API_URL=https://api-qa.example.com/api
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

If using a custom QA domain, set it in Vercel and also include it in the Railway `CLIENT_URL`.

---

## 4. QA: Railway Backend

Use the root `railway.json`. Railway should build `Dockerfile.api` and check `/api/health`.

Required Railway variables:

```bash
NODE_ENV=production
CLIENT_URL=https://qa.example.com
COOKIE_DOMAIN=.example.com
COOKIE_SAME_SITE=lax
JWT_SECRET=replace-with-at-least-32-random-bytes
JWT_EXPIRES_IN=7d
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://...
QUEUE_REQUIRED=true
DNS_SERVERS=8.8.8.8,1.1.1.1
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@example.com
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=30
RATE_LIMIT_STORE=mongo
STUDENT_LOGIN_RATE_LIMIT=8
ADMIN_LOGIN_RATE_LIMIT=8
CHANGE_PASSWORD_RATE_LIMIT=8
STUDENT_COMPLAINT_DAILY_RATE_LIMIT=3
STUDENT_COMPLAINT_REPLY_DAILY_RATE_LIMIT=3
PUBLIC_COMPLAINT_DAILY_RATE_LIMIT=3
FAQ_CHAT_RATE_LIMIT=20
ADMIN_UPLOAD_RATE_LIMIT=20
ADMIN_MESSAGE_RATE_LIMIT=30
```

Railway provides `PORT`; the API supports it. You do not need to set `API_PORT` on Railway unless you want to.

If you cannot use same-parent custom domains and must test with `*.vercel.app` plus `*.railway.app`, set:

```bash
COOKIE_SAME_SITE=none
COOKIE_DOMAIN=
```

This is acceptable for QA smoke testing, but custom same-parent domains are still preferred for authenticated flows.

---

## 5. Kubernetes

Apply order:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

Before applying:

- Replace `ghcr.io/student-portal/api:latest` and `ghcr.io/student-portal/web:latest` with real immutable tags.
- Replace `student-portal.local` with the real cluster hostname.
- Replace all values in `k8s/secrets.yaml`.
- Ensure the TLS secret exists or is created by cert-manager.
- For subdomain deployments, set `COOKIE_DOMAIN` to the shared parent domain, for example `.example.com`.

The API and web deployments use HTTP readiness/liveness probes:

- API: `/api/health`
- Web: `/`

---

## 6. Pre-deployment Checks

Run before opening a QA URL:

```bash
pnpm run build
pnpm --filter @student-portal/api run test
```

For a faster frontend-only check:

```bash
pnpm --filter @student-portal/web build
```

For Docker parity:

```bash
docker compose up --build -d
curl http://localhost:4000/api/health
```

---

## 7. Deployment Notes

- `MONGODB_URI` is the canonical database variable. Do not use `DB_URI` for runtime deployments.
- `CLIENT_URL` may contain comma-separated allowed frontend origins.
- `NEXT_PUBLIC_API_URL` must include the API origin and may include `/api`; the frontend normalizes it.
- `NEXT_PUBLIC_*` values are baked into the Next.js client bundle at build time.
- Never commit real secrets into `k8s/secrets.yaml`, `.env`, Vercel, or Railway logs.
