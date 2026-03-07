import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { ChaosScenario, CascadeRule, FaultType, AnomalyEvent } from './types.js';

export interface FaultEffect {
  deviceId: string;
  faultType: FaultType;
  startTime: number;
  endTime: number;
  scenarioName: string;
}

export const defaultScenarios: ChaosScenario[] = [
  {
    name: '空調主機故障',
    description: '壓縮機電流飆高 → 過載保護跳脫 → 下游 AHU 送風溫度上升',
    trigger: 'manual',
    affectedDevices: ['CH-00F-*'],
    faultType: 'signal_spike',
    duration: { min: 30, max: 120 },
    cascadeRules: [
      {
        sourcePattern: 'CH-*',
        targetPattern: 'AHU-*',
        delay: 5,
        effect: { metricName: 'supplyTemp', modifier: 'spike', magnitude: 8 },
      },
    ],
  },
  {
    name: '電力異常',
    description: '主電壓閃降 → UPS 切換 → 發電機啟動',
    trigger: 'manual',
    affectedDevices: ['PP-*'],
    faultType: 'signal_drop',
    duration: { min: 10, max: 60 },
    cascadeRules: [
      {
        sourcePattern: 'PP-*',
        targetPattern: 'UPS-*',
        delay: 1,
        effect: { metricName: 'loadPercent', modifier: 'spike', magnitude: 30 },
      },
      {
        sourcePattern: 'PP-*',
        targetPattern: 'GEN-*',
        delay: 3,
        effect: { metricName: 'rpm', modifier: 'spike', magnitude: 1800 },
      },
    ],
  },
  {
    name: '感測器飄移',
    description: '溫溼度感測器逐漸偏離 → 誤報',
    trigger: 'manual',
    affectedDevices: ['TH-*'],
    faultType: 'drift',
    duration: { min: 60, max: 300 },
  },
  {
    name: '網路中斷',
    description: '整層設備心跳消失 → 批量離線警報',
    trigger: 'manual',
    affectedDevices: ['*-03F-*'],
    faultType: 'offline',
    duration: { min: 30, max: 120 },
  },
  {
    name: '水管洩漏',
    description: '水壓下降 → 流量異常 → 消防泵浦啟動',
    trigger: 'manual',
    affectedDevices: ['WM-*'],
    faultType: 'signal_drop',
    duration: { min: 60, max: 180 },
    cascadeRules: [
      {
        sourcePattern: 'WM-*',
        targetPattern: 'FP-*',
        delay: 10,
        effect: { metricName: 'isRunning', modifier: 'spike', magnitude: 1 },
      },
    ],
  },
];

export class ChaosEngine extends EventEmitter {
  private scenarios: ChaosScenario[];
  private activeFaults = new Map<string, FaultEffect[]>();
  private cascadeTimers: NodeJS.Timeout[] = [];
  private faultHistory: Array<{ scenario: string; startTime: number; endTime: number; devices: string[] }> = [];

  constructor(scenarios?: ChaosScenario[]) {
    super();
    this.scenarios = scenarios ?? defaultScenarios;
  }

  getScenarios(): ChaosScenario[] {
    return this.scenarios;
  }

  triggerScenario(scenarioName: string, deviceIds: string[]): FaultEffect[] {
    const scenario = this.scenarios.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    const now = Date.now();
    const durationMs = (scenario.duration.min + Math.random() * (scenario.duration.max - scenario.duration.min)) * 1000;
    const endTime = now + durationMs;

    const effects: FaultEffect[] = [];

    for (const deviceId of deviceIds) {
      const effect: FaultEffect = {
        deviceId,
        faultType: scenario.faultType,
        startTime: now,
        endTime,
        scenarioName,
      };
      effects.push(effect);

      const existing = this.activeFaults.get(deviceId) ?? [];
      existing.push(effect);
      this.activeFaults.set(deviceId, existing);
    }

    // Schedule cascade effects
    if (scenario.cascadeRules) {
      for (const rule of scenario.cascadeRules) {
        const timer = setTimeout(() => {
          this.emit('cascade', {
            rule,
            sourceDevices: deviceIds,
            triggeredAt: Date.now(),
          });
        }, rule.delay * 1000);
        this.cascadeTimers.push(timer);
      }
    }

    // Schedule fault cleanup
    setTimeout(() => {
      for (const deviceId of deviceIds) {
        const faults = this.activeFaults.get(deviceId);
        if (faults) {
          const remaining = faults.filter(f => f.endTime > Date.now());
          if (remaining.length === 0) {
            this.activeFaults.delete(deviceId);
          } else {
            this.activeFaults.set(deviceId, remaining);
          }
        }
      }
      this.emit('faultCleared', { scenario: scenarioName, devices: deviceIds });
    }, durationMs);

    this.faultHistory.push({
      scenario: scenarioName,
      startTime: now,
      endTime,
      devices: deviceIds,
    });

    this.emit('faultInjected', { scenario: scenarioName, effects });
    return effects;
  }

  getActiveFault(deviceId: string): FaultEffect | null {
    const faults = this.activeFaults.get(deviceId);
    if (!faults || faults.length === 0) return null;
    const now = Date.now();
    const active = faults.find(f => f.startTime <= now && f.endTime > now);
    return active ?? null;
  }

  getActiveFaults(): Map<string, FaultEffect[]> {
    return this.activeFaults;
  }

  getFaultHistory() {
    return this.faultHistory;
  }

  isDeviceFaulted(deviceId: string): boolean {
    return this.getActiveFault(deviceId) !== null;
  }

  modifySignalValue(deviceId: string, metricName: string, originalValue: number): number {
    const fault = this.getActiveFault(deviceId);
    if (!fault) return originalValue;

    switch (fault.faultType) {
      case 'signal_spike':
        return originalValue * (1.5 + Math.random() * 0.5);
      case 'signal_drop':
        return originalValue * (0.1 + Math.random() * 0.2);
      case 'drift':
        const elapsed = (Date.now() - fault.startTime) / 1000;
        return originalValue + elapsed * 0.05 * (Math.random() > 0.5 ? 1 : -1);
      case 'intermittent':
        return Math.random() > 0.5 ? originalValue : 0;
      case 'offline':
        return NaN; // Signal won't be sent
      default:
        return originalValue;
    }
  }

  stop(): void {
    for (const timer of this.cascadeTimers) {
      clearTimeout(timer);
    }
    this.cascadeTimers = [];
    this.activeFaults.clear();
  }
}
