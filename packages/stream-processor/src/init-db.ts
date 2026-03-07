import pg from 'pg';
import { CREATE_TABLES_SQL, CREATE_HYPERTABLES_SQL, RETENTION_POLICY_SQL } from './db-schema.js';

const { Pool } = pg;

async function initDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bim_mep',
  });

  console.log('Initializing database schema...');

  try {
    await pool.query(CREATE_TABLES_SQL);
    console.log('Tables created.');

    try {
      await pool.query(CREATE_HYPERTABLES_SQL);
      console.log('Hypertables created.');
    } catch (e: unknown) {
      console.log('Hypertables skipped (TimescaleDB extension may not be available):', (e as Error).message);
    }

    try {
      await pool.query(RETENTION_POLICY_SQL);
      console.log('Retention policy set.');
    } catch (e: unknown) {
      console.log('Retention policy skipped:', (e as Error).message);
    }

    console.log('Database initialized successfully.');
  } finally {
    await pool.end();
  }
}

initDb().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
