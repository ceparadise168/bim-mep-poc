import { SignalSimulator } from './simulator.js';
import { GatewayBatchPublisher } from './gateway-batch-publisher.js';

const gatewayUrl = process.env.INGESTION_GATEWAY_URL ?? 'http://localhost:3100';
const flushIntervalMs = parseInt(process.env.INGEST_FLUSH_INTERVAL_MS ?? '250', 10);
const publisher = new GatewayBatchPublisher({
  maxBatchSize: parseInt(process.env.INGEST_BATCH_SIZE ?? '200', 10),
  transport: {
    async publishBatch(signals) {
      const response = await fetch(`${gatewayUrl}/api/v1/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signals),
      });

      if (!response.ok) {
        throw new Error(`Gateway publish failed with status ${response.status}`);
      }
    },
  },
});

const sim = new SignalSimulator({
  speedMultiplier: 1,
  onSignal: (signal) => {
    publisher.enqueue(signal);
  },
});

const flushTimer = setInterval(async () => {
  try {
    await publisher.flush();
  } catch (error) {
    console.error('[Simulator] Failed to flush signal batch:', (error as Error).message);
  }
}, flushIntervalMs);

console.log(`Signal Simulator starting with ${sim.getDeviceCount()} devices...`);
sim.start();

let lastCount = 0;
setInterval(() => {
  const count = sim.getSignalCount();
  console.log(`[Simulator] Signals: ${count} total, ${count - lastCount}/s`);
  lastCount = count;
}, 5000);

async function shutdown() {
  sim.stop();
  clearInterval(flushTimer);
  while (publisher.getQueueSize() > 0) {
    try {
      await publisher.flush();
    } catch (error) {
      console.error('[Simulator] Failed to flush remaining signals:', (error as Error).message);
      break;
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
