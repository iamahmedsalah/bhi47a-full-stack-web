# 17. Quizzes, Attendance QR Architecture, and BullMQ Task Management Plan

> **Executive Summary**: This plan provides an end-to-end implementation blueprint for high-concurrency features in the Student Portal: **Quizzes**, **Rotating QR Attendance**, **Portal-Wide Caching Strategy**, and **BullMQ Background Task Orchestration**. It enforces strict environment isolation to ensure **Redis is only contacted in production**, while local development and automated testing run 100% in-memory with zero Redis quota consumption.

---

## 1. Environment Isolation: Production Redis vs. Local In-Memory

### 1.1 The Golden Rule of Quota Safety
To guarantee that cloud Redis (Upstash) daily limits are never depleted during local coding or testing:
- **Test Mode (`NODE_ENV=test`)**: Automatically uses `MemoryCacheStore`. Zero network calls, zero Redis commands.
- **Local Development (`NODE_ENV=development`)**: Defaults to `MemoryCacheStore` even if `REDIS_URL` is defined in `.env`.
- **Production Mode (`NODE_ENV=production`)**: Activates `HybridCacheStore` (L1 in-memory + L2 Redis) or explicit `CACHE_DRIVER=redis`.

```
                    ┌──────────────────────────────────────────────────┐
                    │               CacheService Resolution            │
                    └─────────────────────────┬────────────────────────┘
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    │                                                  │
             NODE_ENV === 'production'                    NODE_ENV !== 'production'
                    │                                                  │
                    ▼                                                  ▼
      ┌───────────────────────────┐                      ┌───────────────────────────┐
      │  L1: In-Memory (15-30s)   │                      │  100% In-Memory Store     │
      │  L2: Cloud Redis (Upstash)│                      │  Zero Cloud Redis Spend   │
      │  (Absorbs 90% in L1)      │                      │  Instant 0ms Dev Latency  │
      └───────────────────────────┘                      └───────────────────────────┘
```

---

## 2. Quizzes & Online Assessments Caching Strategy

### 2.1 The Exam Day Spike
When an instructor opens an online quiz (e.g. 15 minutes, 20 questions), **150–300 students open the quiz at the exact same minute**.
Without caching:
- 250 parallel queries fetch the same quiz document, questions, options, and course data.
- 250 parallel queries query student course registrations and profile block status.
- High risk of connection pool exhaustion and database locks.

### 2.2 Quiz Cache Matrix

| Target | Key Pattern | TTL | Contents | Invalidation Trigger |
|---|---|---|---|---|
| **Sanitized Quiz Manifest** | `quiz:manifest:{quizId}` | Match quiz duration (e.g. 30m) | Questions, options, point values, duration, rules (**NO correct answers**) | Instructor edits quiz (`PATCH /admin/quizzes/:id`) |
| **Student Quizzes Feed** | `student:quizzes:{studentId}` | 30 sec | Active/upcoming quizzes for registered courses | Quiz published, registered courses change |
| **Student Attempt Lock** | `quiz:lock:{quizId}:{studentId}` | 15 sec | Prevents double-clicking "Start" or opening multiple browser tabs | Released on attempt initialization |
| **Active Attempt Timer** | `quiz:attempt:{attemptId}` | Duration + 5m | Started timestamp, remaining seconds, student answers draft | Updated on answer autosave, cleared on submit |

### 2.3 Quiz Auto-Submission via BullMQ
When a student starts a quiz:
1. Student calls `POST /api/quizzes/:id/start-attempt`.
2. The API creates `QuizAttempt` and enqueues a delayed BullMQ job:
   ```typescript
   await this.queueService.add('quiz-queue', 'auto-submit', {
     attemptId: attempt._id,
     quizId: quiz._id,
     studentId: studentUser._id,
   }, undefined, {
     delay: (quiz.durationMinutes * 60 + 30) * 1000, // Duration + 30s grace period
   });
   ```
