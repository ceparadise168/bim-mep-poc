import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { AnomalyEvent, AnomalyType, AlertState, Severity, ThresholdRule, DeviceHeartbeat } from './types.js';
import { defaultThresholdRules } from './threshold-rules.js';

export interface SignalInput {
  deviceId: string;
  deviceType: string;
  timestamp: number;
  payload: Record<string, number | string | boolean>;
}

export interface DetectorOptions {
  rules?: ThresholdRule[];
  /** How long an alert stays in 'pending' before it fires (ms). Default: 30000 (30s). */
  pendingDurationMs?: number;
  /** Minimum time between emitting the same fingerprint (ms). Default: 300000 (5m). */
  cooldownMs?: number;
}

function fingerprint(deviceId: string, anomalyType: string, metricName?: string): string {
  const raw = `${deviceId}:${anomalyType}:${metricName ?? ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Alert state machine:
 *
 *   NORMAL ──(condition met)──► PENDING ──(held for pendingDurationMs)──► FIRING
 *     ▲                           │                                        │
 *     │ (condition clears)        │ (condition clears)                     │ (value past resolve threshold)
 *     └───────────────────────────┘                                        ▼
 *                                                                       RESOLVED
 */
export class AnomalyDetector extends EventEmitter {
  private thresholdRules: ThresholdRule[];
  private heartbeats = new Map<string, DeviceHeartbeat>();
  private heartbeatTimeouts = new Map<string, number>();
  private movingAverages = new Map<string, { values: number[]; mean: number; stddev: number }>();
  private performanceBaselines = new Map<string, number>();

  /** Active alerts keyed by fingerprint. Includes pending, firing states. */
  private alerts = new Map<string, AnomalyEvent>();
  /** Last time an alert with this fingerprint was emitted (for cooldown). */
  private lastEmitTime = new Map<string, number>();

  private pendingDurationMs: number;
  private cooldownMs: number;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(options: DetectorOptions = {}) {
    super();
    this.thresholdRules = options.rules ?? defaultThresholdRules;
    this.pendingDurationMs = options.pendingDurationMs ?? 30_000;
    this.cooldownMs = options.cooldownMs ?? 300_000;

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

  /**
   * Process a signal and return any NEW state transitions (pending→firing, or new firing alerts).
   * Resolved alerts are emitted via the 'resolved' event.
   */
  processSignal(input: SignalInput): AnomalyEvent[] {
    const now = input.timestamp;
    const newAlerts: AnomalyEvent[] = [];

    // Update heartbeat
    const timeout = this.heartbeatTimeouts.get(input.deviceType) ?? 30000;
    this.heartbeats.set(input.deviceId, {
      deviceId: input.deviceId,
      lastSeen: now,
      timeoutMs: timeout,
    });

    // Resolve offline anomaly if device was marked offline
    this.tryResolve(`offline:${input.deviceId}`, now);

    // Evaluate each numeric metric
    for (const [metricName, value] of Object.entries(input.payload)) {
      if (typeof value !== 'number') continue;

      // --- Threshold checks ---
      const thresholdResult = this.evaluateThresholds(input, metricName, value);
      if (thresholdResult) {
        const alert = this.upsertAlert(thresholdResult, now);
        if (alert) newAlerts.push(alert);
      } else {
        // Value is in normal range — try to resolve any active threshold alert
        this.tryResolveThreshold(input.deviceId, metricName, value, now);
      }

      // --- Trend check ---
      const trendResult = this.evaluateTrend(input, metricName, value);
      if (trendResult) {
        const alert = this.upsertAlert(trendResult, now);
        if (alert) newAlerts.push(alert);
      } else {
        // Trend returned to normal
        const fp = fingerprint(input.deviceId, 'trend', metricName);
        this.tryResolve(fp, now);
      }

      // --- Performance check (COP for chillers) ---
      if (metricName === 'cop' && input.deviceType === 'chiller') {
        const perfResult = this.evaluatePerformance(input, metricName, value);
        if (perfResult) {
          const alert = this.upsertAlert(perfResult, now);
          if (alert) newAlerts.push(alert);
        } else {
          const fp = fingerprint(input.deviceId, 'performance', metricName);
          this.tryResolve(fp, now);
        }
      }
    }

    return newAlerts;
  }

  // ──────────────────────────────────────────────────────
  // State machine core
  // ──────────────────────────────────────────────────────

  /**
   * Upsert an alert by fingerprint. Returns the alert only on state transitions
   * that should be persisted (pending→firing promotion, or new firing if pendingDuration=0).
   */
  private upsertAlert(candidate: AlertCandidate, now: number): AnomalyEvent | null {
    const fp = candidate.fingerprint;
    const existing = this.alerts.get(fp);

    if (existing) {
      // Already tracked — update eval time and bump count
      existing.lastEvalAt = now;
      existing.occurrenceCount++;
      existing.metricValue = candidate.metricValue;
      existing.message = candidate.message;

      // Escalate severity if needed
      if (severityRank(candidate.severity) > severityRank(existing.severity)) {
        existing.severity = candidate.severity;
      }

      // Check pending → firing promotion
      if (existing.state === 'pending' && (now - existing.detectedAt >= this.pendingDurationMs)) {
        existing.state = 'firing';
        existing.firedAt = now;
        this.emit('firing', existing);
        return existing;
      }

      return null; // No state transition
    }

    // New alert
    const alert: AnomalyEvent = {
      id: crypto.randomUUID(),
      fingerprint: fp,
      deviceId: candidate.deviceId,
      anomalyType: candidate.anomalyType,
      severity: candidate.severity,
      state: this.pendingDurationMs > 0 ? 'pending' : 'firing',
      message: candidate.message,
      metricName: candidate.metricName,
      metricValue: candidate.metricValue,
      threshold: candidate.threshold,
      detectedAt: now,
      firedAt: this.pendingDurationMs > 0 ? undefined : now,
      lastEvalAt: now,
      occurrenceCount: 1,
      metadata: candidate.metadata,
    };

    this.alerts.set(fp, alert);

    if (alert.state === 'firing') {
      this.emit('firing', alert);
      return alert;
    }

    this.emit('pending', alert);
    return null; // pending — don't persist yet
  }

  private tryResolve(fp: string, now: number): void {
    const alert = this.alerts.get(fp);
    if (!alert) return;

    alert.state = 'resolved';
    alert.resolvedAt = now;
    alert.lastEvalAt = now;
    this.alerts.delete(fp);
    this.emit('resolved', alert);
  }

  private tryResolveThreshold(deviceId: string, metricName: string, value: number, now: number): void {
    // Check all severity levels for this device+metric
    for (const suffix of ['warning', 'critical']) {
      const fp = fingerprint(deviceId, `threshold:${suffix}`, metricName);
      const alert = this.alerts.get(fp);
      if (!alert) continue;

      // Find the matching rule to check hysteresis
      const rule = this.thresholdRules.find(
        r => r.deviceType === this.resolveDeviceTypeFromId(deviceId) && r.metricName === metricName,
      );

      if (!rule) {
        this.tryResolve(fp, now);
        continue;
      }

      // Check if value has returned past the resolve threshold (hysteresis)
      const resolveMax = rule.resolveMax ?? rule.warningMax;
      const resolveMin = rule.resolveMin ?? rule.warningMin;

      let isResolved = true;
      if (resolveMax !== undefined && value > resolveMax) isResolved = false;
      if (resolveMin !== undefined && value < resolveMin) isResolved = false;

      if (isResolved) {
        this.tryResolve(fp, now);
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // Evaluation functions (pure condition checks, no state)
  // ──────────────────────────────────────────────────────

  private evaluateThresholds(input: SignalInput, metricName: string, value: number): AlertCandidate | null {
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
        return {
          fingerprint: fingerprint(input.deviceId, `threshold:${severity}`, metricName),
          deviceId: input.deviceId,
          anomalyType: 'threshold',
          severity,
          message,
          metricName,
          metricValue: value,
          threshold: severity === 'critical'
            ? (rule.criticalMax !== undefined && value > rule.criticalMax ? rule.criticalMax : rule.criticalMin)
            : (rule.warningMax !== undefined && value > rule.warningMax ? rule.warningMax : rule.warningMin),
        };
      }
    }
    return null;
  }

  private evaluateTrend(input: SignalInput, metricName: string, value: number): AlertCandidate | null {
    const key = `${input.deviceId}:${metricName}`;
    let ma = this.movingAverages.get(key);
    if (!ma) {
      ma = { values: [], mean: value, stddev: 0 };
      this.movingAverages.set(key, ma);
    }

    ma.values.push(value);
    if (ma.values.length > 60) ma.values.shift();
    if (ma.values.length < 10) return null;

    const sum = ma.values.reduce((a, b) => a + b, 0);
    ma.mean = sum / ma.values.length;
    const variance = ma.values.reduce((a, b) => a + (b - ma!.mean) ** 2, 0) / ma.values.length;
    ma.stddev = Math.sqrt(variance);

    if (ma.stddev > 0 && Math.abs(value - ma.mean) > 3 * ma.stddev) {
      return {
        fingerprint: fingerprint(input.deviceId, 'trend', metricName),
        deviceId: input.deviceId,
        anomalyType: 'trend',
        severity: 'warning',
        message: `${metricName} = ${value} deviates > 3σ from mean ${ma.mean.toFixed(2)} (σ=${ma.stddev.toFixed(2)})`,
        metricName,
        metricValue: value,
        threshold: ma.mean,
        metadata: { mean: ma.mean, stddev: ma.stddev },
      };
    }
    return null;
  }

  private evaluatePerformance(input: SignalInput, metricName: string, value: number): AlertCandidate | null {
    const key = `perf:${input.deviceId}:${metricName}`;
    const baseline = this.performanceBaselines.get(key);
    if (!baseline) {
      this.performanceBaselines.set(key, value);
      return null;
    }
    this.performanceBaselines.set(key, baseline * 0.99 + value * 0.01);

    if (value < baseline * 0.7) {
      return {
        fingerprint: fingerprint(input.deviceId, 'performance', metricName),
        deviceId: input.deviceId,
        anomalyType: 'performance',
        severity: 'warning',
        message: `${metricName} = ${value.toFixed(2)} is ${((1 - value / baseline) * 100).toFixed(0)}% below baseline ${baseline.toFixed(2)}`,
        metricName,
        metricValue: value,
        threshold: baseline * 0.7,
      };
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Heartbeat monitoring
  // ──────────────────────────────────────────────────────

  checkHeartbeats(now: number = Date.now()): AnomalyEvent[] {
    const fired: AnomalyEvent[] = [];
    for (const [deviceId, hb] of this.heartbeats) {
      if (now - hb.lastSeen > hb.timeoutMs) {
        const fp = `offline:${deviceId}`;
        const candidate: AlertCandidate = {
          fingerprint: fp,
          deviceId,
          anomalyType: 'offline',
          severity: 'critical',
          message: `Device ${deviceId} offline for ${Math.round((now - hb.lastSeen) / 1000)}s (timeout: ${hb.timeoutMs}ms)`,
        };
        const alert = this.upsertAlert(candidate, now);
        if (alert) fired.push(alert);
      }
    }
    return fired;
  }

  checkMaintenanceOverdue(deviceId: string, lastMaintenanceDate: Date, scheduleMonths: number): AnomalyEvent | null {
    const now = Date.now();
    const nextDue = new Date(lastMaintenanceDate);
    nextDue.setMonth(nextDue.getMonth() + scheduleMonths);

    if (now > nextDue.getTime()) {
      const fp = fingerprint(deviceId, 'maintenance', '');
      const candidate: AlertCandidate = {
        fingerprint: fp,
        deviceId,
        anomalyType: 'maintenance',
        severity: 'info',
        message: `Maintenance overdue since ${nextDue.toISOString().split('T')[0]}`,
      };
      // Maintenance alerts skip pending, go straight to firing
      const existing = this.alerts.get(fp);
      if (existing) return null; // Already tracked

      const alert: AnomalyEvent = {
        id: crypto.randomUUID(),
        fingerprint: fp,
        deviceId,
        anomalyType: 'maintenance',
        severity: 'info',
        state: 'firing',
        message: candidate.message,
        detectedAt: now,
        firedAt: now,
        lastEvalAt: now,
        occurrenceCount: 1,
      };
      this.alerts.set(fp, alert);
      this.emit('firing', alert);
      return alert;
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

  // ──────────────────────────────────────────────────────
  // Queries
  // ──────────────────────────────────────────────────────

  getActiveAnomalies(): AnomalyEvent[] {
    return Array.from(this.alerts.values());
  }

  getFiringAnomalies(): AnomalyEvent[] {
    return Array.from(this.alerts.values()).filter(a => a.state === 'firing');
  }

  getPendingAnomalies(): AnomalyEvent[] {
    return Array.from(this.alerts.values()).filter(a => a.state === 'pending');
  }

  /**
   * Promote all pending alerts that have exceeded the pending duration.
   * Call this periodically (e.g. alongside heartbeat checks).
   */
  promotePendingAlerts(now: number = Date.now()): AnomalyEvent[] {
    const promoted: AnomalyEvent[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.state === 'pending' && now - alert.detectedAt >= this.pendingDurationMs) {
        alert.state = 'firing';
        alert.firedAt = now;
        this.emit('firing', alert);
        promoted.push(alert);
      }
    }
    return promoted;
  }

  // ──────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────

  private resolveDeviceTypeFromId(deviceId: string): string | null {
    const prefix = deviceId.split('-')[0];
    const prefixMap: Record<string, string> = {
      CH: 'chiller', AHU: 'ahu', VFD: 'vfd', PP: 'power-panel',
      UPS: 'ups', GEN: 'generator', FP: 'fire-pump', ELV: 'elevator',
      LT: 'lighting-controller', TH: 'temp-humidity-sensor',
      WM: 'water-meter', AQ: 'air-quality-sensor',
    };
    return prefixMap[prefix] ?? null;
  }
}

function severityRank(s: Severity): number {
  return s === 'critical' ? 3 : s === 'warning' ? 2 : 1;
}

interface AlertCandidate {
  fingerprint: string;
  deviceId: string;
  anomalyType: AnomalyType;
  severity: Severity;
  message: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
}
