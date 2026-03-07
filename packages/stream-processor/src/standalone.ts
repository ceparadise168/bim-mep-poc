import Redis from 'ioredis';
import pg from 'pg';
import { StreamProcessor } from './processor.js';
import { CREATE_TABLES_SQL } from './db-schema.js';

const { Pool } = pg;

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bim_mep',
});

const processor = new StreamProcessor({ redis, dbPool: pool });

processor.on('batch', (info: { count: number; total: number }) => {
  console.log(`[Stream Processor] Processed batch: ${info.count} signals (total: ${info.total})`);
});

processor.on('error', (err: Error) => {
  console.error('[Stream Processor] Error:', err.message);
});

console.log('[Stream Processor] Starting...');
processor.start().catch(err => {
  console.error('Failed to start processor:', err);
});

process.on('SIGINT', async () => {
  await processor.close();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await processor.close();
  await pool.end();
  process.exit(0);
});
