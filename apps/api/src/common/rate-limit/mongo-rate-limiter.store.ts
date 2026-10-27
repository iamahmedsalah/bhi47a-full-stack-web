import type { Connection } from 'mongoose';
import { ConnectionHolder } from './connection-holder';
import type { RateLimitHit, RateLimiterStore } from './rate-limit.types';

type MongoRateLimitDocument = {
  _id: string;
  count: number;
  resetAt: Date;
  expireAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export class MongoRateLimiterStore implements RateLimiterStore {
  private readonly collectionName = 'rate_limits';
  private indexReady?: Promise<void>;

  constructor(private readonly injectedConnection?: Connection) {}

  async initialize(): Promise<void> {
    await this.ensureIndexes();
  }

  async increment(
    key: string,
    windowMs: number,
    max: number,
  ): Promise<RateLimitHit> {
    await this.ensureIndexes();

    const now = new Date();
    // Reset and increment in one document operation across all API replicas.
    const reset = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, now] };
    const nextReset = new Date(now.getTime() + windowMs);
    const updated = await this.collection.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: {
              $cond: [reset, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }],
            },
            resetAt: { $cond: [reset, nextReset, '$resetAt'] },
            expireAt: { $cond: [reset, nextReset, '$expireAt'] },
            createdAt: { $ifNull: ['$createdAt', now] },
            updatedAt: now,
          },
        },
      ],
      { returnDocument: 'after', upsert: true },
    );

    if (!updated) {
      throw new Error('Shared rate counter unavailable');
    }

    const document = updated as MongoRateLimitDocument;
    return this.toHit(document.count, document.resetAt, max);
  }

  private get collection() {
    const db = this.injectedConnection?.db || ConnectionHolder.connection?.db;
    if (!db) {
      throw new Error('MongoDB connection is not ready for rate limiting.');
    }

    return db.collection<MongoRateLimitDocument>(this.collectionName);
  }

  private async ensureIndexes(): Promise<void> {
    this.indexReady ??= this.collection
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, maxTimeMS: 5000 })
      .then(() => undefined);

    await this.indexReady;
  }

  private toHit(count: number, resetAt: Date, max: number): RateLimitHit {
    const resetAtMs = resetAt.getTime();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAtMs - Date.now()) / 1000),
    );

    return {
      count,
      resetAt: resetAtMs,
      remaining: Math.max(0, max - count),
      retryAfterSeconds,
    };
  }
}
