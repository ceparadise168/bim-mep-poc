import { describe, it, expect } from 'vitest';
import { validateSignal } from '../src/schema-validator.js';
import { v4 as uuidv4 } from 'uuid';

function makeValidSignal(overrides: Record<string, unknown> = {}) {
  return {
    signalId: uuidv4(),
    deviceId: 'AHU-03F-001',
    timestamp: Date.now(),
    protocol: 'bacnet-ip',
    payload: { temperature: 22.5, humidity: 55 },
    quality: 'good',
    ...overrides,
  };
}

describe('validateSignal', () => {
  it('should accept a valid signal', () => {
    const result = validateSignal(makeValidSignal());
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should accept all valid protocols', () => {
    for (const protocol of ['modbus-tcp', 'bacnet-ip', 'mqtt', 'opcua', 'restful']) {
      const result = validateSignal(makeValidSignal({ protocol }));
      expect(result.valid).toBe(true);
    }
  });

  it('should accept all quality values', () => {
    for (const quality of ['good', 'uncertain', 'bad']) {
      const result = validateSignal(makeValidSignal({ quality }));
      expect(result.valid).toBe(true);
    }
  });

  it('should accept signal with metadata', () => {
    const result = validateSignal(makeValidSignal({ metadata: { floor: 3, zone: 'ICU' } }));
    expect(result.valid).toBe(true);
  });

  it('should reject missing signalId', () => {
    const signal = makeValidSignal();
    delete (signal as Record<string, unknown>).signalId;
    const result = validateSignal(signal);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject missing deviceId', () => {
    const signal = makeValidSignal();
    delete (signal as Record<string, unknown>).deviceId;
    const result = validateSignal(signal);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid deviceId format', () => {
    const result = validateSignal(makeValidSignal({ deviceId: 'bad-id' }));
    expect(result.valid).toBe(false);
  });

  it('should reject timestamp in seconds (not ms)', () => {
    const result = validateSignal(makeValidSignal({ timestamp: 1700000000 }));
    expect(result.valid).toBe(false);
  });

  it('should reject invalid protocol', () => {
    const result = validateSignal(makeValidSignal({ protocol: 'http' }));
    expect(result.valid).toBe(false);
  });

  it('should reject empty payload', () => {
    const result = validateSignal(makeValidSignal({ payload: {} }));
    expect(result.valid).toBe(false);
  });

  it('should reject invalid quality', () => {
    const result = validateSignal(makeValidSignal({ quality: 'excellent' }));
    expect(result.valid).toBe(false);
  });

  it('should reject additional properties', () => {
    const result = validateSignal(makeValidSignal({ extraField: 'bad' }));
    expect(result.valid).toBe(false);
  });

  it('should reject non-object input', () => {
    expect(validateSignal('string')).toEqual({ valid: false, errors: expect.any(Array) });
    expect(validateSignal(null)).toEqual({ valid: false, errors: expect.any(Array) });
    expect(validateSignal(42)).toEqual({ valid: false, errors: expect.any(Array) });
  });

  it('should provide meaningful error messages', () => {
    const result = validateSignal({ bad: 'data' });
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors!.some(e => typeof e === 'string')).toBe(true);
  });
});
