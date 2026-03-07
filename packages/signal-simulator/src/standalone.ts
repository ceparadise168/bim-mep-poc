import Redis from 'ioredis';
import { SignalSimulator } from './simulator.js';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const STREAM_KEY = 'signals:raw';

const sim = new SignalSimulator({
  speedMultiplier: 1,
  onSignal: async (signal) => {
    try {
      await redis.xadd(STREAM_KEY, 'MAXLEN', '~', '100000', '*', 'data', JSON.stringify(signal));
    } catch (err) {
      console.error('Failed to publish signal:', err);
    }
  },
});

console.log(`Signal Simulator starting with ${sim.getDeviceCount()} devices...`);
sim.start();

let lastCount = 0;
setInterval(() => {
  const count = sim.getSignalCount();
  console.log(`[Simulator] Signals: ${count} total, ${count - lastCount}/s`);
  lastCount = count;
}, 5000);

process.on('SIGINT', () => {
  sim.stop();
  redis.quit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  sim.stop();
  redis.quit();
  process.exit(0);
});
