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

  async increment(
    key: string,
    windowMs: number,
    max: number,
  ): Promise<RateLimitHit> {
    await this.ensureIndexes();

    const now = new Date();
    const existing = await this.collection.findOne<MongoRateLimitDocument>({
      _id: key,
    });

    const activeResetAt =
      existing?.resetAt instanceof Date ? existing.resetAt : undefined;

    if (
      !existing ||
      !activeResetAt ||
      activeResetAt.getTime() <= now.getTime()
    ) {
      const resetAt = new Date(now.getTime() + windowMs);
      await this.collection.updateOne(
        { _id: key },
        {
          $set: {
            count: 1,
            resetAt,
            expireAt: resetAt,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      );

      return this.toHit(1, resetAt, max);
    }

    const updated = await this.collection.findOneAndUpdate(
      { _id: key, resetAt: { $gt: now } },
      {
        $inc: { count: 1 },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      return this.increment(key, windowMs, max);
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
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
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
