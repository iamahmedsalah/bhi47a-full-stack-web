import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Job,
  JobsOptions,
  Processor,
  Queue,
  QueueOptions,
  Worker,
} from 'bullmq';

type QueueConnection = NonNullable<QueueOptions['connection']>;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection?: QueueConnection;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor() {
    this.connection = this.buildRedisConnection();
  }

  get enabled(): boolean {
    return Boolean(this.connection);
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
    this.queues.set(queueName, queue);
    return queue;
  }

  private buildRedisConnection(): QueueConnection | undefined {
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
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  }
}
