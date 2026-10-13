# 15. Observability, APM & Load Testing Architecture

This document defines the production observability, application performance monitoring (APM), structured logging, database query tracking, and stress testing strategy for the Student Portal.

---

## 1. Architecture Overview (The Three Pillars)

```
                         ┌────────────────────────────────────────────────────────┐
                         │               Observability & APM                      │
                         └───────┬───────────────────┬────────────────────┬───────┘
                                 │                   │                    │
                                 ▼                   ▼                    ▼
                         ┌───────────────┐   ┌───────────────┐    ┌───────────────┐
                         │  1. Metrics   │   │   2. Logs     │    │  3. Traces    │
                         │  (Prometheus) │   │   (Winston)   │    │(CorrelationID)│
                         └───────┬───────┘   └───────┬───────┘    └───────┬───────┘
                                 │                   │                    │
                                 ▼                   ▼                    ▼
                           GET /api/metrics     logs/*.log        x-correlation-id
                                 │                   │                    │
                                 └───────────┬───────┴────────────────────┘
                                             │
                                             ▼
                                     Grafana / Datadog
                                  (Production Dashboards)
```

The system combines three foundational pillars:
1. **Metrics**: Real-time numerical timeseries data via Prometheus (`/api/metrics`) tracking CPU, Memory, Event Loop Lag, HTTP RPS, and MongoDB query latency.
2. **Logs**: Structured JSON logging powered by Winston (`AppLoggerService`) outputting timestamp, level, correlationId, duration, and error stacks.
3. **Traces & Correlation**: Every request receives a unique `x-correlation-id` passed through headers to trace a student's request across the gateway, services, database queries, and background queues.

---

## 2. Prometheus Metrics & Telemetry Endpoints

### A. Raw Prometheus Scrape Endpoint (`GET /api/metrics`)
- **Path**: `GET /api/metrics`
- **Format**: Standard Prometheus text exposition format (`text/plain; version=0.0.4; charset=utf-8`).
- **Security & Access Policy**:
  - **Development Mode (`NODE_ENV !== 'production'`)**: Fully public without any authentication or secret headers. Easily scrapable by local Prometheus instances, k6 scripts, curl, or browsers.
  - **Production Mode (`NODE_ENV === 'production'`)**:
    - **Stealth Mode (Default)**: If `ENABLE_METRICS !== 'true'` and no scrape secret is configured, the endpoint returns `404 Not Found`, completely disguising the route from public port scans and external bots.
    - **Scrape Secret Protection**: When `METRICS_SCRAPE_SECRET` is configured, scrapers (Grafana Agent, Prometheus, Datadog) must provide:
      - `Authorization: Bearer <METRICS_SCRAPE_SECRET>` or
      - `X-Metrics-Secret: <METRICS_SCRAPE_SECRET>`

### B. Admin Portal JSON Telemetry (`GET /api/metrics/summary` & `GET /api/admin/metrics`)
- **Paths**: `GET /api/metrics/summary` and alias `GET /api/admin/metrics`
- **Format**: Structured JSON telemetry payload powering the Admin UI monitor.
- **Security & Access Policy**:
  - **Development**: Fully public via `@PublicInDev()`.
  - **Production**: Strictly protected by `JwtAuthGuard` and restricted to Institute Admins (`@Roles('admin')`).
- **Telemetry Payload Includes**:
  - **Host OS & Hardware**: Node version, platform, arch, CPU cores count, load averages (1m, 5m, 15m), and Host RAM (total vs free).
  - **Infrastructure Status**: Redis/BullMQ (online distributed vs inline fallback), Firebase Admin SDK (active vs disabled), and MongoDB cluster status.
  - **HTTP APM**: Total requests, RPS, 2xx/4xx/5xx status distribution, error rate %, and top 5 slowest routes by average latency.
  - **Database Observability**: Connection state, ping latency (ms), total queries, slow queries count, and recent slow queries buffer.
  - **Security & Academic Metrics**: Logins, brute-force blocks, 429 rate limit triggers, active quiz concurrency, and submissions.

### Exported Metric Names

| Metric Name | Type | Description |
| :--- | :--- | :--- |
| `student_portal_http_requests_total` | Counter | Total HTTP requests categorized by `method`, `route`, and `status_code`. |
| `student_portal_http_request_duration_seconds` | Histogram | Request latency with percentile buckets (`p50`, `p90`, `p95`, `p99`). |
| `student_portal_mongodb_query_duration_seconds` | Histogram | Execution time of MongoDB queries categorized by `collection` and `operation`. |
| `student_portal_mongodb_slow_queries_total` | Counter | Total queries taking $\ge 100\text{ms}$. |
| `student_portal_mongodb_connected` | Gauge | `1` when connected, `0` when disconnected. |
| `student_portal_process_cpu_user_seconds_total` | Counter | Total user CPU time spent by the Node.js process. |
| `student_portal_nodejs_heap_size_used_bytes` | Gauge | Memory allocated in the V8 heap. |
| `student_portal_nodejs_eventloop_lag_seconds` | Gauge | Node.js event loop latency/responsiveness. |

