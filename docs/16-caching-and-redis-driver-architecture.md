# 16. Caching Architecture & Redis Driver Configuration

## 1. Executive Summary

This document records the architectural implementation of the **Multi-Tier Cache Layer (`CacheService`)** in the Student Portal backend API (`apps/api`), resolving the **Redis free-tier / daily quota limitation** while enabling high-throughput caching in production.

---

## 2. The Core Problem: Preserving Redis Quota

### The Issue
Cloud Redis providers (such as Upstash Free Tier) enforce strict daily limits (e.g., 10,000 commands/day). 
In previous configurations, local development hot-reloading (`nest start --watch`) and automated testing (`jest`, `turbo run test`) risked consuming the entire daily quota in minutes by firing commands on every test suite or restart.

### The Solution: Environment-Aware Driver Configuration
The new `CacheService` dynamically gates Redis connections based on environment and explicit driver settings:

| Environment / Setting | Active Driver | Redis Command Spend | Behavior |
|---|---|---|---|
| **Test (`NODE_ENV=test`)** | **Memory** | **0 commands** | Automated tests execute 100% offline using in-memory `MemoryCacheStore`. No Redis connections are opened. |
| **Dev (`CACHE_DRIVER=memory`)** | **Memory** | **0 commands** | Local development runs without hitting cloud Redis limits. |
| **Production (`CACHE_DRIVER=hybrid` or `auto`)** | **Hybrid (L1 + L2)** | **~90% fewer commands** | L1 In-Memory buffers hot reads (15–30s TTL). Only L1 cache misses query L2 Redis. |

---

## 3. Architecture & File Structure

```
apps/api/src/core/cache/
├── cache.types.ts           # ICacheStore, CacheDriverType, CacheHealth interfaces
├── memory-cache.store.ts    # In-memory TTL Map store with auto-pruning & regex pattern invalidation
├── redis-cache.store.ts     # ioredis TLS store with SCAN cursor pattern deletion & offline tolerance
├── cache.service.ts         # Unified service managing L1/L2 resolution, wrap(), & health checks
├── cache.module.ts          # Global NestJS module exporting CacheService across all feature modules
└── cache.service.spec.ts    # Unit tests validating isolation, TTL, and zero-spend test mode
```

---

## 4. Key Capabilities

### 4.1 Automatic Cache Wrapping (`wrap`)
Services can wrap expensive read queries in a single line:
```typescript
const currentTerm = await this.cacheService.wrap(
  'term:current',
  () => this.registrationTermModel.findOne({ isCurrent: true }).lean(),
  300 // 5 minutes TTL
);
```
- First call: Executes database query and stores result in L1 (memory) and L2 (Redis).
- Second call within TTL: Serves in **0ms** from memory.

### 4.2 Pattern-Based Cache Invalidation (`delPattern`)
Administrative mutations safely evict all related cache keys using wildcard matching:
```typescript
// Evicts all student dashboard statistics and cached listings
await this.cacheService.delPattern('admin:students:*');
```

### 4.3 Resilience & Degradation Safety
If Redis encounters network timeout or connection limits, `RedisCacheStore` catches the error, logs a warning, and falls back to `MemoryCacheStore`. **User requests never fail with 500 errors.**

### 4.4 Health Endpoint Visibility
The `/api/health` endpoint now reports live cache health:
```json
{
  "status": "ok",
  "database": { "status": "connected", "pingLatencyMs": 42.1 },
  "cache": {
    "status": "healthy",
    "driver": "auto",
    "effectiveDriver": "hybrid",
    "redisConnected": true,
    "itemCount": 12
  }
}
```

---

## 5. Verification Results

All CI/CD quality gates passed cleanly:
- **Unit Tests**: `src/core/cache/cache.service.spec.ts` passed (8/8 tests, 100% pass rate).
- **Test Suite**: Monorepo tests passed across all 30 test suites (148 tests).
- **TypeScript**: Strict typecheck passed across `@student-portal/api`, `@student-portal/shared`, and `@student-portal/web`.
- **Lint**: 0 errors across all workspace packages.
- **Production Build**: Production compilation succeeded cleanly.
