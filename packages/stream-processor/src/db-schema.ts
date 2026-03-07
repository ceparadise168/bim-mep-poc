export const CREATE_TABLES_SQL = `
-- Raw signals hypertable
CREATE TABLE IF NOT EXISTS signals_raw (
  time        TIMESTAMPTZ NOT NULL,
  device_id   TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value       DOUBLE PRECISION,
  quality     TEXT DEFAULT 'good',
  metadata    JSONB
);

-- 1-minute aggregation
CREATE TABLE IF NOT EXISTS signals_agg_1m (
  time        TIMESTAMPTZ NOT NULL,
  device_id   TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  avg_value   DOUBLE PRECISION,
  min_value   DOUBLE PRECISION,
  max_value   DOUBLE PRECISION,
  count       INTEGER
);

-- 1-hour aggregation
CREATE TABLE IF NOT EXISTS signals_agg_1h (
  time        TIMESTAMPTZ NOT NULL,
  device_id   TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  avg_value   DOUBLE PRECISION,
  min_value   DOUBLE PRECISION,
  max_value   DOUBLE PRECISION,
  count       INTEGER
);

-- Device registry
CREATE TABLE IF NOT EXISTS devices (
  device_id           TEXT PRIMARY KEY,
  device_type         TEXT NOT NULL,
  floor               INTEGER,
  zone                TEXT,
  vendor_name         TEXT,
  vendor_model        TEXT,
  vendor_protocol     TEXT,
  firmware_version    TEXT,
  install_date        DATE,
  warranty_expiry     DATE,
  maintenance_schedule TEXT,
  geometry            JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance logs
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id          SERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(device_id),
  log_type    TEXT NOT NULL,
  description TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  performed_by TEXT
);

-- Anomaly events
CREATE TABLE IF NOT EXISTS anomaly_events (
  id          SERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  severity    TEXT NOT NULL,
  message     TEXT,
  metric_name TEXT,
  metric_value DOUBLE PRECISION,
  threshold   DOUBLE PRECISION,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  metadata    JSONB
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_signals_raw_device ON signals_raw (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_raw_metric ON signals_raw (metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_agg_1m_device ON signals_agg_1m (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_agg_1h_device ON signals_agg_1h (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_device ON anomaly_events (device_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type ON anomaly_events (anomaly_type, detected_at DESC);
`;

export const CREATE_HYPERTABLES_SQL = `
SELECT create_hypertable('signals_raw', 'time', if_not_exists => TRUE);
SELECT create_hypertable('signals_agg_1m', 'time', if_not_exists => TRUE);
SELECT create_hypertable('signals_agg_1h', 'time', if_not_exists => TRUE);
`;

export const RETENTION_POLICY_SQL = `
SELECT add_retention_policy('signals_raw', INTERVAL '7 days', if_not_exists => TRUE);
`;
