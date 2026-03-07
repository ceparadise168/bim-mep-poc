import { Redis as IORedis, type Redis as RedisClient } from 'ioredis';
import { EventEmitter } from 'events';

export const STREAM_KEY = 'signals:raw';
export const CONSUMER_GROUP = 'stream-processors';

export interface StreamConsumerOptions {
  redis?: RedisClient;
  groupName?: string;
  consumerName?: string;
  batchSize?: number;
  blockMs?: number;
}

export interface ParsedSignal {
  streamId: string;
  signalId: string;
  deviceId: string;
  timestamp: number;
  protocol: string;
  payload: Record<string, number | string | boolean>;
  quality: string;
  metadata?: Record<string, unknown>;
}

export class StreamConsumer extends EventEmitter {
  private redis: RedisClient;
  private groupName: string;
  private consumerName: string;
  private batchSize: number;
  private blockMs: number;
  private running = false;
  private processedCount = 0;

  constructor(options: StreamConsumerOptions = {}) {
    super();
    this.redis = options.redis ?? new IORedis({ maxRetriesPerRequest: null });
    this.groupName = options.groupName ?? CONSUMER_GROUP;
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.batchSize = options.batchSize ?? 100;
    this.blockMs = options.blockMs ?? 2000;
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', STREAM_KEY, this.groupName, '0', 'MKSTREAM');
    } catch (err: unknown) {
      // Group already exists
      if (!(err instanceof Error && err.message.includes('BUSYGROUP'))) {
        throw err;
      }
    }
  }

  async start(handler: (signals: ParsedSignal[]) => Promise<void>): Promise<void> {
    await this.ensureGroup();
    this.running = true;

    // First process any pending (unacknowledged) messages
    await this.processPending(handler);

    // Then consume new messages
    while (this.running) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP', this.groupName, this.consumerName,
          'COUNT', this.batchSize,
          'BLOCK', this.blockMs,
          'STREAMS', STREAM_KEY, '>',
        ) as Array<[string, Array<[string, string[]]>]> | null;

        if (!results || results.length === 0) continue;

        for (const [, entries] of results) {
          const signals = entries.map(([id, fields]) => this.parseEntry(id, fields));
          if (signals.length > 0) {
            await handler(signals);
            // ACK all processed messages
            const ids = signals.map(s => s.streamId);
            await this.redis.xack(STREAM_KEY, this.groupName, ...ids);
            this.processedCount += signals.length;
            this.emit('batch', { count: signals.length, total: this.processedCount });
          }
        }
      } catch (err) {
        if (this.running) {
          this.emit('error', err);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  private async processPending(handler: (signals: ParsedSignal[]) => Promise<void>): Promise<void> {
    while (this.running) {
      const results = await this.redis.xreadgroup(
        'GROUP', this.groupName, this.consumerName,
        'COUNT', this.batchSize,
        'STREAMS', STREAM_KEY, '0',
      ) as Array<[string, Array<[string, string[]]>]> | null;

      if (!results || results.length === 0) break;

      let hasEntries = false;
      for (const [, entries] of results) {
        if (entries.length === 0) continue;
        hasEntries = true;
        const signals = entries.map(([id, fields]) => this.parseEntry(id, fields));
        await handler(signals);
        const ids = signals.map(s => s.streamId);
        await this.redis.xack(STREAM_KEY, this.groupName, ...ids);
        this.processedCount += signals.length;
      }

      if (!hasEntries) break;
    }
  }

  private parseEntry(id: string, fields: string[]): ParsedSignal {
    const fieldMap = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) {
      fieldMap.set(fields[i], fields[i + 1]);
    }
    const data = JSON.parse(fieldMap.get('data') || '{}');
    return {
      streamId: id,
      ...data,
    };
  }

  stop(): void {
    this.running = false;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  async getLastId(): Promise<string | null> {
    const info = await this.redis.xinfo('GROUPS', STREAM_KEY) as unknown[];
    // Find our group's last-delivered-id
    for (const group of info) {
      if (Array.isArray(group)) {
        const map = new Map<string, string>();
        for (let i = 0; i < group.length; i += 2) {
          map.set(String(group[i]), String(group[i + 1]));
        }
        if (map.get('name') === this.groupName) {
          return map.get('last-delivered-id') ?? null;
        }
      }
    }
    return null;
  }

  async close(): Promise<void> {
    this.stop();
    await this.redis.quit();
  }
}
