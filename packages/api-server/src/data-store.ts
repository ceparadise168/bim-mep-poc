import pg from 'pg';

const { Pool } = pg;

export interface DataStoreOptions {
  pool?: pg.Pool;
  connectionString?: string;
}

export class DataStore {
  private pool: pg.Pool;
  private owned: boolean;

  constructor(options: DataStoreOptions = {}) {
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

  async getDevices(filters?: { floor?: number; deviceType?: string; zone?: string }, page = 1, limit = 50) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.floor !== undefined) {
      conditions.push(`floor = $${idx++}`);
      params.push(filters.floor);
    }
    if (filters?.deviceType) {
      conditions.push(`device_type = $${idx++}`);
      params.push(filters.deviceType);
    }
    if (filters?.zone) {
      conditions.push(`zone = $${idx++}`);
      params.push(filters.zone);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(`SELECT COUNT(*) FROM devices ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await this.pool.query(
      `SELECT * FROM devices ${where} ORDER BY device_id LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );

    return { devices: result.rows, total, page, limit };
  }

  async getDevice(deviceId: string) {
    const [result, signals] = await Promise.all([
      this.pool.query('SELECT * FROM devices WHERE device_id = $1', [deviceId]),
      this.pool.query(
        `SELECT DISTINCT ON (metric_name) metric_name, value, time, quality
         FROM signals_raw WHERE device_id = $1 AND time > NOW() - INTERVAL '1 hour'
         ORDER BY metric_name, time DESC`,
        [deviceId],
      ),
    ]);
    if (result.rows.length === 0) return null;

    return { ...result.rows[0], latestSignals: signals.rows };
  }

  async getDeviceSignals(deviceId: string, options: { from?: string; to?: string; metric?: string; interval?: string } = {}) {
    const conditions = ['device_id = $1'];
    const params: unknown[] = [deviceId];
    let idx = 2;

    if (options.from) {
      conditions.push(`time >= $${idx++}`);
      params.push(options.from);
    }
    if (options.to) {
      conditions.push(`time <= $${idx++}`);
      params.push(options.to);
    }
    if (options.metric) {
      conditions.push(`metric_name = $${idx++}`);
      params.push(options.metric);
    }

    const table = options.interval === '1h' ? 'signals_agg_1h'
      : options.interval === '1m' ? 'signals_agg_1m'
      : 'signals_raw';

    const selectCols = table === 'signals_raw'
      ? 'time, metric_name, value, quality'
      : 'time, metric_name, avg_value as value, min_value, max_value, count';

    const result = await this.pool.query(
      `SELECT ${selectCols} FROM ${table} WHERE ${conditions.join(' AND ')} ORDER BY time DESC LIMIT 1000`,
      params,
    );

    return result.rows;
  }

  async getDeviceMaintenance(deviceId: string) {
    const result = await this.pool.query(
      'SELECT * FROM maintenance_logs WHERE device_id = $1 ORDER BY performed_at DESC LIMIT 100',
      [deviceId],
    );
    return result.rows;
  }

  async getFloorOverview(floor: number) {
    const [devices, anomalies] = await Promise.all([
      this.pool.query(
        'SELECT device_id, device_type, zone, vendor_name FROM devices WHERE floor = $1',
        [floor],
      ),
      this.pool.query(
        `SELECT COUNT(*) as count, severity FROM anomaly_events
         WHERE device_id IN (SELECT device_id FROM devices WHERE floor = $1)
         AND state != 'resolved' GROUP BY severity`,
        [floor],
      ),
    ]);

    return {
      floor,
      deviceCount: devices.rows.length,
      devices: devices.rows,
      activeAnomalies: anomalies.rows,
    };
  }

  async getBuildingDashboard() {
    const [deviceCount, devicesByType, activeAnomalies, recentEnergy] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM devices'),
      this.pool.query('SELECT device_type, COUNT(*) as count FROM devices GROUP BY device_type ORDER BY count DESC'),
      this.pool.query(`SELECT severity, COUNT(*) as count FROM anomaly_events WHERE state != 'resolved' GROUP BY severity`),
      this.pool.query(
        `SELECT hour, SUM(delta_kwh) as total_kwh FROM (
           SELECT time_bucket('1 hour', time) as hour, device_id,
                  MAX(value) - MIN(value) as delta_kwh
           FROM signals_raw WHERE metric_name = 'kwh'
           AND time > NOW() - INTERVAL '24 hours'
           GROUP BY hour, device_id
         ) sub GROUP BY hour ORDER BY hour`,
      ),
    ]);

    return {
      totalDevices: parseInt(deviceCount.rows[0]?.count ?? '0', 10),
      devicesByType: devicesByType.rows,
      activeAnomalies: activeAnomalies.rows,
      energyTrend: recentEnergy.rows,
    };
  }

  async getAnomalies(options: { deviceId?: string; type?: string; severity?: string; state?: string; limit?: number } = {}) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.deviceId) {
      conditions.push(`device_id = $${idx++}`);
      params.push(options.deviceId);
    }
    if (options.type) {
      conditions.push(`anomaly_type = $${idx++}`);
      params.push(options.type);
    }
    if (options.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(options.severity);
    }
    if (options.state) {
      conditions.push(`state = $${idx++}`);
      params.push(options.state);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 100;
    params.push(limit);

    const result = await this.pool.query(
      `SELECT * FROM anomaly_events ${where} ORDER BY detected_at DESC LIMIT $${idx}`,
      params,
    );
    return result.rows;
  }

  async getEnergyAnalytics() {
    const [floorEnergy, copTrend] = await Promise.all([
      this.pool.query(
        `SELECT floor, SUM(delta_kwh) as total_kwh FROM (
           SELECT d.floor, s.device_id,
                  MAX(s.value) - MIN(s.value) as delta_kwh
           FROM signals_raw s JOIN devices d ON s.device_id = d.device_id
           WHERE s.metric_name = 'kwh' AND s.time > NOW() - INTERVAL '24 hours'
           GROUP BY d.floor, s.device_id
         ) sub GROUP BY floor ORDER BY floor`,
      ),
      this.pool.query(
        `SELECT time_bucket('1 hour', time) as hour, AVG(value) as avg_cop
         FROM signals_raw WHERE metric_name = 'cop'
         AND time > NOW() - INTERVAL '24 hours'
         GROUP BY hour ORDER BY hour`,
      ),
    ]);

    return { floorEnergy: floorEnergy.rows, copTrend: copTrend.rows };
  }

  async getComfortAnalytics() {
    const floorComfort = await this.pool.query(
      `SELECT d.floor,
              AVG(CASE WHEN s.metric_name = 'temperature' THEN s.value END) as avg_temp,
              AVG(CASE WHEN s.metric_name = 'humidity' THEN s.value END) as avg_humidity,
              AVG(CASE WHEN s.metric_name = 'co2' THEN s.value END) as avg_co2
       FROM signals_raw s JOIN devices d ON s.device_id = d.device_id
       WHERE s.metric_name IN ('temperature', 'humidity', 'co2')
       AND s.time > NOW() - INTERVAL '1 hour'
       GROUP BY d.floor ORDER BY d.floor`,
    );
    return { floorComfort: floorComfort.rows };
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
