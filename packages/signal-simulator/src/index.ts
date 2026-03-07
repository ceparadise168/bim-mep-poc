export { SignalSimulator } from './simulator.js';
export type { SimulatorOptions } from './simulator.js';
export type { SimDevice } from './device-factory.js';
export { createDevices, generateSignal } from './device-factory.js';
export { deviceConfigs } from './device-configs.js';
export { GatewayBatchPublisher } from './gateway-batch-publisher.js';
export type {
  DeviceMetadata,
  DeviceType,
  SignalEnvelope,
  SignalQuality,
  Protocol,
  TimeContext,
  DeviceState,
  DeviceTypeConfig,
} from './types.js';

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const { SignalSimulator } = await import('./simulator.js');
  const sim = new SignalSimulator({ speedMultiplier: 1 });

  console.log(`Signal Simulator started with ${sim.getDeviceCount()} devices`);

  let lastCount = 0;
  const statsInterval = setInterval(() => {
    const count = sim.getSignalCount();
    const rate = count - lastCount;
    console.log(`Signals: ${count} total, ${rate}/s`);
    lastCount = count;
  }, 1000);

  sim.start();

  process.on('SIGINT', () => {
    sim.stop();
    clearInterval(statsInterval);
    console.log(`\nStopped. Total signals: ${sim.getSignalCount()}`);
    process.exit(0);
  });
}
