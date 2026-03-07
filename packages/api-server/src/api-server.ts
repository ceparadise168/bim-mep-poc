import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { DataStore } from './data-store.js';
import { WsManager } from './ws-manager.js';
import {
  ChaosCommandPublisher,
  NullChaosCommandPublisher,
  RedisChaosCommandPublisher,
} from './chaos-command-publisher.js';
import {
  NullRealtimeSubscriber,
  RealtimeSubscriber,
  RedisRealtimeSubscriber,
} from './realtime-subscriber.js';
import type pg from 'pg';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  dbPool?: pg.Pool;
  dbConnectionString?: string;
  redisUrl?: string;
  chaosCommandPublisher?: ChaosCommandPublisher;
  realtimeSubscriber?: RealtimeSubscriber;
}

export class ApiServer {
  private app: FastifyInstance;
  private store: DataStore;
  private wsManager: WsManager;
  private chaosCommandPublisher: ChaosCommandPublisher;
  private realtimeSubscriber: RealtimeSubscriber;
  private port: number;
  private host: string;
  private initialized = false;
  // Chaos scenarios and anomalies stored in-memory for POC
  private chaosScenarios = [
    { name: '空調主機故障', description: '壓縮機電流飆高 → 過載保護跳脫 → 下游 AHU 送風溫度上升' },
    { name: '電力異常', description: '主電壓閃降 → UPS 切換 → 發電機啟動' },
    { name: '感測器飄移', description: '溫溼度感測器逐漸偏離 → 誤報' },
    { name: '網路中斷', description: '整層設備心跳消失 → 批量離線警報' },
    { name: '水管洩漏', description: '水壓下降 → 流量異常 → 消防泵浦啟動' },
  ];
  private chaosHistory: Array<{ scenario: string; triggeredAt: string; devices: string[] }> = [];

  constructor(options: ApiServerOptions = {}) {
    this.port = options.port ?? 3000;
    this.host = options.host ?? '0.0.0.0';
    this.store = new DataStore({ pool: options.dbPool, connectionString: options.dbConnectionString });
    this.wsManager = new WsManager();
    this.chaosCommandPublisher = options.chaosCommandPublisher
      ?? (options.redisUrl ? new RedisChaosCommandPublisher(options.redisUrl) : new NullChaosCommandPublisher());
    this.realtimeSubscriber = options.realtimeSubscriber
      ?? (options.redisUrl ? new RedisRealtimeSubscriber(options.redisUrl) : new NullRealtimeSubscriber());
    this.app = Fastify({ logger: false });
  }

