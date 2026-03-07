import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';

export const STREAM_KEY = 'signals:raw';
export const DLQ_KEY = 'signals:dlq';

export interface RedisPublisherOptions {
  redis?: RedisClient;
  maxStreamLen?: number;
  backPressureThreshold?: number;
}

export class RedisPublisher {
  private redis: RedisClient;
  private maxStreamLen: number;
  private backPressureThreshold: number;
  private backPressureActive = false;
  private publishedCount = 0;
  private dlqCount = 0;

  constructor(options: RedisPublisherOptions = {}) {
    this.redis = options.redis ?? new IORedis({ maxRetriesPerRequest: 3 });
    this.maxStreamLen = options.maxStreamLen ?? 100000;
    this.backPressureThreshold = options.backPressureThreshold ?? 50000;
  }

  async publish(signal: Record<string, unknown>): Promise<void> {
    if (this.backPressureActive) {
      await this.checkBackPressure();
      if (this.backPressureActive) {
        throw new Error('Back-pressure active: downstream cannot keep up');
      }
    }

    await this.redis.xadd(
      STREAM_KEY,
      'MAXLEN', '~', String(this.maxStreamLen),
      '*',
      'data', JSON.stringify(signal),
    );
    this.publishedCount++;

    // Periodically check back-pressure
    if (this.publishedCount % 100 === 0) {
      await this.checkBackPressure();
    }
  }

  async publishBatch(signals: Record<string, unknown>[]): Promise<{ published: number; backPressured: number }> {
    let published = 0;
    let backPressured = 0;

    const pipeline = this.redis.pipeline();
    for (const signal of signals) {
      pipeline.xadd(
        STREAM_KEY,
        'MAXLEN', '~', String(this.maxStreamLen),
        '*',
        'data', JSON.stringify(signal),
      );
    }

    try {
      await pipeline.exec();
      published = signals.length;
      this.publishedCount += published;
    } catch {
      backPressured = signals.length;
    }

    return { published, backPressured };
  }

  async publishDLQ(signal: unknown, errors: string[]): Promise<void> {
    await this.redis.xadd(
      DLQ_KEY,
      'MAXLEN', '~', '10000',
      '*',
      'data', JSON.stringify(signal),
      'errors', JSON.stringify(errors),
      'timestamp', String(Date.now()),
    );
    this.dlqCount++;
  }

  async getDLQEntries(count: number = 100): Promise<Array<{ id: string; data: unknown; errors: string[] }>> {
    const entries = await this.redis.xrange(DLQ_KEY, '-', '+', 'COUNT', count) as Array<[string, string[]]>;
    return entries.map(([id, fields]) => {
      const fieldMap = new Map<string, string>();
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap.set(fields[i], fields[i + 1]);
      }
      return {
        id,
        data: JSON.parse(fieldMap.get('data') || '{}'),
        errors: JSON.parse(fieldMap.get('errors') || '[]'),
      };
    });
  }

  private async checkBackPressure(): Promise<void> {
    const len = await this.redis.xlen(STREAM_KEY);
    this.backPressureActive = len > this.backPressureThreshold;
  }

  isBackPressured(): boolean {
    return this.backPressureActive;
  }

  getStats() {
    return {
      published: this.publishedCount,
      dlq: this.dlqCount,
      backPressureActive: this.backPressureActive,
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
