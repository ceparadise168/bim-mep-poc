import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { StreamConsumer, STREAM_KEY, CONSUMER_GROUP } from '../src/stream-consumer.js';
import { v4 as uuidv4 } from 'uuid';

let redis: Redis;
let publishRedis: Redis;

beforeAll(async () => {
  redis = new Redis({ db: 14, maxRetriesPerRequest: null });
  publishRedis = new Redis({ db: 14 });
  await redis.flushdb();
});

afterAll(async () => {
  await redis.flushdb();
  await redis.quit();
  await publishRedis.quit();
});

beforeEach(async () => {
  // Clean up stream and groups
  await redis.del(STREAM_KEY);
  try {
    await redis.xgroup('DESTROY', STREAM_KEY, CONSUMER_GROUP);
  } catch { /* ignore */ }
});

function makeSignalData() {
  return JSON.stringify({
    signalId: uuidv4(),
    deviceId: 'AHU-03F-001',
    timestamp: Date.now(),
    protocol: 'bacnet-ip',
    payload: { temperature: 22.5, humidity: 55 },
    quality: 'good',
  });
}

describe('StreamConsumer', () => {
  it('should create consumer group', async () => {
    const consumer = new StreamConsumer({ redis, consumerName: 'test-1' });
    await consumer.ensureGroup();

    const groups = await redis.xinfo('GROUPS', STREAM_KEY) as unknown[];
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle duplicate group creation gracefully', async () => {
    const consumer = new StreamConsumer({ redis, consumerName: 'test-2' });
    await consumer.ensureGroup();
    await consumer.ensureGroup(); // Should not throw
  });

  it('should consume messages from stream', async () => {
    const consumer = new StreamConsumer({
      redis,
      consumerName: 'test-3',
      batchSize: 10,
      blockMs: 500,
    });

    // Publish some messages
    for (let i = 0; i < 5; i++) {
      await publishRedis.xadd(STREAM_KEY, '*', 'data', makeSignalData());
    }

    const received: unknown[] = [];
    const startPromise = consumer.start(async (signals) => {
      received.push(...signals);
      if (received.length >= 5) {
        consumer.stop();
      }
    });

    // Wait for consumption with timeout
    await Promise.race([
      startPromise,
      new Promise(r => setTimeout(r, 5000)),
    ]);

    consumer.stop();
    expect(received.length).toBe(5);
    expect(consumer.getProcessedCount()).toBe(5);
  });

  it('should ACK processed messages', async () => {
    const consumer = new StreamConsumer({
      redis,
      consumerName: 'test-4',
      batchSize: 10,
      blockMs: 500,
    });

    // Publish 3 messages
    for (let i = 0; i < 3; i++) {
      await publishRedis.xadd(STREAM_KEY, '*', 'data', makeSignalData());
    }

    const startPromise = consumer.start(async () => {
      consumer.stop();
    });

    await Promise.race([
      startPromise,
      new Promise(r => setTimeout(r, 3000)),
    ]);

    consumer.stop();

    // Check no pending messages
    const pending = await redis.xpending(STREAM_KEY, CONSUMER_GROUP) as [number, ...unknown[]];
    expect(pending[0]).toBe(0); // 0 pending
  });
});
