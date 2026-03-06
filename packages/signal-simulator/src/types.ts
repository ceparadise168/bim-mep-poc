export type DeviceType =
  | 'chiller'
  | 'ahu'
  | 'vfd'
  | 'power-panel'
  | 'ups'
  | 'generator'
  | 'fire-pump'
  | 'elevator'
  | 'lighting-controller'
  | 'temp-humidity-sensor'
  | 'water-meter'
  | 'air-quality-sensor';

export type Protocol = 'modbus-tcp' | 'bacnet-ip' | 'mqtt' | 'opcua' | 'restful';

export type SignalQuality = 'good' | 'uncertain' | 'bad';

export interface DeviceMetadata {
  deviceId: string;
  deviceType: DeviceType;
  floor: number;
  zone: string;
  vendor: {
    name: string;
    model: string;
    protocol: Protocol;
    firmwareVersion: string;
  };
  installDate: string;
  warrantyExpiry: string;
  maintenanceSchedule: string;
  geometry: {
    position: { x: number; y: number; z: number };
    dimensions: { width: number; height: number; depth: number };
    rotation: number;
    bimModelRef: string;
  };
}

export interface SignalEnvelope {
  signalId: string;
  deviceId: string;
  timestamp: number;
  protocol: string;
  payload: Record<string, number | string | boolean>;
  quality: SignalQuality;
  metadata?: Record<string, unknown>;
}

export interface DeviceSimulator {
  metadata: DeviceMetadata;
  intervalMs: number;
  generateSignal(timeContext: TimeContext): SignalEnvelope;
}

export interface TimeContext {
  now: number;
  hourOfDay: number;
  dayOfYear: number;
  elapsedSeconds: number;
  isSummer: boolean;
}

export interface DeviceTypeConfig {
  type: DeviceType;
  count: number;
  intervalMs: number;
  vendors: VendorInfo[];
  zones: string[];
  generatePayload: (device: DeviceMetadata, ctx: TimeContext, state: DeviceState) => Record<string, number | string | boolean>;
  getMetricRanges: () => Record<string, { min: number; max: number; unit: string }>;
}

export interface VendorInfo {
  name: string;
  model: string;
  protocol: Protocol;
  firmwareVersion: string;
}

export interface DeviceState {
  isRunning: boolean;
  rampUpProgress: number; // 0-1, for startup ramp
  agingFactor: number;    // 0-1, increases over time
  lastValues: Record<string, number>;
}
