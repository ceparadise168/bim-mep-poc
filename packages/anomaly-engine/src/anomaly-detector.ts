import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { AnomalyEvent, AnomalyType, Severity, ThresholdRule, DeviceHeartbeat } from './types.js';
import { defaultThresholdRules } from './threshold-rules.js';

export interface SignalInput {
  deviceId: string;
  deviceType: string;
  timestamp: number;
  payload: Record<string, number | string | boolean>;
}

export class AnomalyDetector extends EventEmitter {
  private thresholdRules: ThresholdRule[];
  private heartbeats = new Map<string, DeviceHeartbeat>();
  private heartbeatTimeouts = new Map<string, number>(); // deviceType -> timeout ms
  private movingAverages = new Map<string, { values: number[]; mean: number; stddev: number }>();
  private performanceBaselines = new Map<string, number>();
  private activeAnomalies = new Map<string, AnomalyEvent>();
  private anomalyHistory: AnomalyEvent[] = [];
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(rules?: ThresholdRule[]) {
    super();
    this.thresholdRules = rules ?? defaultThresholdRules;
    this.heartbeatTimeouts.set('chiller', 5000);
    this.heartbeatTimeouts.set('ahu', 10000);
    this.heartbeatTimeouts.set('vfd', 5000);
    this.heartbeatTimeouts.set('power-panel', 15000);
    this.heartbeatTimeouts.set('ups', 10000);
    this.heartbeatTimeouts.set('generator', 15000);
    this.heartbeatTimeouts.set('fire-pump', 30000);
    this.heartbeatTimeouts.set('elevator', 5000);
    this.heartbeatTimeouts.set('lighting-controller', 90000);
    this.heartbeatTimeouts.set('temp-humidity-sensor', 30000);
    this.heartbeatTimeouts.set('water-meter', 45000);
    this.heartbeatTimeouts.set('air-quality-sensor', 30000);
  }

  processSignal(input: SignalInput): AnomalyEvent[] {
    const anomalies: AnomalyEvent[] = [];

    // Update heartbeat
    const timeout = this.heartbeatTimeouts.get(input.deviceType) ?? 30000;
    this.heartbeats.set(input.deviceId, {
      deviceId: input.deviceId,
      lastSeen: input.timestamp,
      timeoutMs: timeout,
    });

    // Resolve offline anomaly if device was marked offline
    const offlineKey = `offline:${input.deviceId}`;
    if (this.activeAnomalies.has(offlineKey)) {
      const resolved = this.activeAnomalies.get(offlineKey)!;
      resolved.resolvedAt = input.timestamp;
      this.activeAnomalies.delete(offlineKey);
      this.emit('resolved', resolved);
    }

    // Check thresholds
    for (const [metricName, value] of Object.entries(input.payload)) {
      if (typeof value !== 'number') continue;

      const thresholdAnomalies = this.checkThresholds(input, metricName, value);
      anomalies.push(...thresholdAnomalies);

      const trendAnomaly = this.checkTrend(input, metricName, value);
      if (trendAnomaly) anomalies.push(trendAnomaly);

      // Performance check (COP for chillers)
      if (metricName === 'cop' && input.deviceType === 'chiller') {
        const perfAnomaly = this.checkPerformance(input, metricName, value);
        if (perfAnomaly) anomalies.push(perfAnomaly);
      }
    }

    for (const anomaly of anomalies) {
      this.activeAnomalies.set(`${anomaly.anomalyType}:${anomaly.deviceId}:${anomaly.metricName}`, anomaly);
      this.anomalyHistory.push(anomaly);
      this.emit('anomaly', anomaly);
    }

    return anomalies;
  }

  private checkThresholds(input: SignalInput, metricName: string, value: number): AnomalyEvent[] {
    const anomalies: AnomalyEvent[] = [];
    const rules = this.thresholdRules.filter(
      r => r.deviceType === input.deviceType && r.metricName === metricName,
    );

    for (const rule of rules) {
      let severity: Severity | null = null;
      let message = '';

      if (rule.criticalMax !== undefined && value > rule.criticalMax) {
        severity = 'critical';
        message = `${metricName} = ${value} exceeds critical max ${rule.criticalMax}`;
      } else if (rule.criticalMin !== undefined && value < rule.criticalMin) {
        severity = 'critical';
        message = `${metricName} = ${value} below critical min ${rule.criticalMin}`;
      } else if (rule.warningMax !== undefined && value > rule.warningMax) {
        severity = 'warning';
        message = `${metricName} = ${value} exceeds warning max ${rule.warningMax}`;
      } else if (rule.warningMin !== undefined && value < rule.warningMin) {
        severity = 'warning';
        message = `${metricName} = ${value} below warning min ${rule.warningMin}`;
      }

      if (severity) {
        anomalies.push({
          id: uuidv4(),
          deviceId: input.deviceId,
          anomalyType: 'threshold',
          severity,
          message,
          metricName,
          metricValue: value,
          threshold: severity === 'critical'
            ? (rule.criticalMax !== undefined && value > rule.criticalMax ? rule.criticalMax : rule.criticalMin)
            : (rule.warningMax !== undefined && value > rule.warningMax ? rule.warningMax : rule.warningMin),
          detectedAt: input.timestamp,
        });
      }
    }
    return anomalies;
  }