3. If the student submits before the timer expires, the attempt status becomes `'completed'`.
4. When the delayed job fires:
   - Worker checks if `attempt.status === 'in_progress'`.
   - If still pending, worker automatically grades whatever answers were autosaved and marks the attempt as `'completed'` (timeout).

---

## 3. Rotating QR Code & Attendance Architecture

### 3.1 Mechanics of Rotating Tokens
- Attendance uses dynamic time-bucketed HMAC SHA-256 tokens rotating every 25 seconds:
  `token = {sessionId}.{timeBucket}.{hmacSignature}`
- The session presenter frontend polls or receives rolling tokens.

### 3.2 The Check-In Concurrency Bottleneck
In a physical lecture hall:
- 150 students scan the projected QR code within the same 10-second window.
- Currently, each scan triggers:
  1. `AttendanceSession.findById(sessionId).select('+sessionSecret')`
  2. `CourseRegistration.findOne(...)`
  3. `AttendanceRecord.findOne(...)`
  4. `AttendanceRecord.create(...)`
- 150 concurrent Mongoose queries flood the database.

### 3.3 Optimized Attendance Caching Pipeline

```
Student Scans QR 
      │
      ▼
[ 1. Check-In Lock ] ───▶ `checkin:lock:{sessionId}:{studentId}` (TTL 10s)
      │                   (If key exists, reject duplicate scan instantly in 0ms)
      ▼
[ 2. Session Cache ] ───▶ `attendance:session:{sessionId}` (TTL: Session remaining time)
      │                   (Cached in Memory/Redis: holds sessionSecret, qrRotationSeconds, geoCoords)
      │                   (ZERO MongoDB queries to validate rotating token signature!)
      ▼
[ 3. Registration  ] ───▶ `student:reg:{studentId}:{courseId}` (TTL 5m)
      │                   (Validates enrollment without querying course_registrations collection)
      ▼
[ 4. Record Check-In]───▶ Atomic Mongoose write with compound unique index `{ sessionId, studentId }`
      │
      ▼
[ 5. BullMQ Async ]  ───▶ Enqueue background analytics:
                          - Update aggregate lecture attendance rate
                          - Check absence warning thresholds (>3 absences ➔ notify advisor)
```

---

## 4. Master Portal Caching Map: The Best Places to Cache

| Feature / Page | What to Cache | Key Pattern | TTL | Savings |
|---|---|---|---|---|
| **1. Quizzes** | Sanitized questions & options | `quiz:manifest:{quizId}` | 30m | 95% query reduction during live exams |
| **2. Attendance** | Active session credentials | `attendance:session:{sessionId}` | Match session expiry | Zero DB queries for token signature validation |
| **3. Registration Terms**| Current active academic term | `term:current` | 10m | Eliminates repetitive term lookups |
| **4. Course Catalog** | All courses by level/sem | `courses:catalog:{level}:{sem}` | 15m | Instant course selection dropdowns |
| **5. Course Map / Graph** | Prerequisite flow dependencies | `courses:prerequisites` | 30m | Renders course tree in <2ms |
| **6. Academic Advising** | Student degree progress & GPA | `advising:progress:{studentId}` | 5m | Heavy audit queries run once per session |
| **7. Exam Schedules** | Timetable & seating distribution| `exams:schedule:{level}:{sem}` | 15m | Eliminates repeated scans during finals |
| **8. Exam Room / Seat** | Individual student exam location| `student:seat:{studentId}` | 30m | Fast lookup on exam morning |
| **9. Admin Dashboard** | Student status & tuition totals | `admin:students:stats` | 30s | Collapses 9 dashboard counts into 0ms memory |
| **10. Complaints Stats**| Total open, resolved, pending | `admin:complaints:counts` | 30s | Quick admin badge counter |

---

## 5. BullMQ Task Orchestration Architecture

