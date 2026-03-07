import Aedes from 'aedes';
import { createServer, Server } from 'net';
import { validateSignal } from './schema-validator.js';
import { RedisPublisher } from './redis-publisher.js';
import type Redis from 'ioredis';

export interface MqttBrokerOptions {
  port?: number;
  redis?: Redis;
}

export class MqttBroker {
  private aedes: Aedes;
  private server: Server;
  private port: number;
  private publisher: RedisPublisher;
  private stats = { received: 0, validated: 0, rejected: 0 };

  constructor(options: MqttBrokerOptions = {}) {
    this.port = options.port ?? 1883;
    this.publisher = new RedisPublisher({ redis: options.redis });
    this.aedes = new Aedes();
    this.server = createServer(this.aedes.handle);

    this.aedes.on('publish', async (packet, _client) => {
      if (packet.topic.startsWith('$') || packet.topic !== 'signals/ingest') return;

      try {
        const signal = JSON.parse(packet.payload.toString());
        this.stats.received++;

        const validation = validateSignal(signal);
        if (validation.valid) {
          await this.publisher.publish(signal as Record<string, unknown>);
          this.stats.validated++;
        } else {
          await this.publisher.publishDLQ(signal, validation.errors!);
          this.stats.rejected++;
        }
      } catch {
        // Invalid JSON, ignore
      }
    });
  }

  getStats() {
    return this.stats;
  }

  getPublisher(): RedisPublisher {
    return this.publisher;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => resolve());
      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.aedes.close(() => {
        this.server.close(() => {
          this.publisher.close().then(resolve);
        });
      });
    });
  }
}
