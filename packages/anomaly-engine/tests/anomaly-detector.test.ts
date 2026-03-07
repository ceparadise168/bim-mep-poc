import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector, SignalInput } from '../src/anomaly-detector.js';

let detector: AnomalyDetector;

beforeEach(() => {
  detector = new AnomalyDetector();
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
    // Should detect trend anomaly (and possibly threshold too)
    expect(anomalies.some(a => a.anomalyType === 'trend')).toBe(true);
  });
});

describe('Offline Detection', () => {
  it('should detect device going offline', () => {
    // Register heartbeat
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    // Check heartbeats with current time (10s timeout for AHU)
    const anomalies = detector.checkHeartbeats(Date.now());
    expect(anomalies.some(a => a.anomalyType === 'offline')).toBe(true);
  });

  it('should resolve offline when device comes back', () => {
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    detector.checkHeartbeats(Date.now());

    const resolved: unknown[] = [];
    detector.on('resolved', (e) => resolved.push(e));

    detector.processSignal(makeSignal({ timestamp: Date.now() }));
    expect(resolved.length).toBe(1);
  });

  it('should not duplicate offline alerts', () => {
    detector.processSignal(makeSignal({ timestamp: Date.now() - 60000 }));
    const first = detector.checkHeartbeats(Date.now());
    const second = detector.checkHeartbeats(Date.now());
    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
  });
});

describe('Performance Detection', () => {
  it('should detect COP degradation', () => {
    // Establish baseline
    for (let i = 0; i < 5; i++) {
      detector.processSignal(makeSignal({
        deviceId: 'CH-00F-001',
        deviceType: 'chiller',
        timestamp: Date.now() + i * 1000,
        payload: { cop: 4.5 },
      }));
    }
    // Sudden drop
    const anomalies = detector.processSignal(makeSignal({
      deviceId: 'CH-00F-001',
      deviceType: 'chiller',
      timestamp: Date.now() + 10000,
      payload: { cop: 2.8 }, // Below 70% of baseline
    }));
    expect(anomalies.some(a => a.anomalyType === 'performance')).toBe(true);
  });
});

describe('Maintenance Detection', () => {
  it('should detect overdue maintenance', () => {
    const lastMaintenance = new Date();
    lastMaintenance.setMonth(lastMaintenance.getMonth() - 4); // 4 months ago
    const anomaly = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.anomalyType).toBe('maintenance');
    expect(anomaly!.severity).toBe('info');
  });

  it('should not alert for recent maintenance', () => {
    const lastMaintenance = new Date();
    lastMaintenance.setMonth(lastMaintenance.getMonth() - 1); // 1 month ago
    const anomaly = detector.checkMaintenanceOverdue('AHU-03F-001', lastMaintenance, 3);
    expect(anomaly).toBeNull();
  });
});

describe('Active Anomalies', () => {
  it('should track active anomalies', () => {
    detector.processSignal(makeSignal({ payload: { supplyTemp: 21 } }));
    expect(detector.getActiveAnomalies().length).toBeGreaterThan(0);
  });

  it('should track anomaly history', () => {
    detector.processSignal(makeSignal({ payload: { supplyTemp: 21 } }));
    expect(detector.getAnomalyHistory().length).toBeGreaterThan(0);
  });
});
