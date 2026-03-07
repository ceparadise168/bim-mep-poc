import { ThresholdRule } from './types.js';

export const defaultThresholdRules: ThresholdRule[] = [
  // Chiller
  { deviceType: 'chiller', metricName: 'refrigerantTemp', warningMax: 10, criticalMax: 12 },
  { deviceType: 'chiller', metricName: 'compressorCurrent', warningMax: 100, criticalMax: 115 },
  { deviceType: 'chiller', metricName: 'cop', warningMin: 3.0, criticalMin: 2.5 },

  // AHU
  { deviceType: 'ahu', metricName: 'supplyTemp', warningMax: 18, criticalMax: 20 },
  { deviceType: 'ahu', metricName: 'filterPressureDiff', warningMax: 300, criticalMax: 450 },
  { deviceType: 'ahu', metricName: 'returnTemp', warningMax: 28, criticalMax: 32 },

  // VFD
  { deviceType: 'vfd', metricName: 'temperature', warningMax: 65, criticalMax: 75 },
  { deviceType: 'vfd', metricName: 'current', warningMax: 25, criticalMax: 28 },

  // Power Panel
  { deviceType: 'power-panel', metricName: 'voltageR', warningMin: 375, criticalMin: 370, warningMax: 395, criticalMax: 400 },
  { deviceType: 'power-panel', metricName: 'powerFactor', warningMin: 0.85, criticalMin: 0.75 },

  // UPS
  { deviceType: 'ups', metricName: 'batteryVoltage', warningMin: 500, criticalMin: 485 },
  { deviceType: 'ups', metricName: 'loadPercent', warningMax: 80, criticalMax: 90 },

  // Generator
  { deviceType: 'generator', metricName: 'waterTemp', warningMax: 90, criticalMax: 95 },
  { deviceType: 'generator', metricName: 'oilPressure', warningMin: 3.8, criticalMin: 3.5 },

  // Fire Pump
  { deviceType: 'fire-pump', metricName: 'pipePressure', warningMin: 4.5, criticalMin: 4.0 },

  // Elevator
  { deviceType: 'elevator', metricName: 'loadKg', warningMax: 1400, criticalMax: 1550 },

  // Temp/Humidity
  { deviceType: 'temp-humidity-sensor', metricName: 'temperature', warningMin: 18, criticalMin: 16, warningMax: 28, criticalMax: 32 },
  { deviceType: 'temp-humidity-sensor', metricName: 'humidity', warningMin: 35, criticalMin: 30, warningMax: 75, criticalMax: 80 },

  // Air Quality
  { deviceType: 'air-quality-sensor', metricName: 'co2', warningMax: 1000, criticalMax: 1500 },
  { deviceType: 'air-quality-sensor', metricName: 'pm25', warningMax: 35, criticalMax: 75 },
  { deviceType: 'air-quality-sensor', metricName: 'tvoc', warningMax: 500, criticalMax: 1000 },

  // Water Meter
  { deviceType: 'water-meter', metricName: 'waterPressure', warningMin: 2.5, criticalMin: 2.0 },
];
