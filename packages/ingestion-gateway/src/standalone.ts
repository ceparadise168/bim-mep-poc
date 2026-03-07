import Redis from 'ioredis';
import { GatewayServer } from './gateway-server.js';
import { MqttBroker } from './mqtt-broker.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const gatewayRedis = new Redis(redisUrl);
const mqttRedis = new Redis(redisUrl);
const gateway = new GatewayServer({ port: 3100, redis: gatewayRedis });
const mqttBroker = new MqttBroker({
  port: parseInt(process.env.MQTT_PORT ?? '1883', 10),
  redis: mqttRedis,
});

Promise.all([gateway.start(), mqttBroker.start()]).then(([address]) => {
  console.log(`[Ingestion Gateway] HTTP listening on ${address}`);
  console.log(`[Ingestion Gateway] MQTT listening on port ${process.env.MQTT_PORT ?? '1883'}`);
}).catch(err => {
  console.error('Failed to start gateway:', err);
  process.exit(1);
});

async function shutdown() {
  await mqttBroker.stop();
  await gateway.stop();
  process.exit(0);
}

process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
