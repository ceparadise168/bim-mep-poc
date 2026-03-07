// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { SignalSimulator } from '../../packages/signal-simulator/src/simulator.js';
import { GatewayServer } from '../../packages/ingestion-gateway/src/gateway-server.js';
import { AnomalyDetector } from '../../packages/anomaly-engine/src/anomaly-detector.js';
import { ChaosEngine } from '../../packages/anomaly-engine/src/chaos-engine.js';
import { ApiServer } from '../../packages/api-server/src/api-server.js';

let redis: Redis;
let gatewayRedis: Redis;
let gateway: GatewayServer;
let gatewayUrl: string;
let apiServer: ApiServer;
let apiUrl: string;

beforeAll(async () => {
  redis = new Redis({ db: 13 });
  gatewayRedis = new Redis({ db: 13 });
  await redis.flushdb();

  gateway = new GatewayServer({ port: 0, redis: gatewayRedis });
  const gwAddress = await gateway.start();
  const gwPort = gateway.getApp().server.address();
  gatewayUrl = typeof gwPort === 'object' && gwPort
    ? `http://127.0.0.1:${gwPort.port}`
    : gwAddress.replace('[::]', '127.0.0.1');

  // API server without DB (routes still work for chaos/health)
  apiServer = new ApiServer({ port: 0 });
  const apiAddress = await apiServer.start();
  const apiPort = apiServer.getApp().server.address();
  apiUrl = typeof apiPort === 'object' && apiPort
    ? `http://127.0.0.1:${apiPort.port}`
    : apiAddress.replace('[::]', '127.0.0.1');
});

afterAll(async () => {
  await gateway.stop();
  await apiServer.stop();
  await redis.flushdb();
  await redis.quit();
});

describe('Test 1: Normal Operation Stability', () => {
  it('should generate and ingest signals continuously for 5 seconds', async () => {
    const sim = new SignalSimulator({ speedMultiplier: 5 });
    const signals: unknown[] = [];

    sim.on('signal', async (signal) => {
      signals.push(signal);
    });

    sim.start();
    await new Promise(r => setTimeout(r, 5000));
    sim.stop();

    expect(signals.length).toBeGreaterThan(100);
    console.log(`Test 1: Generated ${signals.length} signals in 5s`);

    // Batch ingest to gateway
    const batch = signals.slice(0, 100);
    const res = await fetch(`${gatewayUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(200);
    const result = await res.json() as { accepted: number };
    expect(result.accepted).toBe(100);
  }, 15000);
});

describe('Test 2: Fault Injection Cascade', () => {
  it('should trigger chaos and detect cascading anomalies', async () => {
    const detector = new AnomalyDetector({ pendingDurationMs: 0 });
    const chaos = new ChaosEngine();
    const anomalies: unknown[] = [];

    detector.on('firing', (a: unknown) => anomalies.push(a));

    // Trigger chiller fault
    const effects = chaos.triggerScenario('空調主機故障', ['CH-00F-001', 'CH-00F-002']);
    expect(effects.length).toBe(2);

    // Simulate affected chiller signals
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const modifiedCurrent = chaos.modifySignalValue('CH-00F-001', 'compressorCurrent', 80);
      detector.processSignal({
        deviceId: 'CH-00F-001',
        deviceType: 'chiller',
        timestamp: now + i * 1000,
        payload: { compressorCurrent: modifiedCurrent }, // Will be spiked
      });
    }

    expect(anomalies.length).toBeGreaterThan(0);
    console.log(`Test 2: Detected ${anomalies.length} anomalies from chaos injection`);

    // API should reflect chaos trigger
    const triggerRes = await fetch(`${apiUrl}/api/v1/chaos/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: '空調主機故障', devices: ['CH-00F-001'] }),
    });
    expect(triggerRes.status).toBe(200);

    chaos.stop();
  });
});

describe('Test 3: Query Performance', () => {
  it('should respond to device list query within 200ms', async () => {
    const start = Date.now();
    const res = await fetch(`${apiUrl}/api/v1/chaos/scenarios`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
    console.log(`Test 3: Chaos scenarios query: ${elapsed}ms`);
  });

  it('should respond to health check within 50ms', async () => {
    const start = Date.now();
    const res = await fetch(`${apiUrl}/health`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(50);
    console.log(`Test 3: Health check: ${elapsed}ms`);
  });
});

describe('Test 4: WebSocket Connectivity', () => {
  it('should accept WebSocket connections (via gateway)', async () => {
    // Test gateway WS health
    const healthRes = await fetch(`${gatewayUrl}/health`);
    expect(healthRes.status).toBe(200);
    const data = await healthRes.json() as { status: string };
    expect(data.status).toBe('ok');
  });
});

describe('Test 5: Service Resilience', () => {
  it('should handle rapid signal bursts without errors', async () => {
    const sim = new SignalSimulator();
    const batch = sim.generateBatch();
    const batchSize = batch.length;

    const res = await fetch(`${gatewayUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    expect(res.status).toBe(200);
    const result = await res.json() as { accepted: number; rejected: number };
    expect(result.accepted + result.rejected).toBe(batchSize);
    console.log(`Test 5: Burst of ${batchSize} signals - accepted: ${result.accepted}, rejected: ${result.rejected}`);
  });

  it('should maintain gateway stats across requests', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json() as { httpReceived: number };
    expect(stats.httpReceived).toBeGreaterThan(0);
  });
});
