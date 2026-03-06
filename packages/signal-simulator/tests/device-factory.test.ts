import { describe, it, expect } from 'vitest';
import { createDevices, generateSignal } from '../src/device-factory.js';
import { deviceConfigs } from '../src/device-configs.js';
import { TimeContext } from '../src/types.js';

describe('createDevices', () => {
  const devices = createDevices(deviceConfigs);

  it('should create at least 470 devices', () => {
    expect(devices.length).toBeGreaterThanOrEqual(470);
  });

  it('should create correct number of each type', () => {
    const counts = new Map<string, number>();
    for (const d of devices) {
      counts.set(d.metadata.deviceType, (counts.get(d.metadata.deviceType) || 0) + 1);
    }
    expect(counts.get('chiller')).toBe(4);
    expect(counts.get('ahu')).toBe(24);
    expect(counts.get('vfd')).toBe(48);
    expect(counts.get('power-panel')).toBe(12);
    expect(counts.get('ups')).toBe(4);
    expect(counts.get('generator')).toBe(2);
    expect(counts.get('fire-pump')).toBe(6);
    expect(counts.get('elevator')).toBe(8);
    expect(counts.get('lighting-controller')).toBe(120);
    expect(counts.get('temp-humidity-sensor')).toBe(200);
    expect(counts.get('water-meter')).toBe(16);
    expect(counts.get('air-quality-sensor')).toBe(30);
  });

  it('should assign unique device IDs', () => {
    const ids = new Set(devices.map(d => d.metadata.deviceId));
    expect(ids.size).toBe(devices.length);
  });

  it('should include complete metadata for each device', () => {
    for (const d of devices) {
      expect(d.metadata.deviceId).toBeTruthy();
      expect(d.metadata.deviceType).toBeTruthy();
      expect(d.metadata.floor).toBeDefined();
      expect(d.metadata.zone).toBeTruthy();
      expect(d.metadata.vendor.name).toBeTruthy();
      expect(d.metadata.vendor.model).toBeTruthy();
      expect(d.metadata.vendor.protocol).toBeTruthy();
      expect(d.metadata.vendor.firmwareVersion).toBeTruthy();
      expect(d.metadata.geometry.position).toBeDefined();
      expect(d.metadata.geometry.dimensions).toBeDefined();
      expect(d.metadata.geometry.bimModelRef).toBeTruthy();
    }
  });

  it('should use at least 5 different protocols', () => {
    const protocols = new Set(devices.map(d => d.metadata.vendor.protocol));
    expect(protocols.size).toBeGreaterThanOrEqual(5);
  });
});

describe('generateSignal', () => {
  const devices = createDevices(deviceConfigs);
  const ctx: TimeContext = {
    now: Date.now(),
    hourOfDay: 14,
    dayOfYear: 182,
    elapsedSeconds: 3600,
    isSummer: true,
  };

  it('should generate valid signal envelopes', () => {
    for (const device of devices.slice(0, 50)) {
      const signal = generateSignal(device, ctx);
      expect(signal.signalId).toBeTruthy();
      expect(signal.deviceId).toBe(device.metadata.deviceId);
      expect(signal.timestamp).toBe(ctx.now);
      expect(signal.protocol).toBe(device.metadata.vendor.protocol);
      expect(signal.quality).toBe('good');
      expect(typeof signal.payload).toBe('object');
      expect(Object.keys(signal.payload).length).toBeGreaterThan(0);
    }
  });

  it('should generate physically reasonable chiller values', () => {
    const chillerDevices = devices.filter(d => d.metadata.deviceType === 'chiller');
    for (const device of chillerDevices) {
      const signal = generateSignal(device, ctx);
      const { refrigerantTemp, compressorCurrent, cop } = signal.payload as Record<string, number>;
      expect(refrigerantTemp).toBeGreaterThanOrEqual(4);
      expect(refrigerantTemp).toBeLessThanOrEqual(12);
      expect(compressorCurrent).toBeGreaterThanOrEqual(15);
      expect(compressorCurrent).toBeLessThanOrEqual(120);
      expect(cop).toBeGreaterThanOrEqual(2);
      expect(cop).toBeLessThanOrEqual(6);
    }
  });

  it('should generate physically reasonable temperature values', () => {
    const tempDevices = devices.filter(d => d.metadata.deviceType === 'temp-humidity-sensor');
    for (const device of tempDevices.slice(0, 20)) {
      const signal = generateSignal(device, ctx);
      const { temperature, humidity } = signal.payload as Record<string, number>;
      expect(temperature).toBeGreaterThanOrEqual(16);
      expect(temperature).toBeLessThanOrEqual(35);
      expect(humidity).toBeGreaterThanOrEqual(30);
      expect(humidity).toBeLessThanOrEqual(85);
    }
  });
});
