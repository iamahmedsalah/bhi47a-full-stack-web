import { Logger } from '@nestjs/common';
import type { ICacheStore } from './cache.types';

export class RedisCacheStore implements ICacheStore {
  private readonly logger = new Logger(RedisCacheStore.name);
  private client: any = null;
  private isReady = false;
  private commandCount = 0;

  constructor(private readonly redisUrl: string) {
    void this.initClient();
  }

  private async initClient(): Promise<void> {
    try {
      const { default: IORedis } = await import('ioredis');

      const isTls = this.redisUrl.startsWith('rediss://');

      this.client = new (IORedis as any)(this.redisUrl, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(
              '[RedisCacheStore] Retries exhausted. Operating in degraded mode.',
            );
            return null; // Stop retrying
          }
          return Math.min(times * 500, 2000);
        },
        tls: isTls ? { rejectUnauthorized: false } : undefined,
      });

      this.client.on('connect', () => {
        this.isReady = true;
        this.logger.log('[RedisCacheStore] Connected to Redis successfully');
      });

      this.client.on('error', (err: any) => {
        this.isReady = false;
        this.logger.warn(`[RedisCacheStore] Redis error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isReady = false;
      });
    } catch (err: any) {
      this.isReady = false;
      this.logger.error(
        `[RedisCacheStore] Failed to initialize ioredis: ${err.message}`,
      );
    }
  }

  isConnected(): boolean {
    return this.isReady && Boolean(this.client);
  }

  getCommandCount(): number {
    return this.commandCount;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected()) return null;
    this.commandCount++;

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err: any) {
      this.logger.warn(
        `[RedisCacheStore] Get failed for ${key}: ${err.message}`,
      );
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    if (!this.isConnected()) return;
    this.commandCount++;

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (err: any) {
      this.logger.warn(
        `[RedisCacheStore] Set failed for ${key}: ${err.message}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected()) return;
    this.commandCount++;

    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.warn(
        `[RedisCacheStore] Del failed for ${key}: ${err.message}`,
      );
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected()) return;
    this.commandCount++;

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys && keys.length > 0) {
          this.commandCount++;
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err: any) {
      this.logger.warn(
        `[RedisCacheStore] DelPattern failed for ${pattern}: ${err.message}`,
      );
    }
  }

  async clear(): Promise<void> {
    if (!this.isConnected()) return;
    this.commandCount++;

    try {
      await this.client.flushdb();
    } catch (err: any) {
      this.logger.warn(`[RedisCacheStore] Clear failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.isReady = false;
      this.client = null;
    }
  }
}
