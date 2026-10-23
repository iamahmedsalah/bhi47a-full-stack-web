import { ConfigService } from '@nestjs/config';
import { CacheService, classifyRedisEndpoint } from './cache.service';
import { MemoryCacheStore } from './memory-cache.store';

describe('Cache Layer Unit Tests', () => {
  it.each([
    ['redis://:password@redis:6379', 'self-hosted'],
    ['redis://127.0.0.1:6379', 'self-hosted'],
    ['rediss://default:password@example.upstash.io:6379', 'upstash'],
    ['redis://upstash.io.example.com:6379', 'external'],
    ['redis://cache.example.com:6379', 'external'],
    ['', 'unknown'],
  ])(
    'identifies the Redis endpoint without assuming a quota: %s',
    (url, provider) => {
      expect(classifyRedisEndpoint(url)).toBe(provider);
    },
  );
  describe('MemoryCacheStore', () => {
    let store: MemoryCacheStore;

    beforeEach(() => {
      store = new MemoryCacheStore();
    });

    it('sets and gets cached values', async () => {
      await store.set('test:key', { message: 'hello' }, 60);
      const val = await store.get<{ message: string }>('test:key');
      expect(val).toEqual({ message: 'hello' });
    });

    it('returns null on cache miss', async () => {
      const val = await store.get('nonexistent');
      expect(val).toBeNull();
    });

    it('deletes specific keys', async () => {
      await store.set('to-delete', 'value', 60);
      await store.del('to-delete');
      expect(await store.get('to-delete')).toBeNull();
    });

    it('deletes keys matching wildcard patterns', async () => {
      await store.set('admin:students:stats', { count: 10 }, 60);
      await store.delPattern('admin:students:*');
      expect(await store.get('admin:students:stats')).toBeNull();
    });

    it('expires values after TTL', async () => {
      await store.set('quick-expire', 'data', -1); // already expired
      const val = await store.get('quick-expire');
      expect(val).toBeNull();
    });
  });

  describe('CacheService', () => {
    let cacheService: CacheService;
    let mockConfigService: any;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'NODE_ENV') return 'test';
          if (key === 'CACHE_DRIVER') return 'auto';
          if (key === 'REDIS_URL')
            return 'rediss://default:fake@upstash.io:6379';
          return defaultValue;
        }),
      };

      cacheService = new CacheService(mockConfigService as ConfigService);
    });

    afterEach(async () => {
      await cacheService.onModuleDestroy();
    });

    it('forces memory store in test environment to preserve Redis quota', () => {
      const health = cacheService.getHealth();
      expect(health.effectiveDriver).toBe('memory');
      expect(health.status).toBe('healthy');
      expect(health.redis).toEqual({
        provider: 'none',
        cacheCommandAttemptsSinceStart: 0,
        quotaAvailable: false,
      });
      expect(health).not.toHaveProperty('quota');
    });

    it('defaults to memory store in local development to preserve Redis quota', () => {
      const devConfig: any = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'CACHE_DRIVER') return 'auto';
          if (key === 'REDIS_URL')
            return 'rediss://default:fake@upstash.io:6379';
          return defaultValue;
        }),
      };
      const devService = new CacheService(devConfig as ConfigService);
      const health = devService.getHealth();
      expect(health.effectiveDriver).toBe('memory');
      expect(health.status).toBe('healthy');
    });

    it('wrap caches factory result and returns cached value on next call', async () => {
      const factory = jest
        .fn()
        .mockResolvedValue({ id: 'term-1', isCurrent: true });

      const firstCall = await cacheService.wrap('term:current', factory, 60);
      const secondCall = await cacheService.wrap('term:current', factory, 60);

      expect(firstCall).toEqual({ id: 'term-1', isCurrent: true });
      expect(secondCall).toEqual({ id: 'term-1', isCurrent: true });
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('invalidates wrapped keys on delPattern', async () => {
      let counter = 0;
      const factory = jest.fn().mockImplementation(() => {
        counter += 1;
        return Promise.resolve({ count: counter });
      });

      await cacheService.wrap('admin:stats:1', factory, 60);
      expect(counter).toBe(1);

      await cacheService.delPattern('admin:stats:*');

      await cacheService.wrap('admin:stats:1', factory, 60);
      expect(counter).toBe(2);
    });
  });
});
