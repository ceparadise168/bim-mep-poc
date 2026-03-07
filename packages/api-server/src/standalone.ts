import pg from 'pg';
import { ApiServer } from './api-server.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bim_mep',
});

const server = new ApiServer({
  port: 3000,
  dbPool: pool,
  redisUrl: process.env.REDIS_URL,
});

server.start().then(address => {
  console.log(`[API Server] Listening on ${address}`);
  console.log(`[API Server] Swagger docs: ${address}/docs`);
}).catch(err => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});

process.on('SIGINT', async () => { await server.stop(); await pool.end(); process.exit(0); });
process.on('SIGTERM', async () => { await server.stop(); await pool.end(); process.exit(0); });
