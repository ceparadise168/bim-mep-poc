export type Severity = 'info' | 'warning' | 'critical';
export type AnomalyType = 'threshold' | 'trend' | 'offline' | 'performance' | 'cascade' | 'maintenance';
export type AlertState = 'pending' | 'firing' | 'resolved';
export type FaultType = 'signal_spike' | 'signal_drop' | 'drift' | 'offline' | 'intermittent';

export interface AnomalyEvent {
  id: string;
  fingerprint: string;
  deviceId: string;
  anomalyType: AnomalyType;
  severity: Severity;
  state: AlertState;
  message: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;
  detectedAt: number;
  firedAt?: number;
  resolvedAt?: number;
  lastEvalAt: number;
  occurrenceCount: number;
  metadata?: Record<string, unknown>;
}

export interface ThresholdRule {
  deviceType: string;
  metricName: string;
  warningMin?: number;
  warningMax?: number;
  criticalMin?: number;
  criticalMax?: number;
  // Hysteresis: resolve thresholds (values must return past these to resolve)
  resolveMin?: number;
  resolveMax?: number;
}

export interface ChaosScenario {
  name: string;
  description: string;
  trigger: 'random' | 'scheduled' | 'manual';
  probability?: number;
  affectedDevices: string[];
  faultType: FaultType;
  duration: { min: number; max: number };
  cascadeRules?: CascadeRule[];
}

export interface CascadeRule {
  sourcePattern: string;
  targetPattern: string;
  delay: number; // seconds
  effect: {
    metricName: string;
    modifier: 'spike' | 'drop' | 'drift';
    magnitude: number;
  };
}

export interface DeviceHeartbeat {
  deviceId: string;
  lastSeen: number;
  timeoutMs: number;
}
