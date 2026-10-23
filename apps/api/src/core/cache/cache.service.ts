import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CacheDriverType,
  CacheHealth,
  ICacheStore,
  RedisTelemetry,
} from './cache.types';
import { MemoryCacheStore } from './memory-cache.store';
import { RedisCacheStore } from './redis-cache.store';

export function classifyRedisEndpoint(
  redisUrl?: string,
): RedisTelemetry['provider'] {
  try {
    const host = new URL(redisUrl ?? '').hostname.toLowerCase();
    if (host === 'upstash.io' || host.endsWith('.upstash.io')) return 'upstash';
    if (['redis', 'localhost', '127.0.0.1', '[::1]'].includes(host))
      return 'self-hosted';
    return 'external';
  } catch {
    return 'unknown';
  }
}

@Injectable()
export class CacheService implements ICacheStore, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly l1Store: MemoryCacheStore;
  private readonly l2Store?: RedisCacheStore;
  private readonly configuredDriver: CacheDriverType;
  private readonly effectiveDriver: 'memory' | 'redis' | 'hybrid';
  private readonly redisUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.l1Store = new MemoryCacheStore();

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const driverSetting = this.configService
      .get<string>('CACHE_DRIVER', 'auto')
      .toLowerCase() as CacheDriverType;
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      this.configService.get<string>('UPSTASH_REDIS_URL');
    this.redisUrl = redisUrl;

    this.configuredDriver = driverSetting;

    const isProduction = nodeEnv === 'production';

    // Never burn Redis quota in test environments
    if (nodeEnv === 'test') {
      this.effectiveDriver = 'memory';
      this.logger.log(
        '[CacheService] Test environment detected: using Memory store (Redis quota preserved)',
      );
      return;
    }

    // In local development, unless CACHE_DRIVER is explicitly forced to 'redis' or 'hybrid',
    // always stay in-memory so local coding/hot-reloads never consume cloud Redis quota.
    if (
      driverSetting === 'memory' ||
      (driverSetting === 'auto' && !isProduction)
    ) {
      this.effectiveDriver = 'memory';
      this.logger.log(
        `[CacheService] ${!isProduction ? 'Local development' : 'Memory driver'} active: using in-memory store (Redis quota preserved)`,
      );
      return;
    }

    if (
      redisUrl &&
      (driverSetting === 'redis' ||
        driverSetting === 'hybrid' ||
        driverSetting === 'auto')
    ) {
      try {
        this.l2Store = new RedisCacheStore(redisUrl);
        this.effectiveDriver = driverSetting === 'redis' ? 'redis' : 'hybrid';
        this.logger.log(
          `[CacheService] Production mode active: initialized with ${this.effectiveDriver.toUpperCase()} store (Redis connected)`,
        );
      } catch (err: any) {
        this.effectiveDriver = 'memory';
        this.logger.warn(
          `[CacheService] Redis init failed: ${err.message}. Falling back to Memory store`,
        );
      }
    } else {
      this.effectiveDriver = 'memory';
      this.logger.log(
        '[CacheService] No REDIS_URL configured: using in-memory store',
      );
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // 1. Check L1 memory cache first
    const l1Value = await this.l1Store.get<T>(key);
    if (l1Value !== null && l1Value !== undefined) {
      return l1Value;
    }

    // 2. If memory-only driver, miss here
    if (this.effectiveDriver === 'memory' || !this.l2Store) {
      return null;
    }

    // 3. Check L2 Redis cache
    const l2Value = await this.l2Store.get<T>(key);
    if (l2Value !== null && l2Value !== undefined) {
      // Backfill L1 memory cache with short TTL (max 30s) to absorb bursts
      await this.l1Store.set(key, l2Value, 30);
      return l2Value;
    }

    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    // Write to L1 memory
    const l1Ttl =
      this.effectiveDriver === 'hybrid' ? Math.min(ttlSeconds, 30) : ttlSeconds;
    await this.l1Store.set(key, value, l1Ttl);

    // Write to L2 Redis if available
    if (this.l2Store && this.effectiveDriver !== 'memory') {
      await this.l2Store.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    await this.l1Store.del(key);
    if (this.l2Store) {
      await this.l2Store.del(key);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    await this.l1Store.delPattern(pattern);
    if (this.l2Store) {
      await this.l2Store.delPattern(pattern);
    }
  }

  async clear(): Promise<void> {
    await this.l1Store.clear();
    if (this.l2Store) {
      await this.l2Store.clear();
    }
  }

  /**
   * Helper pattern: return cached value if present, otherwise compute, cache, and return.
   */
  async wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 60,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await factory();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  getHealth(): CacheHealth {
    const redisConnected = this.l2Store?.isConnected() ?? false;
    const status =
      this.effectiveDriver === 'memory'
        ? 'healthy'
        : redisConnected
          ? 'healthy'
          : 'degraded';

    const redis: RedisTelemetry = {
      provider: this.getRedisProvider(),
      cacheCommandAttemptsSinceStart: this.l2Store?.getCommandCount() ?? 0,
      quotaAvailable: false,
    };
    return {
      status,
      driver: this.configuredDriver,
      effectiveDriver: this.effectiveDriver,
      redisConnected,
      itemCount: this.l1Store.size(),
      redis,
    };
  }

  private getRedisProvider(): RedisTelemetry['provider'] {
    if (!this.l2Store || this.effectiveDriver === 'memory') return 'none';
    return classifyRedisEndpoint(this.redisUrl);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.l2Store) {
      await this.l2Store.disconnect();
    }
    await this.l1Store.clear();
  }
}
