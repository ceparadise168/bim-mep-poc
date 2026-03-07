import { describe, it, expect, vi } from 'vitest';
import { SlidingWindowAggregator, computeAgg, computeCOP, computeEUI, computeComfortIndex, AggWindow } from '../src/aggregator.js';

describe('computeAgg', () => {
  it('should compute correct aggregation', () => {
    const window: AggWindow = {
      deviceId: 'AHU-01F-001',
      metricName: 'temperature',
      values: [20, 22, 24, 26, 28],
      startTime: 1000,
    };
    const result = computeAgg(window);
    expect(result.avg).toBe(24);
    expect(result.min).toBe(20);
    expect(result.max).toBe(28);
    expect(result.count).toBe(5);
    expect(result.deviceId).toBe('AHU-01F-001');
    expect(result.metricName).toBe('temperature');
  });

  it('should handle single value', () => {
    const window: AggWindow = {
      deviceId: 'TH-01F-001',
      metricName: 'humidity',
      values: [55],
      startTime: 1000,
    };
    const result = computeAgg(window);
    expect(result.avg).toBe(55);
    expect(result.min).toBe(55);
    expect(result.max).toBe(55);
    expect(result.count).toBe(1);
  });
});

describe('SlidingWindowAggregator', () => {
  it('should accumulate values within window', () => {
    const results: unknown[] = [];
    const agg = new SlidingWindowAggregator(60000, (r) => results.push(...r));

    const baseTime = Date.now();
    agg.addValue('AHU-01F-001', 'temp', 22, baseTime);
    agg.addValue('AHU-01F-001', 'temp', 23, baseTime + 1000);
    agg.addValue('AHU-01F-001', 'temp', 24, baseTime + 2000);

    expect(agg.getWindowCount()).toBe(1);
    // No flush yet since window hasn't expired
    expect(results.length).toBe(0);
  });

  it('should flush when window expires on new value', () => {
    const results: unknown[] = [];
    const agg = new SlidingWindowAggregator(60000, (r) => results.push(...r));

    const baseTime = Date.now();
    agg.addValue('AHU-01F-001', 'temp', 22, baseTime);
    agg.addValue('AHU-01F-001', 'temp', 24, baseTime + 1000);

    // New value outside window triggers flush
    agg.addValue('AHU-01F-001', 'temp', 25, baseTime + 70000);
    expect(results.length).toBe(1);
  });

  it('should track separate windows per device+metric', () => {
    const results: unknown[] = [];
    const agg = new SlidingWindowAggregator(60000, (r) => results.push(...r));

    const baseTime = Date.now();
    agg.addValue('AHU-01F-001', 'temp', 22, baseTime);
    agg.addValue('AHU-01F-001', 'humidity', 55, baseTime);
    agg.addValue('AHU-02F-001', 'temp', 23, baseTime);

    expect(agg.getWindowCount()).toBe(3);
  });

  it('should flushAll correctly', () => {
    const results: unknown[] = [];
    const agg = new SlidingWindowAggregator(60000, (r) => results.push(...r));

    const baseTime = Date.now();
    agg.addValue('AHU-01F-001', 'temp', 22, baseTime);
    agg.addValue('AHU-01F-001', 'temp', 24, baseTime + 1000);
    agg.addValue('AHU-02F-001', 'humidity', 55, baseTime);

    const flushed = agg.flushAll();
    expect(flushed.length).toBe(2);
    expect(agg.getWindowCount()).toBe(0);

    const tempResult = flushed.find(r => r.metricName === 'temp');
    expect(tempResult!.avg).toBe(23);
    expect(tempResult!.count).toBe(2);
  });
});

describe('computeCOP', () => {
  it('should compute COP correctly', () => {
    // 100 RT at 280kW
    const cop = computeCOP(100, 280);
    expect(cop).toBeCloseTo(1.256, 2);
  });

  it('should return 0 for zero power', () => {
    expect(computeCOP(100, 0)).toBe(0);
  });
});

describe('computeEUI', () => {
  it('should compute EUI correctly', () => {
    // 100000 kWh, 500 ping, 365 days
    const eui = computeEUI(100000, 500, 365);
    expect(eui).toBe(200);
  });

  it('should return 0 for zero area', () => {
    expect(computeEUI(100000, 0, 365)).toBe(0);
  });
});

describe('computeComfortIndex', () => {
  it('should return high score for ideal conditions', () => {
    const score = computeComfortIndex(23, 50, 400);
    expect(score).toBeGreaterThan(90);
  });

  it('should return lower score for hot conditions', () => {
    const idealScore = computeComfortIndex(23, 50, 400);
    const hotScore = computeComfortIndex(30, 50, 400);
    expect(hotScore).toBeLessThan(idealScore);
  });

  it('should return lower score for high CO2', () => {
    const idealScore = computeComfortIndex(23, 50, 400);
    const highCo2Score = computeComfortIndex(23, 50, 2000);
    expect(highCo2Score).toBeLessThan(idealScore);
  });

  it('should return lower score for high humidity', () => {
    const idealScore = computeComfortIndex(23, 50, 400);
    const highHumScore = computeComfortIndex(23, 85, 400);
    expect(highHumScore).toBeLessThan(idealScore);
  });

  it('should be between 0 and 100', () => {
    for (let temp = 15; temp <= 35; temp += 5) {
      for (let hum = 20; hum <= 90; hum += 20) {
        for (let co2 = 400; co2 <= 2000; co2 += 400) {
          const score = computeComfortIndex(temp, hum, co2);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
