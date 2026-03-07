export type Severity = 'info' | 'warning' | 'critical';
export type AnomalyType = 'threshold' | 'trend' | 'offline' | 'performance' | 'cascade' | 'maintenance';
export type FaultType = 'signal_spike' | 'signal_drop' | 'drift' | 'offline' | 'intermittent';

export interface AnomalyEvent {
  id: string;
  deviceId: string;
  anomalyType: AnomalyType;
  severity: Severity;
  message: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;
  detectedAt: number;
  resolvedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ThresholdRule {
  deviceType: string;
  metricName: string;
  warningMin?: number;
  warningMax?: number;
  criticalMin?: number;
  criticalMax?: number;
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
