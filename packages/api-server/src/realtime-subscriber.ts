import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';

export interface RealtimeMessage {
  channel: string;
  data: unknown;
}

export interface RealtimeSubscriber {
  start(handler: (message: RealtimeMessage) => void): Promise<void>;
  close(): Promise<void>;
}

export class NullRealtimeSubscriber implements RealtimeSubscriber {
  async start(): Promise<void> {}
  async close(): Promise<void> {}
}

export class RedisRealtimeSubscriber implements RealtimeSubscriber {
  private readonly redis: RedisClient;

  constructor(redisUrl: string) {
    this.redis = new IORedis(redisUrl, { enableReadyCheck: false });
  }

  async start(handler: (message: RealtimeMessage) => void): Promise<void> {
    this.redis.on('pmessage', (_pattern: string, channel: string, message: string) => {
      handler({
        channel,
        data: JSON.parse(message),
      });
    });

    await this.redis.psubscribe('signals:*', 'anomalies', 'dashboard');
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
