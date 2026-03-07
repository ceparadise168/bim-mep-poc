import pg from 'pg';
import { seedDevices } from '../packages/stream-processor/src/device-seeder.js';

const { Pool } = pg;

async function registerDevices() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bim_mep',
  });

  const seeded = await seedDevices(pool);
  console.log(`Registering ${seeded} devices...`);

  const result = await pool.query('SELECT COUNT(*) FROM devices');
  console.log(`Registered ${result.rows[0].count} devices in database.`);
  await pool.end();
}

registerDevices().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