  private async setup(): Promise<void> {
    await this.app.register(fastifyCors, { origin: true });

    await this.app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'BIM MEP IoT API',
          description: 'Building MEP Equipment IoT Backend API',
          version: '1.0.0',
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
    });

    await this.app.register(fastifySwaggerUi, { routePrefix: '/docs' });

    await this.app.register(fastifyWebsocket);

    this.registerRestRoutes();
    this.registerWsRoutes();
  }

  async ready(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.setup();
    await this.app.ready();
    await this.realtimeSubscriber.start((message) => {
      this.wsManager.broadcast(message.channel, message.data);
    });
    this.initialized = true;
  }

  private registerRestRoutes(): void {
    // Health
    this.app.get('/health', { schema: { tags: ['System'] } }, async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsConnections: this.wsManager.getTotalConnections(),
    }));

    // Devices
    this.app.get('/api/v1/devices', {
      schema: {
        tags: ['Devices'],
        querystring: {
          type: 'object',
          properties: {
            floor: { type: 'integer' },
            deviceType: { type: 'string' },
            zone: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
          },
        },
      },
    }, async (request) => {
      const q = request.query as Record<string, string>;
      return this.store.getDevices(
        { floor: q.floor ? parseInt(q.floor) : undefined, deviceType: q.deviceType, zone: q.zone },
        parseInt(q.page ?? '1'),
        parseInt(q.limit ?? '50'),
      );
    });

    this.app.get('/api/v1/devices/:id', {
      schema: { tags: ['Devices'], params: { type: 'object', properties: { id: { type: 'string' } } } },
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const device = await this.store.getDevice(id);
      if (!device) { reply.status(404); return { error: 'Device not found' }; }
      return device;
    });

    this.app.get('/api/v1/devices/:id/signals', {
      schema: {
        tags: ['Devices'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            metric: { type: 'string' },
            interval: { type: 'string', enum: ['raw', '1m', '1h'] },
          },
        },
      },
    }, async (request) => {
      const { id } = request.params as { id: string };
      const q = request.query as Record<string, string>;
      return this.store.getDeviceSignals(id, { from: q.from, to: q.to, metric: q.metric, interval: q.interval });
    });

    this.app.get('/api/v1/devices/:id/maintenance', {
      schema: { tags: ['Devices'], params: { type: 'object', properties: { id: { type: 'string' } } } },
    }, async (request) => {
      const { id } = request.params as { id: string };
      return this.store.getDeviceMaintenance(id);
    });

    // Floors
    this.app.get('/api/v1/floors/:floor/overview', {
      schema: { tags: ['Floors'], params: { type: 'object', properties: { floor: { type: 'integer' } } } },
    }, async (request) => {
      const { floor } = request.params as { floor: number };
      return this.store.getFloorOverview(floor);
    });

    // Building
    this.app.get('/api/v1/building/dashboard', {
      schema: { tags: ['Building'] },
    }, async () => {
      return this.store.getBuildingDashboard();
    });

    // Anomalies
    this.app.get('/api/v1/anomalies', {
      schema: {
        tags: ['Anomalies'],
        querystring: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            type: { type: 'string' },
            severity: { type: 'string' },
            limit: { type: 'integer', default: 100 },
          },
        },
      },
    }, async (request) => {
      const q = request.query as Record<string, string>;
      return this.store.getAnomalies({
        deviceId: q.deviceId,
        type: q.type,
        severity: q.severity,
        limit: q.limit ? parseInt(q.limit) : undefined,
      });
    });

    // Chaos
    this.app.get('/api/v1/chaos/scenarios', {
      schema: { tags: ['Chaos'] },
    }, async () => this.chaosScenarios);

    this.app.post('/api/v1/chaos/trigger', {
      schema: {
        tags: ['Chaos'],
        body: {
          type: 'object',
          required: ['scenario', 'devices'],
          properties: {
            scenario: { type: 'string' },
            devices: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    }, async (request, reply) => {
      const { scenario, devices } = request.body as { scenario: string; devices: string[] };
      const found = this.chaosScenarios.find(s => s.name === scenario);
      if (!found) { reply.status(400); return { error: 'Unknown scenario' }; }

      const entry = { scenario, triggeredAt: new Date().toISOString(), devices };
      this.chaosHistory.push(entry);
      await this.chaosCommandPublisher.publish({ scenario, devices });

      return { triggered: true, ...entry };
    });

    // Analytics
    this.app.get('/api/v1/analytics/energy', {
      schema: { tags: ['Analytics'] },
    }, async () => this.store.getEnergyAnalytics());

    this.app.get('/api/v1/analytics/comfort', {
      schema: { tags: ['Analytics'] },
    }, async () => this.store.getComfortAnalytics());
  }

  private registerWsRoutes(): void {
    this.app.get('/ws', { websocket: true }, (connection) => {
      const socket = connection.socket;

      socket.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.action === 'subscribe' && data.channel) {
            this.wsManager.subscribe(socket, data.channel);
            socket.send(JSON.stringify({ action: 'subscribed', channel: data.channel }));
          } else if (data.action === 'unsubscribe' && data.channel) {
            this.wsManager.unsubscribe(socket, data.channel);
            socket.send(JSON.stringify({ action: 'unsubscribed', channel: data.channel }));
          }
        } catch {
          socket.send(JSON.stringify({ error: 'invalid_json' }));
        }
      });

      socket.on('close', () => {
        this.wsManager.removeSocket(socket);
      });
    });
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  getWsManager(): WsManager {
    return this.wsManager;
  }

  getStore(): DataStore {
    return this.store;
  }

  async start(): Promise<string> {
    await this.ready();
    const address = await this.app.listen({ port: this.port, host: this.host });
    return address;
  }

  async stop(): Promise<void> {
    await this.realtimeSubscriber.close();
    await this.chaosCommandPublisher.close();
    await this.app.close();
    await this.store.close();
  }
}
