import { EventEmitter } from 'events';
import { StreamConsumer, ParsedSignal } from './stream-consumer.js';
import { SlidingWindowAggregator, AggResult } from './aggregator.js';
import { DbWriter, SignalRecord, AggRecord, AnomalyRecord, AnomalyResolveRecord } from './db-writer.js';
import {
  ChaosCommandSubscriber,
  NullChaosCommandSubscriber,
  RedisChaosCommandSubscriber,
} from './chaos-command-subscriber.js';
import {
  NullRealtimePublisher,
  RealtimePublisher,
  RedisRealtimePublisher,
} from './realtime-publisher.js';
import type { Redis as RedisClient } from 'ioredis';
import type pg from 'pg';

interface ProcessorConsumer {
  start(handler: (signals: ParsedSignal[]) => Promise<void>): Promise<void>;
  stop(): void;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

interface ProcessorDbWriter {
  writeSignals(records: SignalRecord[]): Promise<void>;
  writeAggregation(table: 'signals_agg_1m' | 'signals_agg_1h', records: AggRecord[]): Promise<void>;
  writeAnomalies(records: AnomalyRecord[]): Promise<void>;
  resolveAnomalies(records: AnomalyResolveRecord[]): Promise<void>;
  close(): Promise<void>;
}

interface ProcessorAnomalyEvent {
  fingerprint: string;
  deviceId: string;
  anomalyType: string;
  severity: string;
  state: string;
  message: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;
  detectedAt: number;
  firedAt?: number;
  resolvedAt?: number;
  occurrenceCount: number;
  metadata?: Record<string, unknown>;
}

interface ProcessorAnomalyDetector {
  processSignal(input: {
    deviceId: string;
    deviceType: string;
    timestamp: number;
    payload: Record<string, number | string | boolean>;
  }): ProcessorAnomalyEvent[];
}

interface ActiveFault {
  faultType: string;
}

interface ProcessorChaosEngine {
  triggerScenario(scenarioName: string, deviceIds: string[]): unknown;
  getActiveFault(deviceId: string): ActiveFault | null;
  modifySignalValue(deviceId: string, metricName: string, originalValue: number): number;
}

export interface ProcessorOptions {
  redis?: RedisClient;
  dbPool?: pg.Pool;
  dbConnectionString?: string;
  consumerName?: string;
  consumer?: ProcessorConsumer;
  dbWriter?: ProcessorDbWriter;
  realtimePublisher?: RealtimePublisher;
  chaosCommandSubscriber?: ChaosCommandSubscriber;
  anomalyDetector?: ProcessorAnomalyDetector;
  chaosEngine?: ProcessorChaosEngine;
}

export class StreamProcessor extends EventEmitter {
  private consumer: ProcessorConsumer;
  private dbWriter: ProcessorDbWriter;
  private agg1m: SlidingWindowAggregator;
  private agg1h: SlidingWindowAggregator;
  private realtimePublisher: RealtimePublisher;
  private chaosCommandSubscriber: ChaosCommandSubscriber;
  private anomalyDetector?: ProcessorAnomalyDetector;
  private chaosEngine?: ProcessorChaosEngine;
  private running = false;
  private lastDashboardPublishAt = 0;
  private pendingResolves: AnomalyResolveRecord[] = [];
  constructor(options: ProcessorOptions = {}) {
    super();
    this.consumer = options.consumer ?? new StreamConsumer({
      redis: options.redis,
      consumerName: options.consumerName,
    });

    this.dbWriter = options.dbWriter ?? new DbWriter({
      pool: options.dbPool,
      connectionString: options.dbConnectionString,
    });
    this.realtimePublisher = options.realtimePublisher
      ?? (options.redis ? new RedisRealtimePublisher(options.redis) : new NullRealtimePublisher());
    this.chaosCommandSubscriber = options.chaosCommandSubscriber
      ?? (options.redis ? new RedisChaosCommandSubscriber(options.redis) : new NullChaosCommandSubscriber());
    this.anomalyDetector = options.anomalyDetector;
    this.chaosEngine = options.chaosEngine;

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
    await this.ensureEngines();
    this.running = true;
    this.agg1m.start();
    this.agg1h.start();
    await this.chaosCommandSubscriber.start(async (command) => {
      this.chaosEngine?.triggerScenario(command.scenario, command.devices);
      await this.realtimePublisher.publishDashboardUpdate({
        type: 'chaos_triggered',
        scenario: command.scenario,
        devices: command.devices,
        timestamp: Date.now(),
      });
    });

    await this.consumer.start(async (signals) => {
      await this.processSignals(signals);
    });
  }

