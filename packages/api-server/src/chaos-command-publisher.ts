import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';

export interface ChaosCommand {
  scenario: string;
  devices: string[];
}

export interface ChaosCommandPublisher {
  publish(command: ChaosCommand): Promise<void>;
  close(): Promise<void>;
}

export class NullChaosCommandPublisher implements ChaosCommandPublisher {
  async publish(): Promise<void> {}
  async close(): Promise<void> {}
}

export class RedisChaosCommandPublisher implements ChaosCommandPublisher {
  private readonly redis: RedisClient;

  constructor(redisUrl: string) {
    this.redis = new IORedis(redisUrl);
  }

  async publish(command: ChaosCommand): Promise<void> {
    await this.redis.publish('commands:chaos', JSON.stringify(command));
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
