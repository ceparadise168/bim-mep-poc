import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GatewayServer } from '../src/gateway-server.js';
import { v4 as uuidv4 } from 'uuid';
import { STREAM_KEY, DLQ_KEY } from '../src/redis-publisher.js';

class FakeRedis {
  private streams = new Map<string, Array<[string, string[]]>>();
  private nextId = 1;

  async flushdb(): Promise<void> {
    this.streams.clear();
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.streams.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  async xlen(stream: string): Promise<number> {
    return this.streams.get(stream)?.length ?? 0;
  }

  async xrange(stream: string, _start: string, _end: string, ...args: Array<string | number>): Promise<Array<[string, string[]]>> {
    const entries = this.streams.get(stream) ?? [];
    const countIndex = args.findIndex((arg) => arg === 'COUNT');
    if (countIndex >= 0) {
      const count = Number(args[countIndex + 1]);
      return entries.slice(0, count);
    }
    return entries;
  }

  async xadd(stream: string, ...args: string[]): Promise<string> {
    const entryId = `${this.nextId++}-0`;
    const markerIndex = args.indexOf('*');
    const fieldStart = markerIndex >= 0 ? markerIndex + 1 : 0;
    const fields = args.slice(fieldStart);
    const entries = this.streams.get(stream) ?? [];
    entries.push([entryId, fields]);
    this.streams.set(stream, entries);
    return entryId;
  }

  pipeline() {
    const commands: Array<{ stream: string; args: string[] }> = [];
    return {
      xadd: (stream: string, ...args: string[]) => {
        commands.push({ stream, args });
        return this;
      },
      exec: async () => {
        for (const command of commands) {
          await this.xadd(command.stream, ...command.args);
        }
        return commands.map(() => [null, 'OK']);
      },
    };
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }
}

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
let redis: FakeRedis;

beforeAll(async () => {
  redis = new FakeRedis();
  await redis.flushdb();
  gateway = new GatewayServer({ port: 0, redis: redis as never });
  await gateway.getApp().ready();
});

afterAll(async () => {
  if (gateway) {
    await gateway.stop();
  }
  await redis.flushdb();
});

beforeEach(async () => {
  await redis.del(STREAM_KEY, DLQ_KEY);
});

describe('GatewayServer HTTP', () => {
  it('should respond to health check', async () => {
    const res = await gateway.getApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.status).toBe('ok');
  });

  it('should accept valid batch of signals', async () => {
    const signals = [makeSignal(), makeSignal({ deviceId: 'VFD-05F-002' })];
    const res = await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest',
      payload: signals,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { accepted: number; rejected: number };
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
    const res = await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest',
      payload: signals,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { accepted: number; rejected: number };
    expect(data.accepted).toBe(1);
    expect(data.rejected).toBe(2);

    // Verify DLQ
    const dlqLen = await redis.xlen(DLQ_KEY);
    expect(dlqLen).toBe(2);
  });

  it('should accept single valid signal', async () => {
    const res = await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest/single',
      payload: makeSignal(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { accepted: boolean };
    expect(data.accepted).toBe(true);
  });

  it('should reject invalid single signal with 400', async () => {
    const res = await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest/single',
      payload: { bad: 'data' },
    });
    expect(res.statusCode).toBe(400);
    const data = res.json() as { error: string };
    expect(data.error).toBe('Validation failed');
  });

  it('should query DLQ entries', async () => {
    // Push some invalid signals first
    await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest',
      payload: [{ invalid: true }],
    });

    const res = await gateway.getApp().inject({ method: 'GET', url: '/api/v1/dlq' });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { count: number; entries: unknown[] };
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  it('should return stats', async () => {
    const res = await gateway.getApp().inject({ method: 'GET', url: '/api/v1/stats' });
    expect(res.statusCode).toBe(200);
    const data = res.json() as Record<string, unknown>;
    expect(data).toHaveProperty('httpReceived');
    expect(data).toHaveProperty('publisher');
  });

  it('should handle high throughput batch', async () => {
    const batchSize = 500;
    const signals = Array.from({ length: batchSize }, () => makeSignal());
    const res = await gateway.getApp().inject({
      method: 'POST',
      url: '/api/v1/ingest',
      payload: signals,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { accepted: number };
    expect(data.accepted).toBe(batchSize);
  });
});
