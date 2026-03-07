import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector, SignalInput } from '../src/anomaly-detector.js';
import { AnomalyEvent } from '../src/types.js';

let detector: AnomalyDetector;

beforeEach(() => {
  // pendingDurationMs=0 for instant firing in tests (no waiting)
  detector = new AnomalyDetector({ pendingDurationMs: 0 });
});

function makeSignal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    deviceId: 'AHU-03F-001',
    deviceType: 'ahu',
    timestamp: Date.now(),
    payload: { supplyTemp: 14, returnTemp: 22, filterPressureDiff: 120, airflow: 2000 },
    ...overrides,
  };
}

describe('Threshold Detection', () => {
  it('should not alert for normal values', () => {
    const anomalies = detector.processSignal(makeSignal());
    expect(anomalies.length).toBe(0);
  });

  it('should detect warning threshold breach', () => {
    const anomalies = detector.processSignal(makeSignal({
      payload: { supplyTemp: 19 }, // warning max is 18
    }));
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].anomalyType).toBe('threshold');
    expect(anomalies[0].severity).toBe('warning');
    expect(anomalies[0].state).toBe('firing');
  });

  it('should detect critical threshold breach', () => {
    const anomalies = detector.processSignal(makeSignal({
      payload: { supplyTemp: 21 }, // critical max is 20
    }));
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('should detect chiller low COP', () => {
    const anomalies = detector.processSignal(makeSignal({
      deviceId: 'CH-00F-001',
      deviceType: 'chiller',
      payload: { cop: 2.3 }, // critical min is 2.5
    }));
    expect(anomalies.some(a => a.severity === 'critical' && a.metricName === 'cop')).toBe(true);
  });

  it('should detect power panel voltage issues', () => {
    const anomalies = detector.processSignal(makeSignal({
      deviceId: 'PP-01F-001',
      deviceType: 'power-panel',
      payload: { voltageR: 368 }, // critical min is 370
    }));
    expect(anomalies.some(a => a.severity === 'critical')).toBe(true);
  });

  it('should detect high CO2', () => {
    const anomalies = detector.processSignal(makeSignal({
      deviceId: 'AQ-03F-001',
      deviceType: 'air-quality-sensor',
      payload: { co2: 1600 }, // critical max is 1500
    }));
    expect(anomalies.some(a => a.severity === 'critical')).toBe(true);
  });
});

describe('Fingerprint Deduplication', () => {
  it('should not produce duplicate alerts for repeated breaches', () => {
    const first = detector.processSignal(makeSignal({
      payload: { supplyTemp: 21 },
      timestamp: Date.now(),
    }));
    expect(first.length).toBe(1);

    // Same device, same metric, still breaching — should NOT produce a new alert
    const second = detector.processSignal(makeSignal({
      payload: { supplyTemp: 22 },
      timestamp: Date.now() + 1000,
    }));
    expect(second.length).toBe(0);
  });

  it('should track occurrence count for repeated breaches', () => {
    detector.processSignal(makeSignal({ payload: { supplyTemp: 21 }, timestamp: Date.now() }));
    detector.processSignal(makeSignal({ payload: { supplyTemp: 22 }, timestamp: Date.now() + 1000 }));
    detector.processSignal(makeSignal({ payload: { supplyTemp: 23 }, timestamp: Date.now() + 2000 }));

    const active = detector.getActiveAnomalies();
    expect(active.length).toBe(1);
    expect(active[0].occurrenceCount).toBe(3);
  });
});

describe('Hysteresis (resolve thresholds)', () => {
  it('should NOT resolve when value drops below fire threshold but above resolve threshold', () => {
    const resolved: AnomalyEvent[] = [];
    detector.on('resolved', (e: AnomalyEvent) => resolved.push(e));

    // Fire: supplyTemp > 18 (warning), resolveMax is 17
    detector.processSignal(makeSignal({ payload: { supplyTemp: 19 }, timestamp: Date.now() }));
    expect(detector.getActiveAnomalies().length).toBe(1);

    // Drop to 17.5 — still above resolveMax (17), should NOT resolve
    detector.processSignal(makeSignal({ payload: { supplyTemp: 17.5 }, timestamp: Date.now() + 1000 }));
    expect(detector.getActiveAnomalies().length).toBe(1);
    expect(resolved.length).toBe(0);
  });

  it('should resolve when value passes the resolve threshold', () => {
    const resolved: AnomalyEvent[] = [];
    detector.on('resolved', (e: AnomalyEvent) => resolved.push(e));

    // Fire
    detector.processSignal(makeSignal({ payload: { supplyTemp: 19 }, timestamp: Date.now() }));
    expect(detector.getActiveAnomalies().length).toBe(1);

    // Drop to 16 — below resolveMax (17), should resolve
    detector.processSignal(makeSignal({ payload: { supplyTemp: 16 }, timestamp: Date.now() + 1000 }));
    expect(detector.getActiveAnomalies().length).toBe(0);
    expect(resolved.length).toBe(1);
    expect(resolved[0].state).toBe('resolved');
  });
});

