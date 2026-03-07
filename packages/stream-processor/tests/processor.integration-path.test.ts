import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { StreamProcessor } from '../src/processor.js';
import type { ParsedSignal } from '../src/stream-consumer.js';
import { AnomalyDetector } from '../../anomaly-engine/src/anomaly-detector.js';

class FakeConsumer extends EventEmitter {
  private handler?: (signals: ParsedSignal[]) => Promise<void>;

  async start(handler: (signals: ParsedSignal[]) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async push(signals: ParsedSignal[]): Promise<void> {
    await this.handler?.(signals);
  }

  stop(): void {}
  async close(): Promise<void> {}
}

class FakeDbWriter {
  signals: unknown[] = [];
  anomalies: unknown[] = [];

  async writeSignals(records: unknown[]): Promise<void> {
    this.signals.push(...records);
  }

  async writeAggregation(): Promise<void> {}

  async writeAnomalies(records: unknown[]): Promise<void> {
    this.anomalies.push(...records);
  }

  async resolveAnomalies(): Promise<void> {}

  async close(): Promise<void> {}
}

class FakeRealtimePublisher {
  signals: Array<{ channel: string; data: unknown }> = [];
  anomalies: Array<{ channel: string; data: unknown }> = [];
  dashboards: Array<{ channel: string; data: unknown }> = [];

  async publishSignal(signal: ParsedSignal): Promise<void> {
    this.signals.push({ channel: `signals:${signal.deviceId}`, data: signal });
  }

  async publishAnomaly(event: unknown): Promise<void> {
    this.anomalies.push({ channel: 'anomalies', data: event });
  }

  async publishDashboardUpdate(update: unknown): Promise<void> {
    this.dashboards.push({ channel: 'dashboard', data: update });
  }

  async close(): Promise<void> {}
}

class FakeChaosCommandSubscriber {
  private handler?: (command: { scenario: string; devices: string[] }) => Promise<void>;

  async start(handler: (command: { scenario: string; devices: string[] }) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async trigger(command: { scenario: string; devices: string[] }): Promise<void> {
    await this.handler?.(command);
  }

  async close(): Promise<void> {}
}

describe('StreamProcessor integration path', () => {
  it('persists anomaly events and publishes realtime messages after a chaos trigger', async () => {
    const consumer = new FakeConsumer();
    const dbWriter = new FakeDbWriter();
    const realtimePublisher = new FakeRealtimePublisher();
    const chaosSubscriber = new FakeChaosCommandSubscriber();

    const processor = new StreamProcessor({
      consumer: consumer as never,
      dbWriter: dbWriter as never,
      realtimePublisher: realtimePublisher as never,
      chaosCommandSubscriber: chaosSubscriber as never,
      anomalyDetector: new AnomalyDetector({ pendingDurationMs: 0 }) as never,
    });

    await processor.start();

    await chaosSubscriber.trigger({
      scenario: '空調主機故障',
      devices: ['CH-00F-001'],
    });

    await consumer.push([
      {
        streamId: '1-0',
        signalId: 'signal-1',
        deviceId: 'CH-00F-001',
        timestamp: Date.now(),
        protocol: 'bacnet-ip',
        payload: { compressorCurrent: 120, cop: 2.0 },
        quality: 'good',
        metadata: {
          floor: 0,
          deviceType: 'chiller',
          zone: '機房區',
        },
      },
    ]);

    expect(dbWriter.signals.length).toBeGreaterThan(0);
    expect(dbWriter.anomalies.length).toBeGreaterThan(0);
    expect(realtimePublisher.signals.length).toBeGreaterThan(0);
    expect(realtimePublisher.anomalies.length).toBeGreaterThan(0);
    expect(realtimePublisher.dashboards.length).toBeGreaterThan(0);

    await processor.close();
  });
});
