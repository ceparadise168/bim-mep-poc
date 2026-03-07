import pg from 'pg';

const { Pool } = pg;

export interface DbWriterOptions {
  connectionString?: string;
  pool?: pg.Pool;
}

export interface SignalRecord {
  time: Date;
  deviceId: string;
  metricName: string;
  value: number;
  quality: string;
  metadata: Record<string, unknown>;
}

export class DbWriter {
  private pool: pg.Pool;
  private writeCount = 0;
  private owned: boolean;

  constructor(options: DbWriterOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.owned = false;
    } else {
      this.pool = new Pool({
        connectionString: options.connectionString ?? 'postgresql://postgres:postgres@localhost:5432/bim_mep',
        max: 10,
      });
      this.owned = true;
    }
  }

  async writeSignals(records: SignalRecord[]): Promise<void> {
    if (records.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const offset = i * 6;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
      values.push(r.time, r.deviceId, r.metricName, r.value, r.quality, JSON.stringify(r.metadata));
    }

    await this.pool.query(
      `INSERT INTO signals_raw (time, device_id, metric_name, value, quality, metadata) VALUES ${placeholders.join(', ')}`,
      values,
    );
    this.writeCount += records.length;
  }

  async writeAggregation(table: 'signals_agg_1m' | 'signals_agg_1h', records: AggRecord[]): Promise<void> {
    if (records.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const offset = i * 7;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
      values.push(r.time, r.deviceId, r.metricName, r.avgValue, r.minValue, r.maxValue, r.count);
    }

    await this.pool.query(
      `INSERT INTO ${table} (time, device_id, metric_name, avg_value, min_value, max_value, count) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  async registerDevice(device: DeviceRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO devices (device_id, device_type, floor, zone, vendor_name, vendor_model, vendor_protocol, firmware_version, install_date, warranty_expiry, maintenance_schedule, geometry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (device_id) DO UPDATE SET updated_at = NOW()`,
      [device.deviceId, device.deviceType, device.floor, device.zone,
       device.vendorName, device.vendorModel, device.vendorProtocol, device.firmwareVersion,
       device.installDate, device.warrantyExpiry, device.maintenanceSchedule, JSON.stringify(device.geometry)],
    );
  }

  getWriteCount(): number {
    return this.writeCount;
  }

  getPool(): pg.Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.owned) {
      await this.pool.end();
    }
  }
}

export interface AggRecord {
  time: Date;
  deviceId: string;
  metricName: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  count: number;
}

export interface DeviceRecord {
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
