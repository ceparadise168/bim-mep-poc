import { describe, it, expect } from 'vitest';
import { gaussianNoise, clamp, rampUp, dailyCycle, seasonalFactor, agingDrift, randomWalk } from '../src/noise.js';

describe('gaussianNoise', () => {
  it('should produce values centered around the mean', () => {
    const samples = Array.from({ length: 10000 }, () => gaussianNoise(100, 10));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(100, 0);
  });

  it('should respect standard deviation', () => {
    const samples = Array.from({ length: 10000 }, () => gaussianNoise(0, 5));
    const stddev = Math.sqrt(samples.reduce((a, b) => a + b * b, 0) / samples.length);
    expect(stddev).toBeCloseTo(5, 0);
  });
});

describe('clamp', () => {
  it('should clamp below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('should clamp above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('should pass through in range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('rampUp', () => {
  it('should be near 0 at start', () => expect(rampUp(0)).toBeLessThan(0.01));
  it('should be near 1 at end', () => expect(rampUp(1)).toBeGreaterThan(0.99));
  it('should be 0.5 at midpoint', () => expect(rampUp(0.5)).toBeCloseTo(0.5, 1));
});

describe('dailyCycle', () => {
  it('should peak at peak hour', () => {
    expect(dailyCycle(14, 14)).toBe(1);
  });
  it('should be 0 at 12h offset from peak', () => {
    expect(dailyCycle(2, 14)).toBe(0);
  });
});

describe('seasonalFactor', () => {
  it('should be high in summer (day 182)', () => {
    expect(seasonalFactor(172)).toBeGreaterThan(0.85);
  });
  it('should be low in winter (day 355)', () => {
    expect(seasonalFactor(355)).toBeLessThan(0.15);
  });
});

describe('agingDrift', () => {
  it('should increase over time', () => {
    expect(agingDrift(10000)).toBeGreaterThan(agingDrift(1000));
  });
  it('should cap at 0.2', () => {
    expect(agingDrift(100000000)).toBe(0.2);
  });
});

describe('randomWalk', () => {
  it('should stay within bounds', () => {
    let val = 50;
    for (let i = 0; i < 1000; i++) {
      val = randomWalk(val, 5, 0, 100);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });
});
