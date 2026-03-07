import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GatewayServer } from '../src/gateway-server.js';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { STREAM_KEY, DLQ_KEY } from '../src/redis-publisher.js';

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signalId: uuidv4(),
    deviceId: 'AHU-03F-001',
    timestamp: Date.now(),
    protocol: 'bacnet-ip',
    payload: { temperature: 22.5 },
    quality: 'good',
    ...overrides,
  };
}

let gateway: GatewayServer;
let redis: Redis; // Separate connection for test assertions
let baseUrl: string;

beforeAll(async () => {
  redis = new Redis({ db: 15 }); // Separate connection for test queries
  await redis.flushdb();
  // Gateway gets its own Redis connection (same DB)
  const gatewayRedis = new Redis({ db: 15 });
  gateway = new GatewayServer({ port: 0, redis: gatewayRedis });
  const address = await gateway.start();
  const port = gateway.getApp().server.address();
  if (typeof port === 'object' && port) {
    baseUrl = `http://127.0.0.1:${port.port}`;
  } else {
    baseUrl = address.replace('[::]', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');
  }
});

afterAll(async () => {
  await gateway.stop();
  await redis.flushdb();
  await redis.quit();
});

beforeEach(async () => {
  await redis.del(STREAM_KEY, DLQ_KEY);
});

describe('GatewayServer HTTP', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should accept valid batch of signals', async () => {
    const signals = [makeSignal(), makeSignal({ deviceId: 'VFD-05F-002' })];
    const res = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signals),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { accepted: number; rejected: number };
    expect(data.accepted).toBe(2);
    expect(data.rejected).toBe(0);

    // Verify signals in Redis
    const streamLen = await redis.xlen(STREAM_KEY);
    expect(streamLen).toBe(2);
  });

  it('should reject invalid signals to DLQ', async () => {
    const signals = [
      makeSignal(),
      { bad: 'data' }, // invalid
      makeSignal({ protocol: 'invalid' }), // invalid
    ];
    const res = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signals),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { accepted: number; rejected: number };
    expect(data.accepted).toBe(1);
    expect(data.rejected).toBe(2);

    // Verify DLQ
    const dlqLen = await redis.xlen(DLQ_KEY);
    expect(dlqLen).toBe(2);
  });

  it('should accept single valid signal', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ingest/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeSignal()),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { accepted: boolean };
    expect(data.accepted).toBe(true);
  });

  it('should reject invalid single signal with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ingest/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bad: 'data' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('Validation failed');
  });

  it('should query DLQ entries', async () => {
    // Push some invalid signals first
    await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ invalid: true }]),
    });

    const res = await fetch(`${baseUrl}/api/v1/dlq`);
    expect(res.status).toBe(200);
    const data = await res.json() as { count: number; entries: unknown[] };
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  it('should return stats', async () => {
    const res = await fetch(`${baseUrl}/api/v1/stats`);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty('httpReceived');
    expect(data).toHaveProperty('publisher');
  });

  it('should handle high throughput batch', async () => {
    const batchSize = 500;
    const signals = Array.from({ length: batchSize }, () => makeSignal());
    const res = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signals),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { accepted: number };
    expect(data.accepted).toBe(batchSize);
  });
});
