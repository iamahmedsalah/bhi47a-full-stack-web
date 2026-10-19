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

export interface RedisQuotaInfo {
  mode: 'preserved' | 'active' | 'offline';
  dailyLimit: number;
  commandsToday: number;
  quotaUsedPercent: number;
  policy: 'zero_quota_local_dev' | 'full_production_redis';
  statusText: string;
  details: string;
}

export interface CacheHealth {
  status: 'healthy' | 'degraded' | 'offline';
  driver: CacheDriverType;
  effectiveDriver: 'memory' | 'redis' | 'hybrid';
  redisConnected: boolean;
  itemCount?: number;
  quota?: RedisQuotaInfo;
}
