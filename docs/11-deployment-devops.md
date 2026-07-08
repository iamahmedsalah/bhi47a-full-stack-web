# 11 - Deployment & DevOps Guide

This guide details how to build, test, and deploy the Student Portal in a production-hardened environment.

---

## 1. Production Architecture Overview

The system is configured as a containerized multi-tier service:
- **Next.js Web Frontend**: Deployed in Node standalone mode for a minimal image size (~120MB). Scales up/down based on CPU/RAM usage.
- **NestJS Backend API**: Handles business logic, DTO validation, and authentication.
- **Database (MongoDB)**: Production uses **MongoDB Atlas** (Managed Serverless or Dedicated Cluster).
- **Cache & Queue (Redis)**: Production uses **Upstash Redis** (Serverless, low-maintenance) for rate limiting and BullMQ background workers.
- **Asset Storage**: **Cloudinary** for image and document uploads.
- **Email Delivery**: **Resend** for transaction emails.
- **Push Notifications**: **Firebase Cloud Messaging (FCM)**.

---

## 2. Running the Local Production Simulation (For Testers)

Testers can run a production-like environment on a single command using Docker Compose:

### Step 1: Set up testing variables
Create or update `.env` in the root of the workspace. (You can copy from `.env.example`).
Ensure keys like `JWT_SECRET` are at least 32 characters long.

### Step 2: Build and start the services
Run the following command to build images and spin up containers for Web, API, MongoDB, and Redis:
```bash
docker compose up --build -d
```

### Step 3: Verify the containers are running
```bash
docker compose ps
```
Expected output:
- `student-portal-web-prod` running on port `3000` (Frontend)
- `student-portal-api-prod` running on port `4000` (API)
- `student-portal-mongodb-prod` running on port `27017` (Database)
- `student-portal-redis-prod` running on port `6379` (Redis cache)

### Step 4: Seed default test accounts (Optional)
If you want to pre-populate the database with test students, admin, and courses, execute:
```bash
docker compose exec api npm run seed
```

---

## 3. Running Production Tests

Before deploying, run all levels of testing to ensure correctness, type safety, and zero regression.

### A. Code Style & Lint Auditing
Check formatting and quality across the entire workspace:
```bash
# From workspace root:
pnpm run lint
```

### B. Workspace Dry-Run Build
Verify that both frontend, backend, and shared packages build without TypeScript compiler or dependency compilation errors:
```bash
pnpm run build
```

### C. Backend Unit Tests
Run the NestJS unit test suites:
```bash
pnpm --filter @student-portal/api run test
```

### D. Backend End-to-End (E2E) Tests
E2E tests verify the database connections, controllers, and authorization pipelines. 
Make sure a test database is running (or docker-compose is active), then run:
```bash
pnpm --filter @student-portal/api run test:e2e
```

---

## 4. Deploying an MVP Test URL for Testers

To share a live test URL with stakeholders or QA testers, choose one of these lightweight cloud approaches:

### Option A: Serverless & PaaS (Recommended for MVP)
Deploy using PaaS providers that integrate natively with Git:
1. **Frontend (Web)**: Deploy to **Vercel** or **Netlify**. Set the `NEXT_PUBLIC_API_URL` environment variable pointing to your backend endpoint (e.g. `https://api.yourdomain.com/api`).
2. **Backend (API)**: Deploy to **Render**, **Railway**, or **Fly.io** as a Web Service. Bind the Dockerfile to `Dockerfile.api`.
3. **Database & Redis**: Use **MongoDB Atlas** free tier and **Upstash Redis** free tier. Set the connection variables (`MONGODB_URI`, `REDIS_URL`) in Render/Railway.

### Option B: Cloud Virtual Machine (VPS / AWS EC2 / DigitalOcean Droplet)
If you have a Linux VM, you can deploy the Docker Compose cluster directly:
1. Install Docker and Docker Compose on the VM.
2. Clone the repository on the VM.
3. Configure the production secrets in a `.env` file.
4. Point a DNS domain (e.g. `test.yourdomain.com`) to the VM IP address.
5. Spin up the containers:
   ```bash
   docker compose -f docker-compose.yml up -d --build
   ```
6. Set up Nginx or Caddy on the host as a reverse proxy to forward traffic:
   - Port `3000` for the Web frontend.
   - Port `4000` for `/api/*` endpoints.

---

## 5. Kubernetes Production Deployment (Scalable Cluster)

For high-scale environments using Kubernetes, apply the configurations in the `/k8s` directory:

1. **Namespace & ConfigMap**:
   ```bash
   kubectl apply -f k8s/configmap.yaml
   ```
2. **Secrets**:
   Update base64 values inside `k8s/secrets.yaml` with production credentials, then run:
   ```bash
   kubectl apply -f k8s/secrets.yaml
   ```
3. **Redis Service**:
   ```bash
   kubectl apply -f k8s/redis-deployment.yaml
   ```
4. **Backend API Service**:
   ```bash
   kubectl apply -f k8s/api-deployment.yaml
   ```
5. **Frontend Web Service**:
   ```bash
   kubectl apply -f k8s/web-deployment.yaml
   ```
6. **Ingress (Routing & SSL)**:
   Ensure you have `ingress-nginx` installed, then deploy:
   ```bash
   kubectl apply -f k8s/ingress.yaml
   ```
