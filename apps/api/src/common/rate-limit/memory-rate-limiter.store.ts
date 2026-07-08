import type {
  RateLimitEntry,
  RateLimitHit,
  RateLimiterStore,
} from './rate-limit.types';

const pruneIntervalMs = 60 * 1000;

export class MemoryRateLimiterStore implements RateLimiterStore {
  private readonly buckets = new Map<string, RateLimitEntry>();
  private nextPruneAt = Date.now() + pruneIntervalMs;

  increment(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const now = Date.now();
    this.pruneExpiredBuckets(now);

    const existing = this.buckets.get(key);
    const entry =
      !existing || existing.resetAt <= now
        ? { count: 1, resetAt: now + windowMs }
        : { count: existing.count + 1, resetAt: existing.resetAt };

    this.buckets.set(key, entry);

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );

    return Promise.resolve({
      ...entry,
      remaining: Math.max(0, max - entry.count),
      retryAfterSeconds,
    });
  }

  private pruneExpiredBuckets(now: number): void {
    if (now < this.nextPruneAt && this.buckets.size < 1000) return;

    for (const [key, entry] of this.buckets.entries()) {
      if (entry.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    this.nextPruneAt = now + pruneIntervalMs;
  }
}
