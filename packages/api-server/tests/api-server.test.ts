import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiServer } from '../src/api-server.js';
import pg from 'pg';

const { Pool } = pg;

let server: ApiServer;
let pool: pg.Pool;
let baseUrl: string;
let hasDb = false;

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

  server = new ApiServer({ port: 0, dbPool: pool });
  const address = await server.start();
  const addr = server.getApp().server.address();
  if (typeof addr === 'object' && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    baseUrl = address.replace('[::]', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');
  }
});

afterAll(async () => {
  await server.stop();
});

describe('API Server Routes', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should serve Swagger docs', async () => {
    const res = await fetch(`${baseUrl}/docs/json`);
    expect(res.status).toBe(200);
    const data = await res.json() as { openapi: string; info: { title: string } };
    expect(data.openapi).toMatch(/^3\./);
    expect(data.info.title).toBe('BIM MEP IoT API');
  });

  it('should list chaos scenarios', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chaos/scenarios`);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data.length).toBe(5);
  });

  it('should trigger chaos scenario', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chaos/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: '空調主機故障', devices: ['CH-00F-001'] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { triggered: boolean };
    expect(data.triggered).toBe(true);
  });

  it('should reject unknown chaos scenario', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chaos/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'nonexistent', devices: ['CH-00F-001'] }),
    });
    expect(res.status).toBe(400);
  });

  it('should have device routes registered', async () => {
    // This will either return data (if DB exists) or error (if not) — either way route exists
    const res = await fetch(`${baseUrl}/api/v1/devices`);
    // 200 with DB, 500 without — just check route exists (not 404)
    expect(res.status).not.toBe(404);
  });

  it('should have anomalies route registered', async () => {
    const res = await fetch(`${baseUrl}/api/v1/anomalies`);
    expect(res.status).not.toBe(404);
  });

  it('should have building dashboard route registered', async () => {
    const res = await fetch(`${baseUrl}/api/v1/building/dashboard`);
    expect(res.status).not.toBe(404);
  });

  it('should have analytics routes registered', async () => {
    const resEnergy = await fetch(`${baseUrl}/api/v1/analytics/energy`);
    const resComfort = await fetch(`${baseUrl}/api/v1/analytics/comfort`);
    expect(resEnergy.status).not.toBe(404);
    expect(resComfort.status).not.toBe(404);
  });

  it('should have floor overview route registered', async () => {
    const res = await fetch(`${baseUrl}/api/v1/floors/3/overview`);
    expect(res.status).not.toBe(404);
  });
});