  private async processSignals(signals: ParsedSignal[]): Promise<void> {
    const records: SignalRecord[] = [];
    const liveSignals: ParsedSignal[] = [];
    const anomalies: ProcessorAnomalyEvent[] = [];

    for (const signal of signals) {
      const preparedSignal = this.applyChaosToSignal(signal);
      if (!preparedSignal) {
        continue;
      }

      const { payload, deviceId, timestamp, quality, metadata } = preparedSignal;
      const time = new Date(timestamp);
      const deviceType = this.resolveDeviceType(deviceId, metadata);

      for (const [metricName, value] of Object.entries(payload)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
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

      if (deviceType && this.anomalyDetector) {
        anomalies.push(...this.anomalyDetector.processSignal({
          deviceId,
          deviceType,
          timestamp,
          payload,
        }));
      }

      liveSignals.push(preparedSignal);
    }

    if (records.length > 0) {
      try {
        await this.dbWriter.writeSignals(records);
      } catch (err) {
        this.emit('error', err);
      }
    }

    if (anomalies.length > 0) {
      await this.persistAnomalies(anomalies);
    }

    await Promise.all(liveSignals.map(signal => this.realtimePublisher.publishSignal(signal)));

    await this.maybePublishDashboardUpdate(liveSignals.length, anomalies.length);
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
    return this.consumer as StreamConsumer;
  }

  getDbWriter(): DbWriter {
    return this.dbWriter as DbWriter;
  }

  async close(): Promise<void> {
    await this.flushAndStop();
    await this.chaosCommandSubscriber.close();
    await this.realtimePublisher.close();
    await this.consumer.close();
    await this.dbWriter.close();
  }

  private async ensureEngines(): Promise<void> {
    if (!this.anomalyDetector) {
      const modulePath = new URL('../../anomaly-engine/src/anomaly-detector.js', import.meta.url).href;
      const module = await import(modulePath);
      const detector = new module.AnomalyDetector() as ProcessorAnomalyDetector & { on(event: string, handler: (e: ProcessorAnomalyEvent) => void): void };
      detector.on('resolved', (event: ProcessorAnomalyEvent) => {
        this.pendingResolves.push({
          fingerprint: event.fingerprint,
          resolvedAt: new Date(event.resolvedAt ?? Date.now()),
          metricValue: event.metricValue,
        });
      });
      this.anomalyDetector = detector;
    }

    if (!this.chaosEngine) {
      const modulePath = new URL('../../anomaly-engine/src/chaos-engine.js', import.meta.url).href;
      const module = await import(modulePath);
      this.chaosEngine = new module.ChaosEngine() as ProcessorChaosEngine;
    }
  }

  private applyChaosToSignal(signal: ParsedSignal): ParsedSignal | null {
    if (!this.chaosEngine) {
      return signal;
    }

    const activeFault = this.chaosEngine.getActiveFault(signal.deviceId);
    if (activeFault?.faultType === 'offline') {
      return null;
    }

    const nextPayload: Record<string, number | string | boolean> = {};
    let modified = false;

    for (const [metricName, value] of Object.entries(signal.payload)) {
      if (typeof value === 'number') {
        const nextValue = this.chaosEngine.modifySignalValue(signal.deviceId, metricName, value);
        nextPayload[metricName] = nextValue;
        modified ||= nextValue !== value;
      } else {
        nextPayload[metricName] = value;
      }
    }

    return {
      ...signal,
      payload: nextPayload,
      quality: modified ? 'uncertain' : signal.quality,
    };
  }

  private async persistAnomalies(events: ProcessorAnomalyEvent[]): Promise<void> {
    const records: AnomalyRecord[] = events.map((event) => ({
      fingerprint: event.fingerprint,
      deviceId: event.deviceId,
      anomalyType: event.anomalyType,
      severity: event.severity,
      state: event.state,
      message: event.message,
      metricName: event.metricName,
      metricValue: event.metricValue,
      threshold: event.threshold,
      detectedAt: new Date(event.detectedAt),
      firedAt: event.firedAt ? new Date(event.firedAt) : undefined,
      occurrenceCount: event.occurrenceCount,
      metadata: event.metadata,
    }));

    await this.dbWriter.writeAnomalies(records);

    // Flush any resolved alerts collected from the 'resolved' event
    if (this.pendingResolves.length > 0) {
      const resolves = this.pendingResolves.splice(0);
      await this.dbWriter.resolveAnomalies(resolves);
    }

    await Promise.all(events.map(event => this.realtimePublisher.publishAnomaly({
      device_id: event.deviceId,
      anomaly_type: event.anomalyType,
      severity: event.severity,
      state: event.state,
      message: event.message,
      metric_name: event.metricName,
      metric_value: event.metricValue,
      threshold: event.threshold,
      detected_at: new Date(event.detectedAt).toISOString(),
      metadata: event.metadata,
    })));
  }

  private async maybePublishDashboardUpdate(signalCount: number, anomalyCount: number): Promise<void> {
    const now = Date.now();
    if (anomalyCount === 0 && now - this.lastDashboardPublishAt < 1000) {
      return;
    }

    this.lastDashboardPublishAt = now;
    await this.realtimePublisher.publishDashboardUpdate({
      type: 'signals_processed',
      signalCount,
      anomalyCount,
      timestamp: now,
    });
  }

  private resolveDeviceType(deviceId: string, metadata?: Record<string, unknown>): string | null {
    if (typeof metadata?.deviceType === 'string') {
      return metadata.deviceType;
    }

    const prefix = deviceId.split('-')[0];
    const prefixMap: Record<string, string> = {
      CH: 'chiller',
      AHU: 'ahu',
      VFD: 'vfd',
      PP: 'power-panel',
      UPS: 'ups',
      GEN: 'generator',
      FP: 'fire-pump',
      ELV: 'elevator',
      LT: 'lighting-controller',
      TH: 'temp-humidity-sensor',
      WM: 'water-meter',
      AQ: 'air-quality-sensor',
    };

    return prefixMap[prefix] ?? null;
  }
}
