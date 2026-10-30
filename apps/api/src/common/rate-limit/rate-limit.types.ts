import type { Request } from 'express';

export type RateLimitRule = {
  name: string;
  methods: string[];
  pattern: RegExp;
  windowMs: number;
  max: number;
  message: string;
  scope?: 'authenticated';
  keyGenerator?: (req: Request) => string | undefined;
};

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitHit = RateLimitEntry & {
  remaining: number;
  retryAfterSeconds: number;
};

export interface RateLimiterStore {
  increment(key: string, windowMs: number, max: number): Promise<RateLimitHit>;
}
