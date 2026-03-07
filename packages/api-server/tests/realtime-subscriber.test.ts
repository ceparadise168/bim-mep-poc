import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockRedis, redisConstructor, redisInstances } = vi.hoisted(() => {
  const redisConstructor = vi.fn();
  const redisInstances: any[] = [];

  class MockRedis {
    on = vi.fn();
    psubscribe = vi.fn().mockResolvedValue(3);
    quit = vi.fn().mockResolvedValue('OK');

    constructor(...args: unknown[]) {
      redisConstructor(...args);
      redisInstances.push(this);
    }
  }

  return { MockRedis, redisConstructor, redisInstances };
});

vi.mock('ioredis', () => ({
  Redis: MockRedis,
}));

import { RedisRealtimeSubscriber } from '../src/realtime-subscriber.js';

describe('RedisRealtimeSubscriber', () => {
  beforeEach(() => {
    redisConstructor.mockClear();
    redisInstances.length = 0;
  });

  it('creates a subscriber connection with ready checks disabled', async () => {
    const subscriber = new RedisRealtimeSubscriber('redis://redis:6379');

    expect(redisConstructor).toHaveBeenCalledWith(
      'redis://redis:6379',
      expect.objectContaining({ enableReadyCheck: false }),
    );

    await subscriber.start(() => {});

    expect(redisInstances[0]?.psubscribe).toHaveBeenCalledWith('signals:*', 'anomalies', 'dashboard');
  });
});
