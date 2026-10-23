export type CacheDriverType = 'memory' | 'redis' | 'hybrid' | 'auto';

export interface ICacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
  clear(): Promise<void>;
  isConnected?(): boolean;
  size?(): number;
  getCommandCount?(): number;
}

export interface RedisTelemetry {
  provider: 'self-hosted' | 'upstash' | 'external' | 'none' | 'unknown';
  cacheCommandAttemptsSinceStart: number;
  // This process cannot observe a provider's account-wide usage or plan limits.
  quotaAvailable: false;
}

export interface CacheHealth {
  status: 'healthy' | 'degraded' | 'offline';
  driver: CacheDriverType;
  effectiveDriver: 'memory' | 'redis' | 'hybrid';
  redisConnected: boolean;
  itemCount?: number;
  redis: RedisTelemetry;
}