---

## 3. Database Observability & Slow Query Detection

### A. Mongoose Performance Plugin
The database layer includes an automatic Mongoose metrics and query tracking plugin (`apps/api/src/database/mongoose-metrics.plugin.ts`):
- Measures duration across `find`, `findOne`, `aggregate`, `updateOne`, `save`, and `delete`.
- Pushes duration to `student_portal_mongodb_query_duration_seconds`.
- **Automatic Slow Query Alert**: Any query executing longer than **100ms** triggers a Winston warning:
  ```json
  {
    "level": "warn",
    "message": "[SLOW QUERY] quizzes.find took 142ms (threshold: 100ms)",
    "context": "MongooseMetrics",
    "collection": "quizzes",
    "operation": "find",
    "durationMs": 142,
    "filter": "{\"isPublished\":true}"
  }
  ```

### B. Live Database Health Check (`GET /api/health`)
The `/api/health` probe runs an actual MongoDB admin ping and returns ping roundtrip latency:
```json
{
  "status": "ok",
  "environment": "production",
  "version": "1.0.0",
  "uptime": 14285,
  "database": {
    "status": "connected",
    "pingLatencyMs": 4.12,
    "readyState": 1
  },
  "timestamp": "2026-10-13T23:20:00.000Z"
}
```

---

## 4. End-to-End Request Tracing (Correlation ID)

1. The `CorrelationIdMiddleware` inspects incoming HTTP requests for `x-correlation-id` or `x-request-id`.
2. If none exists, it generates a fresh UUIDv4 (`crypto.randomUUID()`).
3. It attaches the ID to:
   - `req.correlationId`
   - Response header: `x-correlation-id: <uuid>`
4. In case of an unexpected 500 error, the client receives this correlation ID to reference in support tickets.

---

## 5. Visualizing & Monitoring (Where to Track)

### Option 1: Grafana Cloud (Recommended Free Tier)
1. Sign up for a free account at [grafana.com](https://grafana.com/).
2. In Grafana Cloud -> **Connections** -> **Prometheus**, add your endpoint:
   - URL: `https://your-api-domain.com/api/metrics`
   - Scrape Interval: `15s`
3. Import the official **Node.js Application Dashboard** (Dashboard ID: `11159` or `12633`):
   - Real-time CPU & RSS Memory charts
   - Request per second (RPS) gauges
   - p95 and p99 latency heatmaps
   - MongoDB query times

### Option 2: Sentry (Error Tracking & APM)
- Tracks unhandled exceptions on frontend & backend.
- Displays slow database transaction waterfalls.

### Option 3: Better Stack / Logtail (Centralized Cloud Logs)
- For instant searching across distributed serverless or container logs by `correlationId`.

---

## 6. How to Run Load & Stress Tests

### A. Quick Command-Line Stress Test
Use the zero-dependency test runner in `scripts/stress-test.mjs`:

```bash
# 1. Test database reads under 100 concurrent requests
node scripts/stress-test.mjs --url http://localhost:4000/api --mode db --concurrency 100 --duration 15

# 2. Test login under heavy load (30 concurrent students)
node scripts/stress-test.mjs --url http://localhost:4000/api --mode auth --concurrency 30 --duration 10

# 3. Test a deployed cloud instance
node scripts/stress-test.mjs --url https://api.yourdomain.com/api --mode db --concurrency 50 --duration 15
```

### B. High-Scale k6 Load Test
Use the comprehensive k6 scenario in `scripts/k6-load-test.js`:

```bash
# Local test:
k6 run scripts/k6-load-test.js

# Remote test against staging or production:
k6 run -e TARGET_URL=https://api.yourdomain.com/api scripts/k6-load-test.js

# Cloud-distributed run (from multiple global regions):
k6 cloud scripts/k6-load-test.js
```

### Production Acceptance Criteria (Quality Gate)
- **Error Rate**: $< 2.0\%$ under peak concurrency (300 concurrent students).
- **p95 Response Time**: $< 800\text{ms}$.
- **p99 Response Time**: $< 2000\text{ms}$.
- **MongoDB Ping Latency**: $< 25\text{ms}$.
