import { EventEmitter } from 'events';
import { deviceConfigs } from './device-configs.js';
import { createDevices, generateSignal, SimDevice } from './device-factory.js';
import { TimeContext, SignalEnvelope } from './types.js';

export interface SimulatorOptions {
  speedMultiplier?: number; // 1 = real-time, 10 = 10x faster
  onSignal?: (signal: SignalEnvelope) => void;
}

export class SignalSimulator extends EventEmitter {
  private devices: SimDevice[];
  private running = false;
  private startTime = 0;
  private timers: NodeJS.Timeout[] = [];
  private signalCount = 0;
  private speedMultiplier: number;

  constructor(options: SimulatorOptions = {}) {
    super();
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.devices = createDevices(deviceConfigs);
    if (options.onSignal) {
      this.on('signal', options.onSignal);
    }
  }

  getDevices(): SimDevice[] {
    return this.devices;
  }

  getDeviceCount(): number {
    return this.devices.length;
  }

  getSignalCount(): number {
    return this.signalCount;
  }

  getTimeContext(): TimeContext {
    const now = Date.now();
    const elapsed = (now - this.startTime) * this.speedMultiplier;
    const simTime = new Date(now);
    return {
      now,
      hourOfDay: simTime.getHours() + simTime.getMinutes() / 60,
      dayOfYear: Math.floor((now - new Date(simTime.getFullYear(), 0, 0).getTime()) / 86400000),
      elapsedSeconds: elapsed / 1000,
      isSummer: simTime.getMonth() >= 4 && simTime.getMonth() <= 9,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.signalCount = 0;

    // Group devices by interval for efficient scheduling
    const intervalGroups = new Map<number, SimDevice[]>();
    for (const dev of this.devices) {
      const interval = dev.intervalMs;
      if (!intervalGroups.has(interval)) {
        intervalGroups.set(interval, []);
      }
      intervalGroups.get(interval)!.push(dev);
    }

    for (const [intervalMs, devicesInGroup] of intervalGroups) {
      const timer = setInterval(() => {
        if (!this.running) return;
        const ctx = this.getTimeContext();
        for (const device of devicesInGroup) {
          const signal = generateSignal(device, ctx);
          this.signalCount++;
          this.emit('signal', signal);
        }
      }, intervalMs / this.speedMultiplier);

      this.timers.push(timer);
    }

    this.emit('started', { deviceCount: this.devices.length });
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.emit('stopped', { signalCount: this.signalCount });
  }

  /** Generate a single batch of signals for all devices (useful for testing) */
  generateBatch(): SignalEnvelope[] {
    const ctx = this.getTimeContext();
    return this.devices.map(device => {
      const signal = generateSignal(device, ctx);
      this.signalCount++;
      return signal;
    });
  }
}