The system standardizes on **5 distinct background queues** managed via `QueueService`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BullMQ Queue Topology                             │
├─────────────────┬───────────────────┬───────────────────────────────────────┤
│ Queue Name      │ Worker Concurrency│ Purpose                               │
├─────────────────┼───────────────────┼───────────────────────────────────────┤
│ `quiz-queue`    │ 5                 │ - Delayed auto-submit on timer expiry │
│                 │                   │ - Asynchronous grade computation      │
├─────────────────┼───────────────────┼───────────────────────────────────────┤
│ `attend-queue`  │ 3                 │ - Auto-closing expired sessions       │
│                 │                   │ - Absence threshold warnings (3+ abs) │
│                 │                   │ - Excel export generation             │
├─────────────────┼───────────────────┼───────────────────────────────────────┤
│ `notify-queue`  │ 10                │ - FCM Web Push multicast batches      │
│                 │                   │ - In-app notification delivery        │
├─────────────────┼───────────────────┼───────────────────────────────────────┤
│ `email-queue`   │ 5                 │ - Transactional Resend/SMTP emails    │
│                 │                   │ - Exponential retry backoff on fail   │
├─────────────────┼───────────────────┼───────────────────────────────────────┤
│ `upload-queue`  │ 2                 │ - Bulk Excel/CSV batch imports        │
│                 │                   │ - Multi-thousand row migrations       │
└─────────────────┴───────────────────┴───────────────────────────────────────┘
```

### 5.1 Environment Safety for BullMQ
- In **development** (`NODE_ENV=development`) and **tests** (`NODE_ENV=test`):
  `shouldRunQueueWorkers()` returns `false`, causing `QueueService.add()` to execute jobs **inline synchronously via the fallback handler**.
- In **production** (`NODE_ENV=production`):
  Jobs are submitted to Redis with retry policies (`attempts: 3`, `backoff: exponential`).

---

## 6. Implementation Checklist & Phased Adoption

- [x] **Step 1: Quizzes Caching Adoption** *(Completed)*
  - Wrap `QuizzesService.getQuizForTaking` in `cacheService.wrap('quiz:manifest:' + id, ..., quizDuration)`.
  - Add explicit cache invalidation in `QuizzesService.update` and `QuizzesService.remove`.
- [x] **Step 2: Quiz Auto-Submission BullMQ Worker** *(Completed)*
  - Register `quiz-queue` worker in `QuizzesService` on module initialization.
  - Schedule delayed job on `startAttempt` and cancel/ignore if already submitted.
- [x] **Step 3: Attendance Session Cache & Lock** *(Completed)*
  - Replace in-memory `Map` inside `AttendanceCheckInService` with `cacheService.wrap('attendance:session:' + id, ...)`.
  - Add atomic scan lock `attendance:lock:{sessionId}:{studentId}` to reject duplicate rapid scans in 0ms.
- [x] **Step 4: Advising & Exam Schedule Caching** *(Completed)*
  - Cache prerequisite flow graph in `AdvisingPlanService.getGraph` with `saveGraph` invalidation.
  - Cache published exam schedules by academic level and semester in `ExamSchedulesService`.
- [x] **Step 5: Cache Subsystem Telemetry in Admin UI** *(Completed)*
  - Added cache metrics to `MetricsService.getSummary()` (`/api/admin/metrics`).
  - Added real-time Cache Engine status and L1 in-memory item count cards to Admin Metrics UI (`/admin/metrics`).
- [x] **Step 6: Post-Implementation Verification** *(Completed)*
  - Run `pnpm run typecheck` across all 3 monorepo packages (0 errors).
  - Run `pnpm run lint` to guarantee 0 errors (0 errors, 3/3 packages clean).
  - Run `pnpm --filter @student-portal/api test` (all 30 test suites, 149 tests passed).
  - Run `pnpm run build` to confirm production bundle integrity (Next.js & NestJS compiled cleanly).