describe('Pending State Machine', () => {
  it('should start in pending state when pendingDuration > 0', () => {
    const pendingDetector = new AnomalyDetector({ pendingDurationMs: 30000 });
    const alerts = pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 21 },
      timestamp: Date.now(),
    }));

    // No alerts returned (still pending)
    expect(alerts.length).toBe(0);
    expect(pendingDetector.getPendingAnomalies().length).toBe(1);
    expect(pendingDetector.getFiringAnomalies().length).toBe(0);
  });

  it('should promote pending to firing after duration', () => {
    const pendingDetector = new AnomalyDetector({ pendingDurationMs: 5000 });
    const now = Date.now();

    pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 21 },
      timestamp: now,
    }));
    expect(pendingDetector.getPendingAnomalies().length).toBe(1);

    // Still breaching after 6s — should promote on next processSignal
    const promoted = pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 22 },
      timestamp: now + 6000,
    }));
    expect(promoted.length).toBe(1);
    expect(promoted[0].state).toBe('firing');
    expect(pendingDetector.getFiringAnomalies().length).toBe(1);
  });

  it('should auto-resolve pending alerts when condition clears', () => {
    const pendingDetector = new AnomalyDetector({ pendingDurationMs: 30000 });
    const resolved: AnomalyEvent[] = [];
    pendingDetector.on('resolved', (e: AnomalyEvent) => resolved.push(e));

    pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 21 },
      timestamp: Date.now(),
    }));
    expect(pendingDetector.getPendingAnomalies().length).toBe(1);

    // Value returns to normal
    pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 14 },
      timestamp: Date.now() + 1000,
    }));
    expect(pendingDetector.getPendingAnomalies().length).toBe(0);
    expect(resolved.length).toBe(1);
  });

  it('should promote via promotePendingAlerts', () => {
    const pendingDetector = new AnomalyDetector({ pendingDurationMs: 5000 });
    const now = Date.now();

    pendingDetector.processSignal(makeSignal({
      payload: { supplyTemp: 21 },
      timestamp: now,
    }));

    const promoted = pendingDetector.promotePendingAlerts(now + 6000);
    expect(promoted.length).toBe(1);
    expect(promoted[0].state).toBe('firing');
  });
});

describe('Trend Detection', () => {
  it('should detect 3-sigma deviation after enough samples', () => {
    // Feed 30 normal readings
    for (let i = 0; i < 30; i++) {
      detector.processSignal(makeSignal({
        timestamp: Date.now() + i * 1000,
        payload: { supplyTemp: 14 + Math.random() * 0.5 },
      }));
    }
    // Feed anomalous reading
    const anomalies = detector.processSignal(makeSignal({
      timestamp: Date.now() + 31000,
      payload: { supplyTemp: 5 }, // Way below normal
    }));
    expect(anomalies.some(a => a.anomalyType === 'trend')).toBe(true);
  });
});

describe('Offline Detection', () => {
  it('should detect device going offline', () => {
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    const anomalies = detector.checkHeartbeats(Date.now());
    expect(anomalies.some(a => a.anomalyType === 'offline')).toBe(true);
  });

  it('should resolve offline when device comes back', () => {
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    detector.checkHeartbeats(Date.now());

    const resolved: AnomalyEvent[] = [];
    detector.on('resolved', (e: AnomalyEvent) => resolved.push(e));

    detector.processSignal(makeSignal({ timestamp: Date.now() }));
    expect(resolved.length).toBe(1);
    expect(resolved[0].state).toBe('resolved');
  });

  it('should not duplicate offline alerts (fingerprint dedup)', () => {
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    const first = detector.checkHeartbeats(Date.now());
    const second = detector.checkHeartbeats(Date.now());
    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
  });
});

describe('Performance Detection', () => {
  it('should detect COP degradation', () => {
    for (let i = 0; i < 5; i++) {
      detector.processSignal(makeSignal({
        deviceId: 'CH-00F-001',
        deviceType: 'chiller',
        timestamp: Date.now() + i * 1000,
        payload: { cop: 4.5 },
      }));
    }
    const anomalies = detector.processSignal(makeSignal({
      deviceId: 'CH-00F-001',
      deviceType: 'chiller',
      timestamp: Date.now() + 10000,
      payload: { cop: 2.8 },
    }));
    expect(anomalies.some(a => a.anomalyType === 'performance')).toBe(true);
  });
});

describe('Maintenance Detection', () => {
  it('should detect overdue maintenance', () => {
    const lastMaintenance = new Date();
    lastMaintenance.setMonth(lastMaintenance.getMonth() - 4);
    const anomaly = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.anomalyType).toBe('maintenance');
    expect(anomaly!.severity).toBe('info');
    expect(anomaly!.state).toBe('firing');
  });

  it('should not alert for recent maintenance', () => {
    const lastMaintenance = new Date();
    lastMaintenance.setMonth(lastMaintenance.getMonth() - 1);
    const anomaly = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    expect(anomaly).toBeNull();
  });

  it('should not duplicate maintenance alerts', () => {
    const lastMaintenance = new Date();
    lastMaintenance.setMonth(lastMaintenance.getMonth() - 4);
    const first = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    const second = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe('Alert Queries', () => {
  it('should track active anomalies', () => {
    detector.processSignal(makeSignal({ payload: { supplyTemp: 21 } }));
    expect(detector.getActiveAnomalies().length).toBeGreaterThan(0);
  });

  it('should include fingerprint in anomaly events', () => {
    detector.processSignal(makeSignal({ payload: { supplyTemp: 21 } }));
    const active = detector.getActiveAnomalies();
    expect(active[0].fingerprint).toBeTruthy();
    expect(active[0].fingerprint.length).toBe(16);
  });

  it('should separate firing from pending', () => {
    const pendingDetector = new AnomalyDetector({ pendingDurationMs: 30000 });
    pendingDetector.processSignal(makeSignal({ payload: { supplyTemp: 21 }, timestamp: Date.now() }));
    expect(pendingDetector.getPendingAnomalies().length).toBe(1);
    expect(pendingDetector.getFiringAnomalies().length).toBe(0);
  });
});
