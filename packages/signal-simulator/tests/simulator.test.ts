import { describe, it, expect, vi, afterEach } from 'vitest';
import { SignalSimulator } from '../src/simulator.js';

describe('SignalSimulator', () => {
  let sim: SignalSimulator;

  afterEach(() => {
    sim?.stop();
  });

  it('should create 474 devices', () => {
    sim = new SignalSimulator();
    expect(sim.getDeviceCount()).toBe(474);
  });

  it('should generate a batch of signals for all devices', () => {
    sim = new SignalSimulator();
    const batch = sim.generateBatch();
    expect(batch.length).toBe(474);
    expect(sim.getSignalCount()).toBe(474);
  });

  it('should emit signals when started', async () => {
    sim = new SignalSimulator({ speedMultiplier: 10 });
    const signals: unknown[] = [];
    sim.on('signal', (s) => signals.push(s));
    sim.start();
    await new Promise(r => setTimeout(r, 200));
    sim.stop();
    expect(signals.length).toBeGreaterThan(0);
  });

  it('should produce > 500 signals per second at 10x speed', async () => {
    sim = new SignalSimulator({ speedMultiplier: 10 });
    sim.start();
    await new Promise(r => setTimeout(r, 1100));
    sim.stop();
    // At 10x speed, 1 second = 10 simulated seconds
    // We need 500 signals per real second from 474 devices with mixed intervals
    // 1s interval devices: 4+48+8 = 60 devices => 600 signals/s at 10x
    // Plus 2s, 3s, 5s interval devices at 10x
    expect(sim.getSignalCount()).toBeGreaterThan(500);
  });

  it('should stop cleanly', () => {
    sim = new SignalSimulator();
    sim.start();
    sim.stop();
    const count = sim.getSignalCount();
    // Wait a bit and verify no more signals
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(sim.getSignalCount()).toBe(count);
        resolve();
      }, 200);
    });
  });

  it('should have time context with valid fields', () => {
    sim = new SignalSimulator();
    const ctx = sim.getTimeContext();
    expect(ctx.now).toBeGreaterThan(0);
    expect(ctx.hourOfDay).toBeGreaterThanOrEqual(0);
    expect(ctx.hourOfDay).toBeLessThan(24);
    expect(ctx.dayOfYear).toBeGreaterThan(0);
    expect(ctx.dayOfYear).toBeLessThanOrEqual(366);
    expect(typeof ctx.isSummer).toBe('boolean');
  });
});