  private checkTrend(input: SignalInput, metricName: string, value: number): AnomalyEvent | null {
    const key = `${input.deviceId}:${metricName}`;
    let ma = this.movingAverages.get(key);
    if (!ma) {
      ma = { values: [], mean: value, stddev: 0 };
      this.movingAverages.set(key, ma);
    }

    ma.values.push(value);
    if (ma.values.length > 60) ma.values.shift(); // Keep last 60 readings

    if (ma.values.length < 10) return null;

    // Compute mean and stddev
    const sum = ma.values.reduce((a, b) => a + b, 0);
    ma.mean = sum / ma.values.length;
    const variance = ma.values.reduce((a, b) => a + (b - ma!.mean) ** 2, 0) / ma.values.length;
    ma.stddev = Math.sqrt(variance);

    if (ma.stddev > 0 && Math.abs(value - ma.mean) > 3 * ma.stddev) {
      return {
        id: uuidv4(),
        deviceId: input.deviceId,
        anomalyType: 'trend',
        severity: 'warning',
        message: `${metricName} = ${value} deviates > 3σ from mean ${ma.mean.toFixed(2)} (σ=${ma.stddev.toFixed(2)})`,
        metricName,
        metricValue: value,
        threshold: ma.mean,
        detectedAt: input.timestamp,
        metadata: { mean: ma.mean, stddev: ma.stddev },
      };
    }
    return null;
  }

  private checkPerformance(input: SignalInput, metricName: string, value: number): AnomalyEvent | null {
    const key = `perf:${input.deviceId}:${metricName}`;
    const baseline = this.performanceBaselines.get(key);
    if (!baseline) {
      this.performanceBaselines.set(key, value);
      return null;
    }
    // Update baseline slowly
    this.performanceBaselines.set(key, baseline * 0.99 + value * 0.01);

    if (value < baseline * 0.7) {
      return {
        id: uuidv4(),
        deviceId: input.deviceId,
        anomalyType: 'performance',
        severity: 'warning',
        message: `${metricName} = ${value.toFixed(2)} is ${((1 - value / baseline) * 100).toFixed(0)}% below baseline ${baseline.toFixed(2)}`,
        metricName,
        metricValue: value,
        threshold: baseline * 0.7,
        detectedAt: input.timestamp,
      };
    }
    return null;
  }

  checkHeartbeats(now: number = Date.now()): AnomalyEvent[] {
    const anomalies: AnomalyEvent[] = [];
    for (const [deviceId, hb] of this.heartbeats) {
      if (now - hb.lastSeen > hb.timeoutMs) {
        const key = `offline:${deviceId}`;
        if (!this.activeAnomalies.has(key)) {
          const anomaly: AnomalyEvent = {
            id: uuidv4(),
            deviceId,
            anomalyType: 'offline',
            severity: 'critical',
            message: `Device ${deviceId} offline for ${Math.round((now - hb.lastSeen) / 1000)}s (timeout: ${hb.timeoutMs}ms)`,
            detectedAt: now,
          };
          this.activeAnomalies.set(key, anomaly);
          this.anomalyHistory.push(anomaly);
          anomalies.push(anomaly);
          this.emit('anomaly', anomaly);
        }
      }
    }
    return anomalies;
  }

  checkMaintenanceOverdue(deviceId: string, lastMaintenanceDate: Date, scheduleMonths: number): AnomalyEvent | null {
    const now = Date.now();
    const nextDue = new Date(lastMaintenanceDate);
    nextDue.setMonth(nextDue.getMonth() + scheduleMonths);

    if (now > nextDue.getTime()) {
      const anomaly: AnomalyEvent = {
        id: uuidv4(),
        deviceId,
        anomalyType: 'maintenance',
        severity: 'info',
        message: `Maintenance overdue since ${nextDue.toISOString().split('T')[0]}`,
        detectedAt: now,
      };
      this.anomalyHistory.push(anomaly);
      this.emit('anomaly', anomaly);
      return anomaly;
    }
    return null;
  }

  startHeartbeatMonitor(intervalMs: number = 5000): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, intervalMs);
  }

  stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  getActiveAnomalies(): AnomalyEvent[] {
    return Array.from(this.activeAnomalies.values());
  }

  getAnomalyHistory(): AnomalyEvent[] {
    return this.anomalyHistory;
  }

  clearHistory(): void {
    this.anomalyHistory = [];
  }
}
