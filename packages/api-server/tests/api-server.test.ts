import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiServer } from '../src/api-server.js';
import pg from 'pg';

const { Pool } = pg;

let server: ApiServer;
let pool: pg.Pool;
let baseUrl: string;
let hasDb = false;
const publishedChaosCommands: Array<{ scenario: string; devices: string[] }> = [];

beforeAll(async () => {
  // Try to connect to DB. If not available, test route structure only.
  pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/bim_mep',
    max: 2,
    connectionTimeoutMillis: 2000,
  });

  try {
    await pool.query('SELECT 1');
    hasDb = true;
  } catch {
    // DB not available — will skip DB-dependent tests
    pool = new Pool({ connectionString: 'postgresql://localhost:5432/nonexistent', max: 1 });
  }

  server = new ApiServer({
    port: 0,
    dbPool: pool,
    chaosCommandPublisher: {
      async publish(command) {
        publishedChaosCommands.push(command);
      },
      async close() {},
    },
  });
  await server.ready();
});

afterAll(async () => {
  await server.stop();
});

describe('API Server Routes', () => {
  it('should respond to health check', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.status).toBe('ok');
  });

  it('should serve Swagger docs', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { openapi: string; info: { title: string } };
    expect(data.openapi).toMatch(/^3\./);
    expect(data.info.title).toBe('BIM MEP IoT API');
  });

  it('should list chaos scenarios', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/api/v1/chaos/scenarios' });
    expect(res.statusCode).toBe(200);
    const data = res.json() as unknown[];
    expect(data.length).toBe(5);
  });

  it('should trigger chaos scenario', async () => {
    const res = await server.getApp().inject({
      method: 'POST',
      url: '/api/v1/chaos/trigger',
      payload: { scenario: '空調主機故障', devices: ['CH-00F-001'] },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { triggered: boolean };
    expect(data.triggered).toBe(true);
    expect(publishedChaosCommands).toContainEqual({
      scenario: '空調主機故障',
      devices: ['CH-00F-001'],
    });
  });

  it('should reject unknown chaos scenario', async () => {
    const res = await server.getApp().inject({
      method: 'POST',
      url: '/api/v1/chaos/trigger',
      payload: { scenario: 'nonexistent', devices: ['CH-00F-001'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should have device routes registered', async () => {
    // This will either return data (if DB exists) or error (if not) — either way route exists
    const res = await server.getApp().inject({ method: 'GET', url: '/api/v1/devices' });
    // 200 with DB, 500 without — just check route exists (not 404)
    expect(res.statusCode).not.toBe(404);
  });

  it('should have anomalies route registered', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/api/v1/anomalies' });
    expect(res.statusCode).not.toBe(404);
  });

  it('should have building dashboard route registered', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/api/v1/building/dashboard' });
    expect(res.statusCode).not.toBe(404);
  });

  it('should have analytics routes registered', async () => {
    const resEnergy = await server.getApp().inject({ method: 'GET', url: '/api/v1/analytics/energy' });
    const resComfort = await server.getApp().inject({ method: 'GET', url: '/api/v1/analytics/comfort' });
    expect(resEnergy.statusCode).not.toBe(404);
    expect(resComfort.statusCode).not.toBe(404);
  });

  it('should have floor overview route registered', async () => {
    const res = await server.getApp().inject({ method: 'GET', url: '/api/v1/floors/3/overview' });
    expect(res.statusCode).not.toBe(404);
  });
});
