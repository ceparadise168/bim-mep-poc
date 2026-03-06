import { v4 as uuidv4 } from 'uuid';
import { DeviceMetadata, DeviceState, DeviceTypeConfig, SignalEnvelope, TimeContext } from './types.js';

const FLOOR_HEIGHT = 4.2; // meters per floor

function generateDeviceId(type: string, floor: number, index: number): string {
  const typePrefix: Record<string, string> = {
    'chiller': 'CH',
    'ahu': 'AHU',
    'vfd': 'VFD',
    'power-panel': 'PP',
    'ups': 'UPS',
    'generator': 'GEN',
    'fire-pump': 'FP',
    'elevator': 'ELV',
    'lighting-controller': 'LT',
    'temp-humidity-sensor': 'TH',
    'water-meter': 'WM',
    'air-quality-sensor': 'AQ',
  };
  const prefix = typePrefix[type] || type.toUpperCase().slice(0, 3);
  const floorStr = floor.toString().padStart(2, '0');
  const idxStr = (index + 1).toString().padStart(3, '0');
  return `${prefix}-${floorStr}F-${idxStr}`;
}

export interface SimDevice {
  metadata: DeviceMetadata;
  state: DeviceState;
  config: DeviceTypeConfig;
  intervalMs: number;
  lastEmitTime: number;
}

export function createDevices(configs: DeviceTypeConfig[]): SimDevice[] {
  const devices: SimDevice[] = [];

  for (const config of configs) {
    for (let i = 0; i < config.count; i++) {
      const floor = config.type === 'chiller' || config.type === 'generator'
        ? 0 // basement
        : config.type === 'ups' || config.type === 'power-panel'
          ? Math.floor(i / Math.max(1, Math.ceil(config.count / 3))) * 4 + 1
          : (i % 12) + 1;

      const vendorIdx = i % config.vendors.length;
      const vendor = config.vendors[vendorIdx];
      const zone = config.zones[i % config.zones.length];

      const metadata: DeviceMetadata = {
        deviceId: generateDeviceId(config.type, floor, i),
        deviceType: config.type,
        floor,
        zone,
        vendor: { ...vendor },
        installDate: '2022-06-15',
        warrantyExpiry: '2027-06-15',
        maintenanceSchedule: '0 0 1 */3 *', // every 3 months
        geometry: {
          position: {
            x: 5 + (i % 10) * 3,
            y: floor * FLOOR_HEIGHT,
            z: 5 + Math.floor(i / 10) * 3,
          },
          dimensions: getDimensions(config.type),
          rotation: (i * 90) % 360,
          bimModelRef: `IFC-${config.type.toUpperCase()}-${(i + 1).toString().padStart(4, '0')}`,
        },
      };

      const state: DeviceState = {
        isRunning: config.type !== 'generator' && config.type !== 'fire-pump',
        rampUpProgress: 1,
        agingFactor: Math.random() * 0.1,
        lastValues: {},
      };

      devices.push({ metadata, state, config, intervalMs: config.intervalMs, lastEmitTime: 0 });
    }
  }

  return devices;
}

function getDimensions(type: string): { width: number; height: number; depth: number } {
  const dims: Record<string, { width: number; height: number; depth: number }> = {
    'chiller': { width: 4, height: 2.5, depth: 1.5 },
    'ahu': { width: 3, height: 2, depth: 1.2 },
    'vfd': { width: 0.6, height: 1.2, depth: 0.4 },
    'power-panel': { width: 2, height: 2.2, depth: 0.8 },
    'ups': { width: 1.5, height: 2, depth: 0.8 },
    'generator': { width: 5, height: 2.5, depth: 2 },
    'fire-pump': { width: 2, height: 1.5, depth: 1 },
    'elevator': { width: 2.1, height: 2.8, depth: 1.8 },
    'lighting-controller': { width: 0.3, height: 0.3, depth: 0.1 },
    'temp-humidity-sensor': { width: 0.1, height: 0.1, depth: 0.05 },
    'water-meter': { width: 0.3, height: 0.2, depth: 0.2 },
    'air-quality-sensor': { width: 0.15, height: 0.15, depth: 0.08 },
  };
  return dims[type] || { width: 0.5, height: 0.5, depth: 0.3 };
}

export function generateSignal(device: SimDevice, ctx: TimeContext): SignalEnvelope {
  const payload = device.config.generatePayload(device.metadata, ctx, device.state);
  return {
    signalId: uuidv4(),
    deviceId: device.metadata.deviceId,
    timestamp: ctx.now,
    protocol: device.metadata.vendor.protocol,
    payload,
    quality: 'good',
    metadata: {
      floor: device.metadata.floor,
      zone: device.metadata.zone,
      deviceType: device.metadata.deviceType,
    },
  };
}
