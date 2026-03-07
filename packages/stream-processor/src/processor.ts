import { EventEmitter } from 'events';
import { StreamConsumer, ParsedSignal } from './stream-consumer.js';
import { SlidingWindowAggregator, AggResult } from './aggregator.js';
import { DbWriter, SignalRecord, AggRecord } from './db-writer.js';
import type Redis from 'ioredis';
import type pg from 'pg';

export interface ProcessorOptions {
  redis?: Redis;
  dbPool?: pg.Pool;
  dbConnectionString?: string;
  consumerName?: string;
}

export class StreamProcessor extends EventEmitter {
  private consumer: StreamConsumer;
  private dbWriter: DbWriter;
  private agg1m: SlidingWindowAggregator;
  private agg1h: SlidingWindowAggregator;
  private running = false;

  constructor(options: ProcessorOptions = {}) {
    super();
    this.consumer = new StreamConsumer({
      redis: options.redis,
      consumerName: options.consumerName,
    });

    this.dbWriter = new DbWriter({
      pool: options.dbPool,
      connectionString: options.dbConnectionString,
    });

    this.agg1m = new SlidingWindowAggregator(60_000, (results) => {
      this.writeAggregations('signals_agg_1m', results).catch(err => this.emit('error', err));
    });

    this.agg1h = new SlidingWindowAggregator(3_600_000, (results) => {
      this.writeAggregations('signals_agg_1h', results).catch(err => this.emit('error', err));
    });

    this.consumer.on('error', (err) => this.emit('error', err));
    this.consumer.on('batch', (info) => this.emit('batch', info));
  }

  async start(): Promise<void> {
    this.running = true;
    this.agg1m.start();
    this.agg1h.start();

    await this.consumer.start(async (signals) => {
      await this.processSignals(signals);
    });
  }

  private async processSignals(signals: ParsedSignal[]): Promise<void> {
    const records: SignalRecord[] = [];

    for (const signal of signals) {
      const { payload, deviceId, timestamp, quality, metadata } = signal;
      const time = new Date(timestamp);

      for (const [metricName, value] of Object.entries(payload)) {
        if (typeof value === 'number') {
          records.push({
            time,
            deviceId,
            metricName,
            value,
            quality: quality ?? 'good',
            metadata: (metadata ?? {}) as Record<string, unknown>,
          });

          // Feed aggregators
          this.agg1m.addValue(deviceId, metricName, value, timestamp);
          this.agg1h.addValue(deviceId, metricName, value, timestamp);
        }
      }
    }

    if (records.length > 0) {
      try {
        await this.dbWriter.writeSignals(records);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  private async writeAggregations(table: 'signals_agg_1m' | 'signals_agg_1h', results: AggResult[]): Promise<void> {
    const records: AggRecord[] = results.map(r => ({
      time: r.windowStart,
      deviceId: r.deviceId,
      metricName: r.metricName,
      avgValue: r.avg,
      minValue: r.min,
      maxValue: r.max,
      count: r.count,
    }));
    await this.dbWriter.writeAggregation(table, records);
  }

  stop(): void {
    this.running = false;
    this.consumer.stop();
    this.agg1m.stop();
    this.agg1h.stop();
  }

  async flushAndStop(): Promise<void> {
    this.stop();
    // Flush remaining aggregations
    const remaining1m = this.agg1m.flushAll();
    const remaining1h = this.agg1h.flushAll();
    if (remaining1m.length > 0) {
      await this.writeAggregations('signals_agg_1m', remaining1m);
    }
    if (remaining1h.length > 0) {
      await this.writeAggregations('signals_agg_1h', remaining1h);
    }
  }

  getConsumer(): StreamConsumer {
    return this.consumer;
  }

  getDbWriter(): DbWriter {
    return this.dbWriter;
  }

  async close(): Promise<void> {
    await this.flushAndStop();
    await this.consumer.close();
    await this.dbWriter.close();
  }
}
