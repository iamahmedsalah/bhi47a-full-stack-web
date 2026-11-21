import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Processor, Queue, Worker } from 'bullmq';
import type { Redis, RedisOptions } from 'ioredis';
import { shouldRunQueueWorkers } from '../../common/utils/runtime.util';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection?: RedisOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor() {
    this.connection = this.buildRedisConnection();
  }

  get enabled(): boolean {
    return Boolean(this.connection);
  }

  async checkConnection(): Promise<{ ready: boolean; message: string }> {
    if (!this.connection) {
      const isDev = process.env.NODE_ENV !== 'production';
      return {
        ready: false,
        message: isDev
          ? 'Inline fallback (Development: Redis quota preserved)'
          : 'Disabled (Jobs run inline fallback)',
      };
    }

    let client: Redis | undefined;
    try {
      const { Redis } = await import('ioredis');
      client = new Redis({
        ...this.connection,
        connectTimeout: 2000,
        commandTimeout: 2000,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
      });
      client.on('error', () => {}); // silence unhandled error events during connection probe

      await client.connect();
      const pong = await client.ping();
      return { ready: true, message: `Connected (Response: ${pong})` };
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      return {
        ready: false,
        message: `Offline (${err?.code || err?.message || 'Connection refused'}) - Running inline`,
      };
    } finally {
      client?.disconnect();
    }
  }

  async add<T>(
    queueName: string,
    jobName: string,
    data: T,
    fallback?: (data: T) => Promise<unknown>,
    options?: JobsOptions,
  ) {
    if (!this.connection) {
      const result = fallback ? await fallback(data) : undefined;
      return { queued: false, processedInline: true, result };
    }

    try {
      const queue = this.getQueue(queueName);
      const job = await queue.add(jobName, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 500,
        ...options,
      });

      return { queued: true, jobId: job.id };
    } catch (error) {
      console.error(`Failed to enqueue ${queueName}/${jobName}:`, error);
      const result = fallback ? await fallback(data) : undefined;
      return { queued: false, processedInline: true, result };
    }
  }

  registerWorker<T>(
    queueName: string,
    processor: (job: Job<T>) => Promise<unknown>,
  ): boolean {
    if (!this.connection) {
      return false;
    }

    const worker = new Worker(queueName, processor as Processor, {
      connection: this.connection,
      concurrency: 5,
    });

    worker.on('error', (error) => {
      console.warn(
        `[QueueService] Worker error for queue ${queueName}:`,
        error.message || error,
      );
    });

    worker.on('failed', (job, error) => {
      console.error(
        `Queue job failed: ${queueName}/${job?.name || 'unknown'} (${job?.id || 'no-id'})`,
        error,
      );
    });

    this.workers.push(worker);
    return true;
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private getQueue(queueName: string): Queue {
    const existing = this.queues.get(queueName);
    if (existing) {
      return existing;
    }

    if (!this.connection) {
      throw new Error('Queue connection is not configured');
    }

    const queue = new Queue(queueName, { connection: this.connection });
    queue.on('error', (error) => {
      console.warn(
        `[QueueService] Queue error for ${queueName}:`,
        error.message || error,
      );
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  private buildRedisConnection(): RedisOptions | undefined {
    // In test and local development, run inline fallback to preserve Redis quota
    // and prevent cloud network/DNS errors from degrading local development.
    const nodeEnv = process.env.NODE_ENV;
    const forceQueue =
      process.env.QUEUE_WORKERS_ENABLED === 'true' ||
      process.env.QUEUE_REQUIRED === 'true';

    if (nodeEnv !== 'production' && !forceQueue) {
      return undefined;
    }

    // A Vercel Function is not an always-on worker process. Without this guard,
    // every warm function instance can register another BullMQ consumer and jobs
    // may stop when that instance is suspended. Run the fallback in-request on
    // serverless; use a separate always-on worker for durable background jobs.
    if (!shouldRunQueueWorkers()) {
      return undefined;
    }

    const redisUrl =
      process.env.REDIS_URL ||
      process.env.UPSTASH_REDIS_URL ||
      process.env.BULLMQ_REDIS_URL;

    if (!redisUrl) {
      if (process.env.QUEUE_REQUIRED === 'true') {
        throw new Error(
          'Redis queue connection is required but REDIS_URL is not set',
        );
      }
      return undefined;
    }

    let parsed: URL;
    try {
      parsed = new URL(redisUrl);
    } catch {
      if (process.env.QUEUE_REQUIRED === 'true') {
        throw new Error('Redis URL is invalid');
      }
      console.warn('Invalid Redis URL. Queue jobs will run inline.');
      return undefined;
    }

    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      if (process.env.QUEUE_REQUIRED === 'true') {
        throw new Error('Redis URL must use redis:// or rediss://');
      }
      console.warn(
        'Redis URL must use redis:// or rediss://. Queue jobs will run inline.',
      );
      return undefined;
    }

    const db = parsed.pathname ? Number(parsed.pathname.slice(1)) : undefined;

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: Number.isNaN(db) ? undefined : db,
      tls:
        parsed.protocol === 'rediss:' || parsed.hostname.includes('upstash.io')
          ? {}
          : undefined,
    };
  }
}
