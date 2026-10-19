import { Injectable } from '@nestjs/common';
import type { ICacheStore } from './cache.types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class MemoryCacheStore implements ICacheStore {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private static readonly MAX_ENTRIES = 5000;

  get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    if (this.store.size >= MemoryCacheStore.MAX_ENTRIES) {
      this.pruneExpired();
      if (this.store.size >= MemoryCacheStore.MAX_ENTRIES) {
        // Evict oldest 10%
        const keysToRemove = Array.from(this.store.keys()).slice(
          0,
          Math.floor(MemoryCacheStore.MAX_ENTRIES * 0.1),
        );
        for (const k of keysToRemove) this.store.delete(k);
      }
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  delPattern(pattern: string): Promise<void> {
    const regex = this.patternToRegex(pattern);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  isConnected(): boolean {
    return true;
  }

  size(): number {
    return this.store.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  }
}
