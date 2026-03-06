import { DeviceTypeConfig, VendorInfo, DeviceMetadata, DeviceState, TimeContext } from './types.js';
import { gaussianNoise, clamp, dailyCycle, seasonalFactor, randomWalk } from './noise.js';

const ZONES = ['手術室區', '門診區', '急診區', '病房區', '行政區', '檢驗區', '藥局區', '復健區'];

const chillerVendors: VendorInfo[] = [
  { name: '大金', model: 'DAIKIN-WC-500RT', protocol: 'bacnet-ip', firmwareVersion: '3.2.1' },
  { name: '日立', model: 'HITACHI-RC-400RT', protocol: 'modbus-tcp', firmwareVersion: '2.8.0' },
];

const ahuVendors: VendorInfo[] = [
  { name: '大金', model: 'AHU-DK-2000', protocol: 'bacnet-ip', firmwareVersion: '4.1.0' },
  { name: '日立', model: 'AHU-HT-1500', protocol: 'modbus-tcp', firmwareVersion: '3.5.2' },
  { name: '三菱', model: 'AHU-ME-1800', protocol: 'opcua', firmwareVersion: '2.0.1' },
];

const vfdVendors: VendorInfo[] = [
  { name: '台達', model: 'VFD-C2000-75K', protocol: 'modbus-tcp', firmwareVersion: '1.12' },
  { name: '施耐德', model: 'ATV630-55K', protocol: 'opcua', firmwareVersion: '2.4.0' },
  { name: 'ABB', model: 'ACS580-45K', protocol: 'modbus-tcp', firmwareVersion: '3.1.0' },
];

const powerPanelVendors: VendorInfo[] = [
  { name: '施耐德', model: 'PM8240', protocol: 'modbus-tcp', firmwareVersion: '5.0.2' },
  { name: '西門子', model: 'PAC4200', protocol: 'opcua', firmwareVersion: '3.2.1' },
];

const upsVendors: VendorInfo[] = [
  { name: '伊頓', model: 'Eaton-9395-600', protocol: 'modbus-tcp', firmwareVersion: '4.3.0' },
  { name: 'APC', model: 'Galaxy-VS-500', protocol: 'restful', firmwareVersion: '2.1.5' },
];

const generatorVendors: VendorInfo[] = [
  { name: 'Cummins', model: 'QSK60-G23', protocol: 'modbus-tcp', firmwareVersion: '6.1.0' },
  { name: 'Caterpillar', model: 'C32-ACERT', protocol: 'modbus-tcp', firmwareVersion: '4.0.2' },
];

const firePumpVendors: VendorInfo[] = [
  { name: '大同', model: 'FP-150HP', protocol: 'modbus-tcp', firmwareVersion: '1.5.0' },
  { name: '川源', model: 'CFP-200', protocol: 'mqtt', firmwareVersion: '2.0.0' },
];

const elevatorVendors: VendorInfo[] = [
  { name: '三菱', model: 'NEXIEZ-MRL', protocol: 'opcua', firmwareVersion: '7.2.1' },
  { name: '日立', model: 'NX-SERIES', protocol: 'opcua', firmwareVersion: '5.1.0' },
];

const lightingVendors: VendorInfo[] = [
  { name: '飛利浦', model: 'Dynalite-DDNG', protocol: 'bacnet-ip', firmwareVersion: '3.0.0' },
  { name: '歐司朗', model: 'DALI-PRO2', protocol: 'mqtt', firmwareVersion: '2.5.1' },
];

const tempHumidityVendors: VendorInfo[] = [
  { name: 'Honeywell', model: 'H7080B', protocol: 'bacnet-ip', firmwareVersion: '1.2.0' },
  { name: 'Siemens', model: 'QFM2160', protocol: 'modbus-tcp', firmwareVersion: '2.0.0' },
  { name: '研華', model: 'WISE-2210', protocol: 'mqtt', firmwareVersion: '3.1.0' },
];

const waterMeterVendors: VendorInfo[] = [
  { name: '大同', model: 'DT-WM100', protocol: 'mqtt', firmwareVersion: '1.0.0' },
  { name: '松下', model: 'MF-UFB', protocol: 'modbus-tcp', firmwareVersion: '2.3.0' },
];

const airQualityVendors: VendorInfo[] = [
  { name: '研華', model: 'WISE-AQ100', protocol: 'mqtt', firmwareVersion: '2.0.0' },
  { name: 'Honeywell', model: 'IAQ-500', protocol: 'restful', firmwareVersion: '3.1.0' },
];

