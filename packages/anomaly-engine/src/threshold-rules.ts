import { ThresholdRule } from './types.js';

export const defaultThresholdRules: ThresholdRule[] = [
  // Chiller — fire at 10/12, resolve at 9/11 (1°C dead band)
  { deviceType: 'chiller', metricName: 'refrigerantTemp', warningMax: 10, criticalMax: 12, resolveMax: 9 },
  { deviceType: 'chiller', metricName: 'compressorCurrent', warningMax: 100, criticalMax: 115, resolveMax: 95 },
  { deviceType: 'chiller', metricName: 'cop', warningMin: 3.0, criticalMin: 2.5, resolveMin: 3.2 },

  // AHU — fire at 18/20, resolve at 17 (1°C dead band)
  { deviceType: 'ahu', metricName: 'supplyTemp', warningMax: 18, criticalMax: 20, resolveMax: 17 },
  { deviceType: 'ahu', metricName: 'filterPressureDiff', warningMax: 300, criticalMax: 450, resolveMax: 280 },
  { deviceType: 'ahu', metricName: 'returnTemp', warningMax: 28, criticalMax: 32, resolveMax: 27 },

  // VFD
  { deviceType: 'vfd', metricName: 'temperature', warningMax: 65, criticalMax: 75, resolveMax: 60 },
  { deviceType: 'vfd', metricName: 'current', warningMax: 25, criticalMax: 28, resolveMax: 23 },

  // Power Panel — voltage has both min and max
  { deviceType: 'power-panel', metricName: 'voltageR', warningMin: 375, criticalMin: 370, warningMax: 395, criticalMax: 400, resolveMin: 378, resolveMax: 392 },
  { deviceType: 'power-panel', metricName: 'powerFactor', warningMin: 0.85, criticalMin: 0.75, resolveMin: 0.88 },

  // UPS
  { deviceType: 'ups', metricName: 'batteryVoltage', warningMin: 500, criticalMin: 485, resolveMin: 505 },
  { deviceType: 'ups', metricName: 'loadPercent', warningMax: 80, criticalMax: 90, resolveMax: 75 },

  // Generator
  { deviceType: 'generator', metricName: 'waterTemp', warningMax: 90, criticalMax: 95, resolveMax: 85 },
  { deviceType: 'generator', metricName: 'oilPressure', warningMin: 3.8, criticalMin: 3.5, resolveMin: 4.0 },

  // Fire Pump
  { deviceType: 'fire-pump', metricName: 'pipePressure', warningMin: 4.5, criticalMin: 4.0, resolveMin: 4.8 },

  // Elevator
  { deviceType: 'elevator', metricName: 'loadKg', warningMax: 1400, criticalMax: 1550, resolveMax: 1300 },

  // Temp/Humidity — both sides
  { deviceType: 'temp-humidity-sensor', metricName: 'temperature', warningMin: 18, criticalMin: 16, warningMax: 28, criticalMax: 32, resolveMin: 19, resolveMax: 27 },
  { deviceType: 'temp-humidity-sensor', metricName: 'humidity', warningMin: 35, criticalMin: 30, warningMax: 75, criticalMax: 80, resolveMin: 38, resolveMax: 72 },

  // Air Quality
  { deviceType: 'air-quality-sensor', metricName: 'co2', warningMax: 1000, criticalMax: 1500, resolveMax: 900 },
  { deviceType: 'air-quality-sensor', metricName: 'pm25', warningMax: 35, criticalMax: 75, resolveMax: 30 },
  { deviceType: 'air-quality-sensor', metricName: 'tvoc', warningMax: 500, criticalMax: 1000, resolveMax: 450 },

  // Water Meter
  { deviceType: 'water-meter', metricName: 'waterPressure', warningMin: 2.5, criticalMin: 2.0, resolveMin: 2.8 },
];
