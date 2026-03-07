import type pg from 'pg';
import type { DeviceRecord } from './db-writer.js';

export async function buildDeviceSeedRecords(): Promise<DeviceRecord[]> {
  const deviceFactoryModulePath = new URL('../../signal-simulator/src/device-factory.js', import.meta.url).href;
  const deviceConfigsModulePath = new URL('../../signal-simulator/src/device-configs.js', import.meta.url).href;
  const [{ createDevices }, { deviceConfigs }] = await Promise.all([
    import(deviceFactoryModulePath),
    import(deviceConfigsModulePath),
  ]);

  return createDevices(deviceConfigs).map((device: any) => ({
    deviceId: device.metadata.deviceId,
    deviceType: device.metadata.deviceType,
    floor: device.metadata.floor,
    zone: device.metadata.zone,
    vendorName: device.metadata.vendor.name,
    vendorModel: device.metadata.vendor.model,
    vendorProtocol: device.metadata.vendor.protocol,
    firmwareVersion: device.metadata.vendor.firmwareVersion,
    installDate: device.metadata.installDate,
    warrantyExpiry: device.metadata.warrantyExpiry,
    maintenanceSchedule: device.metadata.maintenanceSchedule,
    geometry: device.metadata.geometry,
  }));
}

export async function seedDevices(pool: pg.Pool): Promise<number> {
  const devices = await buildDeviceSeedRecords();
  if (devices.length === 0) return 0;

  const COLS = 12;
  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (let i = 0; i < devices.length; i++) {
    const offset = i * COLS;
    placeholders.push(`(${Array.from({ length: COLS }, (_, j) => `$${offset + j + 1}`).join(', ')})`);
    const d = devices[i];
    values.push(
      d.deviceId, d.deviceType, d.floor, d.zone,
      d.vendorName, d.vendorModel, d.vendorProtocol, d.firmwareVersion,
      d.installDate, d.warrantyExpiry, d.maintenanceSchedule, JSON.stringify(d.geometry),
    );
  }

  await pool.query(
    `INSERT INTO devices (device_id, device_type, floor, zone, vendor_name, vendor_model, vendor_protocol, firmware_version, install_date, warranty_expiry, maintenance_schedule, geometry)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (device_id) DO UPDATE SET
       device_type = EXCLUDED.device_type,
       floor = EXCLUDED.floor,
       zone = EXCLUDED.zone,
       vendor_name = EXCLUDED.vendor_name,
       vendor_model = EXCLUDED.vendor_model,
       vendor_protocol = EXCLUDED.vendor_protocol,
       firmware_version = EXCLUDED.firmware_version,
       install_date = EXCLUDED.install_date,
       warranty_expiry = EXCLUDED.warranty_expiry,
       maintenance_schedule = EXCLUDED.maintenance_schedule,
       geometry = EXCLUDED.geometry,
       updated_at = NOW()`,
    values,
  );

  return devices.length;
}
