import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';

export const CHAOS_CHANNEL = 'commands:chaos';

export interface ChaosCommand {
  scenario: string;
  devices: string[];
}

export interface ChaosCommandSubscriber {
  start(handler: (command: ChaosCommand) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export class NullChaosCommandSubscriber implements ChaosCommandSubscriber {
  async start(): Promise<void> {}
  async close(): Promise<void> {}
}

export class RedisChaosCommandSubscriber implements ChaosCommandSubscriber {
  private readonly redis: RedisClient;
  private readonly owned: boolean;

  constructor(redisOrUrl: RedisClient | string) {
    if (typeof redisOrUrl === 'string') {
      this.redis = new IORedis(redisOrUrl, { enableReadyCheck: false });
    } else {
      this.redis = redisOrUrl.duplicate({ enableReadyCheck: false });
    }
    this.owned = true;
  }

  async start(handler: (command: ChaosCommand) => Promise<void>): Promise<void> {
    this.redis.on('message', async (_channel: string, message: string) => {
      const parsed = JSON.parse(message) as ChaosCommand;
      await handler(parsed);
    });

    await this.redis.subscribe(CHAOS_CHANNEL);
  }

  async close(): Promise<void> {
    if (this.owned) {
      await this.redis.quit();
    }
  }
}
