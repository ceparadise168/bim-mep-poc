import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { validateSignal } from './schema-validator.js';
import { RedisPublisher } from './redis-publisher.js';
import type { Redis as RedisClient } from 'ioredis';

export interface GatewayOptions {
  port?: number;
  host?: string;
  redis?: RedisClient;
  backPressureThreshold?: number;
}

export class GatewayServer {
  private app: FastifyInstance;
  private publisher: RedisPublisher;
  private port: number;
  private host: string;
  private stats = { httpReceived: 0, wsReceived: 0, mqttReceived: 0, validated: 0, rejected: 0 };

  constructor(options: GatewayOptions = {}) {
    this.port = options.port ?? 3100;
    this.host = options.host ?? '0.0.0.0';
    this.publisher = new RedisPublisher({
      redis: options.redis,
      backPressureThreshold: options.backPressureThreshold,
    });

    this.app = Fastify({ logger: false });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async () => ({ status: 'ok', stats: this.getStats() }));

    // HTTP Batch ingestion
    this.app.post<{ Body: unknown[] }>('/api/v1/ingest', {
      schema: {
        body: { type: 'array', items: { type: 'object' } },
      },
    }, async (request, reply) => {
      const signals = request.body as unknown[];
      const results = { accepted: 0, rejected: 0, backPressured: false };

      if (this.publisher.isBackPressured()) {
        results.backPressured = true;
        reply.status(429);
        return { error: 'Back-pressure active', results };
      }

      const validSignals: Record<string, unknown>[] = [];

      for (const signal of signals) {
        this.stats.httpReceived++;
        const validation = validateSignal(signal);
        if (validation.valid) {
          validSignals.push(signal as Record<string, unknown>);
          this.stats.validated++;
          results.accepted++;
        } else {
          await this.publisher.publishDLQ(signal, validation.errors!);
          this.stats.rejected++;
          results.rejected++;
        }
      }

      if (validSignals.length > 0) {
        const batchResult = await this.publisher.publishBatch(validSignals);
        if (batchResult.backPressured > 0) {
          results.backPressured = true;
        }
      }

      return results;
    });

    // Single signal ingestion
    this.app.post('/api/v1/ingest/single', async (request, reply) => {
      const signal = request.body;
      this.stats.httpReceived++;

      if (this.publisher.isBackPressured()) {
        reply.status(429);
        return { error: 'Back-pressure active' };
      }

      const validation = validateSignal(signal);
      if (!validation.valid) {
        await this.publisher.publishDLQ(signal, validation.errors!);
        this.stats.rejected++;
        reply.status(400);
        return { error: 'Validation failed', details: validation.errors };
      }

      await this.publisher.publish(signal as Record<string, unknown>);
      this.stats.validated++;
      return { accepted: true };
    });

    // DLQ query
    this.app.get('/api/v1/dlq', async (request) => {
      const count = (request.query as Record<string, string>).count
        ? parseInt((request.query as Record<string, string>).count, 10)
        : 100;
      const entries = await this.publisher.getDLQEntries(count);
      return { count: entries.length, entries };
    });

    // Stats
    this.app.get('/api/v1/stats', async () => this.getStats());
  }

  async setupWebSocket(): Promise<void> {
    await this.app.register(fastifyWebsocket);

    this.app.get('/ws/ingest', { websocket: true }, (connection) => {
      const socket = connection.socket;
      socket.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.stats.wsReceived++;

          // Support single or batch
          const signals = Array.isArray(data) ? data : [data];

          const validSignals: Record<string, unknown>[] = [];
          for (const signal of signals) {
            const validation = validateSignal(signal);
            if (validation.valid) {
              validSignals.push(signal as Record<string, unknown>);
              this.stats.validated++;
            } else {
              await this.publisher.publishDLQ(signal, validation.errors!);
              this.stats.rejected++;
              socket.send(JSON.stringify({ error: 'validation_failed', deviceId: (signal as Record<string, unknown>).deviceId, details: validation.errors }));
            }
          }
          if (validSignals.length > 0) {
            await this.publisher.publishBatch(validSignals);
          }
        } catch {
          socket.send(JSON.stringify({ error: 'invalid_json' }));
        }
      });
    });
  }

  getStats() {
    return {
      ...this.stats,
      publisher: this.publisher.getStats(),
    };
  }

  getPublisher(): RedisPublisher {
    return this.publisher;
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  async start(): Promise<string> {
    await this.setupWebSocket();
    const address = await this.app.listen({ port: this.port, host: this.host });
    return address;
  }

  async stop(): Promise<void> {
    await this.app.close();
    await this.publisher.close();
  }
}
