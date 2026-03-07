import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { StreamConsumer, STREAM_KEY, CONSUMER_GROUP } from '../src/stream-consumer.js';
import { v4 as uuidv4 } from 'uuid';

type StreamEntry = [string, string[]];

class FakeRedis {
  private streams = new Map<string, StreamEntry[]>();
  private groups = new Map<string, Map<string, { lastDeliveredId: string; pending: Map<string, string[]> }>>();
  private nextId = 1;

  async flushdb(): Promise<void> {
    this.streams.clear();
    this.groups.clear();
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  async del(stream: string): Promise<number> {
    const deleted = this.streams.delete(stream) ? 1 : 0;
    this.groups.delete(stream);
    return deleted;
  }

  async xadd(stream: string, ...args: string[]): Promise<string> {
    const id = `${this.nextId++}-0`;
    const markerIndex = args.indexOf('*');
    const fieldStart = markerIndex >= 0 ? markerIndex + 1 : 0;
    const fields = args.slice(fieldStart);
    const entries = this.streams.get(stream) ?? [];
    entries.push([id, fields]);
    this.streams.set(stream, entries);
    return id;
  }

  async xgroup(command: 'CREATE' | 'DESTROY', stream: string, groupName: string): Promise<'OK' | number> {
    if (command === 'DESTROY') {
      return this.groups.get(stream)?.delete(groupName) ? 1 : 0;
    }

    const groups = this.groups.get(stream) ?? new Map<string, { lastDeliveredId: string; pending: Map<string, string[]> }>();
    if (groups.has(groupName)) {
      throw new Error('BUSYGROUP Consumer Group name already exists');
    }
    groups.set(groupName, { lastDeliveredId: '0-0', pending: new Map() });
    this.groups.set(stream, groups);
    this.streams.set(stream, this.streams.get(stream) ?? []);
    return 'OK';
  }

  async xinfo(command: 'GROUPS', stream: string): Promise<unknown[]> {
    if (command !== 'GROUPS') {
      return [];
    }

    const groups = this.groups.get(stream);
    if (!groups) {
      return [];
    }

    return Array.from(groups.entries()).map(([name, state]) => [
      'name', name,
      'consumers', 1,
      'pending', state.pending.size,
      'last-delivered-id', state.lastDeliveredId,
    ]);
  }

  async xreadgroup(...args: Array<string | number>): Promise<Array<[string, StreamEntry[]]> | null> {
    const groupName = String(args[1]);
    const count = Number(args[args.indexOf('COUNT') + 1]);
    const streamKey = String(args[args.indexOf('STREAMS') + 1]);
    const streamCursor = String(args[args.indexOf('STREAMS') + 2]);

    const group = this.groups.get(streamKey)?.get(groupName);
    if (!group) {
      throw new Error(`NOGROUP ${groupName}`);
    }

    if (streamCursor === '>') {
      const entries = (this.streams.get(streamKey) ?? [])
        .filter(([id]) => this.compareIds(id, group.lastDeliveredId) > 0)
        .slice(0, count);

      if (entries.length === 0) {
        return null;
      }

      for (const [id, fields] of entries) {
        group.pending.set(id, fields);
        group.lastDeliveredId = id;
      }

      return [[streamKey, entries]];
    }

    const pendingEntries = Array.from(group.pending.entries())
      .slice(0, count)
      .map(([id, fields]) => [id, fields] as StreamEntry);

    if (pendingEntries.length === 0) {
      return null;
    }

    return [[streamKey, pendingEntries]];
  }

  async xack(stream: string, groupName: string, ...ids: string[]): Promise<number> {
    const group = this.groups.get(stream)?.get(groupName);
    if (!group) {
      return 0;
    }

    let acked = 0;
    for (const id of ids) {
      if (group.pending.delete(id)) {
        acked++;
      }
    }
    return acked;
  }

  async xpending(stream: string, groupName: string): Promise<[number, null, null, null]> {
    const group = this.groups.get(stream)?.get(groupName);
    return [group?.pending.size ?? 0, null, null, null];
  }

  private compareIds(left: string, right: string): number {
    const [leftMs, leftSeq] = left.split('-').map(Number);
    const [rightMs, rightSeq] = right.split('-').map(Number);
    if (leftMs !== rightMs) {
      return leftMs - rightMs;
    }
    return leftSeq - rightSeq;
  }
}

let redis: FakeRedis;

beforeAll(async () => {
  redis = new FakeRedis();
  await redis.flushdb();
});

afterAll(async () => {
  await redis.flushdb();
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
    const consumer = new StreamConsumer({ redis: redis as never, consumerName: 'test-1' });
    await consumer.ensureGroup();

    const groups = await redis.xinfo('GROUPS', STREAM_KEY) as unknown[];
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle duplicate group creation gracefully', async () => {
    const consumer = new StreamConsumer({ redis: redis as never, consumerName: 'test-2' });
    await consumer.ensureGroup();
    await consumer.ensureGroup(); // Should not throw
  });

  it('should consume messages from stream', async () => {
    const consumer = new StreamConsumer({
      redis: redis as never,
      consumerName: 'test-3',
      batchSize: 10,
      blockMs: 500,
    });

    // Publish some messages
    for (let i = 0; i < 5; i++) {
      await redis.xadd(STREAM_KEY, '*', 'data', makeSignalData());
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
      redis: redis as never,
      consumerName: 'test-4',
      batchSize: 10,
      blockMs: 500,
    });

    // Publish 3 messages
    for (let i = 0; i < 3; i++) {
      await redis.xadd(STREAM_KEY, '*', 'data', makeSignalData());
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
