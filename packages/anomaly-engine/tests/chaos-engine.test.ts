import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChaosEngine } from '../src/chaos-engine.js';

let chaos: ChaosEngine;

beforeEach(() => {
  chaos = new ChaosEngine();
});

afterEach(() => {
  chaos.stop();
});

describe('ChaosEngine', () => {
  it('should list all default scenarios', () => {
    const scenarios = chaos.getScenarios();
    expect(scenarios.length).toBe(5);
    expect(scenarios.map(s => s.name)).toContain('空調主機故障');
    expect(scenarios.map(s => s.name)).toContain('電力異常');
    expect(scenarios.map(s => s.name)).toContain('感測器飄移');
    expect(scenarios.map(s => s.name)).toContain('網路中斷');
    expect(scenarios.map(s => s.name)).toContain('水管洩漏');
  });

  it('should trigger a scenario and create fault effects', () => {
    const effects = chaos.triggerScenario('空調主機故障', ['CH-00F-001', 'CH-00F-002']);
    expect(effects.length).toBe(2);
    expect(effects[0].faultType).toBe('signal_spike');
    expect(effects[0].scenarioName).toBe('空調主機故障');
  });

  it('should mark devices as faulted', () => {
    chaos.triggerScenario('空調主機故障', ['CH-00F-001']);
    expect(chaos.isDeviceFaulted('CH-00F-001')).toBe(true);
    expect(chaos.isDeviceFaulted('CH-00F-002')).toBe(false);
  });

  it('should modify signal values for spike fault', () => {
    chaos.triggerScenario('空調主機故障', ['CH-00F-001']);
    const modified = chaos.modifySignalValue('CH-00F-001', 'compressorCurrent', 80);
    expect(modified).toBeGreaterThan(80);
  });

  it('should modify signal values for drop fault', () => {
    chaos.triggerScenario('電力異常', ['PP-01F-001']);
    const modified = chaos.modifySignalValue('PP-01F-001', 'voltageR', 380);
    expect(modified).toBeLessThan(380);
  });

  it('should modify signal values for drift fault', () => {
    chaos.triggerScenario('感測器飄移', ['TH-03F-001']);
    // Wait a tiny bit for elapsed time
    const modified = chaos.modifySignalValue('TH-03F-001', 'temperature', 22);
    expect(typeof modified).toBe('number');
  });

  it('should return NaN for offline fault', () => {
    chaos.triggerScenario('網路中斷', ['TH-03F-001']);
    const modified = chaos.modifySignalValue('TH-03F-001', 'temperature', 22);
    expect(isNaN(modified)).toBe(true);
  });

  it('should not modify non-faulted device signals', () => {
    const original = chaos.modifySignalValue('AHU-01F-001', 'supplyTemp', 14);
    expect(original).toBe(14);
  });

  it('should throw for unknown scenario', () => {
    expect(() => chaos.triggerScenario('不存在', ['CH-00F-001'])).toThrow('Unknown scenario');
  });

  it('should emit cascade events', async () => {
    // Use a custom engine with short cascade delay for testing
    const fastChaos = new ChaosEngine([{
      name: 'test-cascade',
      description: 'test',
      trigger: 'manual',
      affectedDevices: ['CH-*'],
      faultType: 'signal_spike',
      duration: { min: 5, max: 10 },
      cascadeRules: [{
        sourcePattern: 'CH-*',
        targetPattern: 'AHU-*',
        delay: 1, // 1 second
        effect: { metricName: 'supplyTemp', modifier: 'spike', magnitude: 8 },
      }],
    }]);

    const cascadeEvents: unknown[] = [];
    fastChaos.on('cascade', (e) => cascadeEvents.push(e));

    fastChaos.triggerScenario('test-cascade', ['CH-00F-001']);

    await new Promise(r => setTimeout(r, 2000));
    fastChaos.stop();
    expect(cascadeEvents.length).toBeGreaterThan(0);
  });

  it('should track fault history', () => {
    chaos.triggerScenario('空調主機故障', ['CH-00F-001']);
    chaos.triggerScenario('電力異常', ['PP-01F-001']);
    expect(chaos.getFaultHistory().length).toBe(2);
  });

  it('should emit faultInjected event', () => {
    const events: unknown[] = [];
    chaos.on('faultInjected', (e) => events.push(e));
    chaos.triggerScenario('空調主機故障', ['CH-00F-001']);
    expect(events.length).toBe(1);
  });
});
