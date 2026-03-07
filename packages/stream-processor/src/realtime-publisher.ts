import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';
import type { ParsedSignal } from './stream-consumer.js';

export interface RealtimePublisher {
  publishSignal(signal: ParsedSignal): Promise<void>;
  publishAnomaly(event: Record<string, unknown>): Promise<void>;
  publishDashboardUpdate(update: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

export class NullRealtimePublisher implements RealtimePublisher {
  async publishSignal(): Promise<void> {}
  async publishAnomaly(): Promise<void> {}
  async publishDashboardUpdate(): Promise<void> {}
  async close(): Promise<void> {}
}

export class RedisRealtimePublisher implements RealtimePublisher {
  private readonly redis: RedisClient;
  private readonly owned: boolean;

  constructor(redisOrUrl: RedisClient | string) {
    if (typeof redisOrUrl === 'string') {
      this.redis = new IORedis(redisOrUrl);
      this.owned = true;
    } else {
      this.redis = redisOrUrl.duplicate();
      this.owned = true;
    }
  }

  async publishSignal(signal: ParsedSignal): Promise<void> {
    const payload = JSON.stringify(signal);
    await this.redis.publish(`signals:${signal.deviceId}`, payload);

    const floor = signal.metadata?.floor;
    if (typeof floor === 'number') {
      await this.redis.publish(`signals:floor:${floor}`, payload);
    }
  }

  async publishAnomaly(event: Record<string, unknown>): Promise<void> {
    await this.redis.publish('anomalies', JSON.stringify(event));
  }

  async publishDashboardUpdate(update: Record<string, unknown>): Promise<void> {
    await this.redis.publish('dashboard', JSON.stringify(update));
  }

  async close(): Promise<void> {
    if (this.owned) {
      await this.redis.quit();
    }
  }
}
