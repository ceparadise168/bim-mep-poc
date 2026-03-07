import { describe, expect, it } from 'vitest';
import { GatewayBatchPublisher } from '../src/gateway-batch-publisher.js';
import type { SignalEnvelope } from '../src/types.js';

function makeSignal(id: string): SignalEnvelope {
  return {
    signalId: id,
    deviceId: 'AHU-03F-001',
    timestamp: Date.now(),
    protocol: 'bacnet-ip',
    payload: { temperature: 22.5 },
    quality: 'good',
  };
}

describe('GatewayBatchPublisher', () => {
  it('flushes queued signals in batches', async () => {
    const batches: SignalEnvelope[][] = [];
    const publisher = new GatewayBatchPublisher({
      maxBatchSize: 2,
      transport: {
        async publishBatch(signals) {
          batches.push(signals);
        },
      },
    });

    publisher.enqueue(makeSignal('1'));
    publisher.enqueue(makeSignal('2'));
    publisher.enqueue(makeSignal('3'));

    await publisher.flush();
    await publisher.flush();

    expect(batches).toHaveLength(2);
    expect(batches[0].map(signal => signal.signalId)).toEqual(['1', '2']);
    expect(batches[1].map(signal => signal.signalId)).toEqual(['3']);
  });

  it('requeues a batch when transport publish fails', async () => {
    let attempts = 0;
    const publisher = new GatewayBatchPublisher({
      transport: {
        async publishBatch() {
          attempts += 1;
          throw new Error('gateway unavailable');
        },
      },
    });

    publisher.enqueue(makeSignal('1'));

    await expect(publisher.flush()).rejects.toThrow('gateway unavailable');
    expect(publisher.getQueueSize()).toBe(1);
    expect(attempts).toBe(1);
  });
});
