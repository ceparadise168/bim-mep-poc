export interface AggWindow {
  deviceId: string;
  metricName: string;
  values: number[];
  startTime: number;
}

export interface AggResult {
  deviceId: string;
  metricName: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  windowStart: Date;
}

export class SlidingWindowAggregator {
  private windows = new Map<string, AggWindow>();
  private windowMs: number;
  private onFlush: (results: AggResult[]) => void;
  private flushTimer?: NodeJS.Timeout;

  constructor(windowMs: number, onFlush: (results: AggResult[]) => void) {
    this.windowMs = windowMs;
    this.onFlush = onFlush;
  }

  private key(deviceId: string, metricName: string): string {
    return `${deviceId}:${metricName}`;
  }

  addValue(deviceId: string, metricName: string, value: number, timestamp: number): void {
    const k = this.key(deviceId, metricName);
    let window = this.windows.get(k);
    if (!window || timestamp - window.startTime >= this.windowMs) {
      // Flush old window if exists
      if (window && window.values.length > 0) {
        this.flushWindow(window);
      }
      window = { deviceId, metricName, values: [], startTime: timestamp };
      this.windows.set(k, window);
    }
    window.values.push(value);
  }

  private flushWindow(window: AggWindow): void {
    if (window.values.length === 0) return;
    const result = computeAgg(window);
    this.onFlush([result]);
  }

  flushAll(): AggResult[] {
    const results: AggResult[] = [];
    for (const window of this.windows.values()) {
      if (window.values.length > 0) {
        results.push(computeAgg(window));
      }
    }
    this.windows.clear();
    return results;
  }

  start(): void {
    this.flushTimer = setInterval(() => {
      const now = Date.now();
      const toFlush: AggResult[] = [];
      for (const [key, window] of this.windows.entries()) {
        if (now - window.startTime >= this.windowMs && window.values.length > 0) {
          toFlush.push(computeAgg(window));
          this.windows.delete(key);
        }
      }
      if (toFlush.length > 0) {
        this.onFlush(toFlush);
      }
    }, this.windowMs / 2);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  getWindowCount(): number {
    return this.windows.size;
  }
}

export function computeAgg(window: AggWindow): AggResult {
  const { values } = window;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    deviceId: window.deviceId,
    metricName: window.metricName,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
    windowStart: new Date(window.startTime),
  };
}

/** Derived metrics */
export function computeCOP(coolingTons: number, powerKw: number): number {
  if (powerKw <= 0) return 0;
  return (coolingTons * 3.517) / powerKw; // 1 RT = 3.517 kW
}

export function computeEUI(totalKwh: number, areaPing: number, days: number): number {
  if (areaPing <= 0 || days <= 0) return 0;
  return totalKwh / areaPing / (days / 365);
}

export function computeComfortIndex(temperature: number, humidity: number, co2: number): number {
  // Score from 0-100, higher is better
  // Ideal: 22-24°C, 40-60%RH, <800ppm CO2
  const tempScore = Math.max(0, 100 - Math.abs(temperature - 23) * 10);
  const humScore = Math.max(0, 100 - Math.abs(humidity - 50) * 2);
  const co2Score = Math.max(0, 100 - Math.max(0, co2 - 400) * 0.1);
  return Math.round((tempScore * 0.4 + humScore * 0.3 + co2Score * 0.3) * 10) / 10;
}
