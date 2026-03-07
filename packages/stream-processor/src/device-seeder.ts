import type pg from 'pg';

export interface DeviceSeedRecord {
  deviceId: string;
  deviceType: string;
  floor: number;
  zone: string;
  vendorName: string;
  vendorModel: string;
  vendorProtocol: string;
  firmwareVersion: string;
  installDate: string;
  warrantyExpiry: string;
  maintenanceSchedule: string;
  geometry: Record<string, unknown>;
}

export async function buildDeviceSeedRecords(): Promise<DeviceSeedRecord[]> {
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

  for (const device of devices) {
    await pool.query(
      `INSERT INTO devices (device_id, device_type, floor, zone, vendor_name, vendor_model, vendor_protocol, firmware_version, install_date, warranty_expiry, maintenance_schedule, geometry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      [
        device.deviceId,
        device.deviceType,
        device.floor,
        device.zone,
        device.vendorName,
        device.vendorModel,
        device.vendorProtocol,
        device.firmwareVersion,
        device.installDate,
        device.warrantyExpiry,
        device.maintenanceSchedule,
        JSON.stringify(device.geometry),
      ],
    );
  }

  return devices.length;
}