export const deviceConfigs: DeviceTypeConfig[] = [
  {
    type: 'chiller',
    count: 4,
    intervalMs: 1000,
    vendors: chillerVendors,
    zones: ['機房區'],
    generatePayload: (_dev, ctx, state) => {
      const load = dailyCycle(ctx.hourOfDay, 14) * seasonalFactor(ctx.dayOfYear);
      const refrigerantTemp = randomWalk(state.lastValues['refrigerantTemp'] ?? 7, 0.3, 4, 12);
      const compressorCurrent = clamp(gaussianNoise(80 * load + 20, 3), 15, 120);
      const cop = clamp(gaussianNoise(4.5 - state.agingFactor * 2, 0.2) * (0.5 + load * 0.5), 2.0, 6.0);
      state.lastValues['refrigerantTemp'] = refrigerantTemp;
      return { refrigerantTemp, compressorCurrent, cop, coolingLoad: clamp(load * 100, 0, 100) };
    },
    getMetricRanges: () => ({
      refrigerantTemp: { min: 4, max: 12, unit: '°C' },
      compressorCurrent: { min: 15, max: 120, unit: 'A' },
      cop: { min: 2.0, max: 6.0, unit: '' },
      coolingLoad: { min: 0, max: 100, unit: '%' },
    }),
  },
  {
    type: 'ahu',
    count: 24,
    intervalMs: 2000,
    vendors: ahuVendors,
    zones: ZONES,
    generatePayload: (_dev, ctx, state) => {
      const load = dailyCycle(ctx.hourOfDay, 14) * seasonalFactor(ctx.dayOfYear);
      const supplyTemp = randomWalk(state.lastValues['supplyTemp'] ?? 14, 0.2, 10, 20);
      const returnTemp = clamp(supplyTemp + gaussianNoise(8 + load * 4, 0.5), supplyTemp + 2, 32);
      const filterPressureDiff = clamp(gaussianNoise(120 + state.agingFactor * 200, 10), 50, 500);
      const airflow = clamp(gaussianNoise(2000 * (0.3 + load * 0.7), 50), 500, 3000);
      state.lastValues['supplyTemp'] = supplyTemp;
      return { supplyTemp, returnTemp, filterPressureDiff, airflow };
    },
    getMetricRanges: () => ({
      supplyTemp: { min: 10, max: 20, unit: '°C' },
      returnTemp: { min: 12, max: 32, unit: '°C' },
      filterPressureDiff: { min: 50, max: 500, unit: 'Pa' },
      airflow: { min: 500, max: 3000, unit: 'CMH' },
    }),
  },
  {
    type: 'vfd',
    count: 48,
    intervalMs: 1000,
    vendors: vfdVendors,
    zones: ZONES,
    generatePayload: (_dev, ctx, state) => {
      const load = dailyCycle(ctx.hourOfDay, 14);
      const frequency = randomWalk(state.lastValues['frequency'] ?? 50, 0.5, 20, 60);
      const current = clamp(gaussianNoise(15 * (frequency / 50), 0.5), 2, 30);
      const power = clamp(frequency * current * 0.38 * 0.85, 0, 600);
      const temperature = clamp(gaussianNoise(40 + load * 20, 1), 25, 80);
      state.lastValues['frequency'] = frequency;
      return { frequency, current, power, temperature };
    },
    getMetricRanges: () => ({
      frequency: { min: 20, max: 60, unit: 'Hz' },
      current: { min: 2, max: 30, unit: 'A' },
      power: { min: 0, max: 600, unit: 'kW' },
      temperature: { min: 25, max: 80, unit: '°C' },
    }),
  },
  {
    type: 'power-panel',
    count: 12,
    intervalMs: 5000,
    vendors: powerPanelVendors,
    zones: ['電氣室'],
    generatePayload: (_dev, ctx, state) => {
      const load = 0.4 + dailyCycle(ctx.hourOfDay, 14) * 0.5;
      const voltageR = randomWalk(state.lastValues['voltageR'] ?? 380, 1, 370, 400);
      const voltageS = randomWalk(state.lastValues['voltageS'] ?? 380, 1, 370, 400);
      const voltageT = randomWalk(state.lastValues['voltageT'] ?? 380, 1, 370, 400);
      const currentR = clamp(gaussianNoise(200 * load, 5), 20, 400);
      const currentS = clamp(gaussianNoise(200 * load, 5), 20, 400);
      const currentT = clamp(gaussianNoise(200 * load, 5), 20, 400);
      const powerFactor = clamp(gaussianNoise(0.92, 0.02), 0.7, 1.0);
      const kwh = (state.lastValues['kwh'] ?? 100000) + (currentR + currentS + currentT) * 0.38 * powerFactor * 5 / 3600;
      state.lastValues['voltageR'] = voltageR;
      state.lastValues['voltageS'] = voltageS;
      state.lastValues['voltageT'] = voltageT;
      state.lastValues['kwh'] = kwh;
      return { voltageR, voltageS, voltageT, currentR, currentS, currentT, powerFactor, kwh: Math.round(kwh) };
    },
    getMetricRanges: () => ({
      voltageR: { min: 370, max: 400, unit: 'V' },
      voltageS: { min: 370, max: 400, unit: 'V' },
      voltageT: { min: 370, max: 400, unit: 'V' },
      currentR: { min: 20, max: 400, unit: 'A' },
      powerFactor: { min: 0.7, max: 1.0, unit: '' },
      kwh: { min: 0, max: 999999, unit: 'kWh' },
    }),
  },
  {
    type: 'ups',
    count: 4,
    intervalMs: 3000,
    vendors: upsVendors,
    zones: ['電氣室'],
    generatePayload: (_dev, ctx, state) => {
      const load = 0.3 + dailyCycle(ctx.hourOfDay, 14) * 0.4;
      const batteryVoltage = randomWalk(state.lastValues['batteryVoltage'] ?? 540, 0.5, 480, 560);
      const loadPercent = clamp(gaussianNoise(load * 70, 2), 10, 95);
      const inputVoltage = randomWalk(state.lastValues['inputVoltage'] ?? 380, 1, 370, 400);
      const outputVoltage = clamp(gaussianNoise(380, 0.5), 378, 382);
      state.lastValues['batteryVoltage'] = batteryVoltage;
      state.lastValues['inputVoltage'] = inputVoltage;
      return { batteryVoltage, loadPercent, inputVoltage, outputVoltage };
    },
    getMetricRanges: () => ({
      batteryVoltage: { min: 480, max: 560, unit: 'V' },
      loadPercent: { min: 10, max: 95, unit: '%' },
      inputVoltage: { min: 370, max: 400, unit: 'V' },
      outputVoltage: { min: 378, max: 382, unit: 'V' },
    }),
  },
  {
    type: 'generator',
    count: 2,
    intervalMs: 5000,
    vendors: generatorVendors,
    zones: ['機房區'],
    generatePayload: (_dev, _ctx, state) => {
      const isRunning = state.isRunning;
      const rpm = isRunning ? clamp(gaussianNoise(1800, 5), 1780, 1820) : 0;
      const oilPressure = isRunning ? clamp(gaussianNoise(4.5, 0.1), 3.5, 5.5) : 0;
      const waterTemp = isRunning ? randomWalk(state.lastValues['waterTemp'] ?? 85, 0.5, 75, 95) : clamp(gaussianNoise(25, 1), 20, 30);
      const voltage = isRunning ? clamp(gaussianNoise(380, 2), 370, 400) : 0;
      const frequency = isRunning ? clamp(gaussianNoise(60, 0.1), 59.5, 60.5) : 0;
      state.lastValues['waterTemp'] = waterTemp;
      return { rpm, oilPressure, waterTemp, voltage, frequency, isRunning };
    },
    getMetricRanges: () => ({
      rpm: { min: 0, max: 1820, unit: 'RPM' },
      oilPressure: { min: 0, max: 5.5, unit: 'bar' },
      waterTemp: { min: 20, max: 95, unit: '°C' },
      voltage: { min: 0, max: 400, unit: 'V' },
      frequency: { min: 0, max: 60.5, unit: 'Hz' },
    }),
  },
  {
    type: 'fire-pump',
    count: 6,
    intervalMs: 10000,
    vendors: firePumpVendors,
    zones: ['消防機房'],
    generatePayload: (_dev, _ctx, state) => {
      const isRunning = state.isRunning;
      const pipePressure = isRunning
        ? clamp(gaussianNoise(7.0, 0.2), 5.0, 10.0)
        : clamp(gaussianNoise(5.0, 0.1), 4.0, 6.0);
      const current = isRunning ? clamp(gaussianNoise(85, 2), 60, 120) : 0;
      return { pipePressure, isRunning, current };
    },
    getMetricRanges: () => ({
      pipePressure: { min: 4, max: 10, unit: 'kg/cm²' },
      current: { min: 0, max: 120, unit: 'A' },
    }),
  },
  {
    type: 'elevator',
    count: 8,
    intervalMs: 1000,
    vendors: elevatorVendors,
    zones: ['電梯間'],
    generatePayload: (_dev, ctx, state) => {
      const floor = Math.floor(randomWalk(state.lastValues['floor'] ?? 1, 1.5, 1, 12));
      const doorOpen = Math.random() < 0.15;
      const maxLoad = 1600;
      const loadKg = clamp(
        gaussianNoise(maxLoad * dailyCycle(ctx.hourOfDay, 12) * 0.4, 100),
        0,
        maxLoad
      );
      const speed = doorOpen ? 0 : clamp(gaussianNoise(2.5, 0.1), 0, 4.0);
      state.lastValues['floor'] = floor;
      return { floor, doorOpen, loadKg: Math.round(loadKg), speed };
    },
    getMetricRanges: () => ({
      floor: { min: 1, max: 12, unit: '' },
      loadKg: { min: 0, max: 1600, unit: 'kg' },
      speed: { min: 0, max: 4, unit: 'm/s' },
    }),
  },
  {
    type: 'lighting-controller',
    count: 120,
    intervalMs: 30000,
    vendors: lightingVendors,
    zones: ZONES,
    generatePayload: (_dev, ctx, state) => {
      const occupancy = dailyCycle(ctx.hourOfDay, 12);
      const brightness = clamp(gaussianNoise(occupancy * 80 + 10, 3), 0, 100);
      const colorTemp = clamp(gaussianNoise(4000 + occupancy * 1000, 100), 2700, 6500);
      const operatingHours = (state.lastValues['operatingHours'] ?? 5000) + 30 / 3600;
      state.lastValues['operatingHours'] = operatingHours;
      return { brightness: Math.round(brightness), colorTemp: Math.round(colorTemp), operatingHours: Math.round(operatingHours) };
    },
    getMetricRanges: () => ({
      brightness: { min: 0, max: 100, unit: '%' },
      colorTemp: { min: 2700, max: 6500, unit: 'K' },
      operatingHours: { min: 0, max: 100000, unit: 'h' },
    }),
  },
  {
    type: 'temp-humidity-sensor',
    count: 200,
    intervalMs: 10000,
    vendors: tempHumidityVendors,
    zones: ZONES,
    generatePayload: (_dev, ctx, state) => {
      const ambient = 20 + seasonalFactor(ctx.dayOfYear) * 10 + dailyCycle(ctx.hourOfDay, 14) * 3;
      const temperature = randomWalk(state.lastValues['temperature'] ?? ambient, 0.2, 16, 35);
      const humidity = randomWalk(state.lastValues['humidity'] ?? 55, 0.5, 30, 85);
      state.lastValues['temperature'] = temperature;
      state.lastValues['humidity'] = humidity;
      return { temperature: Math.round(temperature * 10) / 10, humidity: Math.round(humidity * 10) / 10 };
    },
    getMetricRanges: () => ({
      temperature: { min: 16, max: 35, unit: '°C' },
      humidity: { min: 30, max: 85, unit: '%RH' },
    }),
  },
  {
    type: 'water-meter',
    count: 16,
    intervalMs: 15000,
    vendors: waterMeterVendors,
    zones: ['機房區', '給排水區'],
    generatePayload: (_dev, ctx, state) => {
      const usage = dailyCycle(ctx.hourOfDay, 11) * 0.5 + 0.2;
      const flowRate = clamp(gaussianNoise(usage * 50, 3), 0, 100);
      const cumulativeUsage = (state.lastValues['cumulativeUsage'] ?? 50000) + flowRate * 15 / 3600;
      const waterPressure = randomWalk(state.lastValues['waterPressure'] ?? 3.5, 0.1, 2.0, 5.0);
      state.lastValues['cumulativeUsage'] = cumulativeUsage;
      state.lastValues['waterPressure'] = waterPressure;
      return {
        flowRate: Math.round(flowRate * 10) / 10,
        cumulativeUsage: Math.round(cumulativeUsage),
        waterPressure: Math.round(waterPressure * 100) / 100,
      };
    },
    getMetricRanges: () => ({
      flowRate: { min: 0, max: 100, unit: 'L/min' },
      cumulativeUsage: { min: 0, max: 999999, unit: 'L' },
      waterPressure: { min: 2, max: 5, unit: 'kg/cm²' },
    }),
  },
  {
    type: 'air-quality-sensor',
    count: 30,
    intervalMs: 10000,
    vendors: airQualityVendors,
    zones: ZONES,
    generatePayload: (_dev, ctx, state) => {
      const occupancy = dailyCycle(ctx.hourOfDay, 14);
      const co2 = randomWalk(state.lastValues['co2'] ?? 450, 10, 350, 2000);
      const pm25 = randomWalk(state.lastValues['pm25'] ?? 15, 1, 5, 150);
      const tvoc = randomWalk(state.lastValues['tvoc'] ?? 200, 15, 50, 1500);
      state.lastValues['co2'] = co2 + occupancy * 100;
      state.lastValues['pm25'] = pm25;
      state.lastValues['tvoc'] = tvoc;
      return {
        co2: Math.round(clamp(co2 + occupancy * 300, 350, 2000)),
        pm25: Math.round(pm25 * 10) / 10,
        tvoc: Math.round(tvoc),
      };
    },
    getMetricRanges: () => ({
      co2: { min: 350, max: 2000, unit: 'ppm' },
      pm25: { min: 5, max: 150, unit: 'ug/m³' },
      tvoc: { min: 50, max: 1500, unit: 'ppb' },
    }),
  },
];
