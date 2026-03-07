import Redis from 'ioredis';
import { GatewayServer } from './gateway-server.js';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const gateway = new GatewayServer({ port: 3100, redis });

gateway.start().then(address => {
  console.log(`[Ingestion Gateway] Listening on ${address}`);
}).catch(err => {
  console.error('Failed to start gateway:', err);
  process.exit(1);
});

process.on('SIGINT', () => { gateway.stop(); process.exit(0); });
process.on('SIGTERM', () => { gateway.stop(); process.exit(0); });
