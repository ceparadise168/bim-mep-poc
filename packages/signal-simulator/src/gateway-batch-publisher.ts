import type { SignalEnvelope } from './types.js';

export interface BatchTransport {
  publishBatch(signals: SignalEnvelope[]): Promise<void>;
}

export interface GatewayBatchPublisherOptions {
  maxBatchSize?: number;
  transport: BatchTransport;
}

export class GatewayBatchPublisher {
  private readonly maxBatchSize: number;
  private readonly queue: SignalEnvelope[] = [];
  private readonly transport: BatchTransport;

  constructor(options: GatewayBatchPublisherOptions) {
    this.maxBatchSize = options.maxBatchSize ?? 200;
    this.transport = options.transport;
  }

  enqueue(signal: SignalEnvelope): void {
    this.queue.push(signal);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await this.transport.publishBatch(batch);
    } catch (error) {
      this.queue.unshift(...batch);
      throw error;
    }
  }
}
