/** Gaussian noise using Box-Muller transform */
export function gaussianNoise(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Clamp value within bounds */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Smooth ramp-up curve (logistic) */
export function rampUp(progress: number): number {
  return 1 / (1 + Math.exp(-10 * (progress - 0.5)));
}

/** Daily cycle factor: peaks at peakHour, range [0, 1] */
export function dailyCycle(hourOfDay: number, peakHour: number = 14): number {
  const diff = Math.abs(hourOfDay - peakHour);
  const wrapped = Math.min(diff, 24 - diff);
  return Math.max(0, 1 - wrapped / 12);
}

/** Seasonal factor: 1.0 in summer, 0.0 in winter for cooling load */
export function seasonalFactor(dayOfYear: number): number {
  // Peak at day 182 (July 1), trough at day 0 (Jan 1)
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
}

/** Slow drift to simulate aging */
export function agingDrift(elapsedSeconds: number, driftRate: number = 0.00001): number {
  return Math.min(elapsedSeconds * driftRate, 0.2); // Cap at 20% degradation
}

/** Smooth random walk for natural-looking variation */
export function randomWalk(lastValue: number, stepSize: number, min: number, max: number): number {
  const step = gaussianNoise(0, stepSize);
  return clamp(lastValue + step, min, max);
}
