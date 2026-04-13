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

-- Anomaly events (fingerprint-deduped, state machine)
CREATE TABLE IF NOT EXISTS anomaly_events (
  id               SERIAL PRIMARY KEY,
  fingerprint      TEXT NOT NULL,
  device_id        TEXT NOT NULL,
  anomaly_type     TEXT NOT NULL,
  severity         TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'firing',
  message          TEXT,
  metric_name      TEXT,
  metric_value     DOUBLE PRECISION,
  threshold        DOUBLE PRECISION,
  detected_at      TIMESTAMPTZ DEFAULT NOW(),
  fired_at         TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  last_eval_at     TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INTEGER DEFAULT 1,
  metadata         JSONB,
  CONSTRAINT valid_alert_state CHECK (state IN ('pending','firing','resolved'))
);

-- Alert state transitions log
CREATE TABLE IF NOT EXISTS alert_transitions (
  id         BIGSERIAL PRIMARY KEY,
  alert_id   INTEGER REFERENCES anomaly_events(id),
  from_state TEXT,
  to_state   TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value      DOUBLE PRECISION,
  annotation TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_signals_raw_device ON signals_raw (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_raw_device_metric ON signals_raw (device_id, metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_raw_metric ON signals_raw (metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_agg_1m_device ON signals_agg_1m (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_agg_1h_device ON signals_agg_1h (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_device ON anomaly_events (device_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type ON anomaly_events (anomaly_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_fingerprint ON anomaly_events (fingerprint);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_active ON anomaly_events (state) WHERE state != 'resolved';
CREATE UNIQUE INDEX IF NOT EXISTS idx_anomaly_events_active_fp ON anomaly_events (fingerprint) WHERE state != 'resolved';
`;

export const CREATE_HYPERTABLES_SQL = `
SELECT create_hypertable('signals_raw', 'time', if_not_exists => TRUE);
SELECT create_hypertable('signals_agg_1m', 'time', if_not_exists => TRUE);
SELECT create_hypertable('signals_agg_1h', 'time', if_not_exists => TRUE);
`;

export const RETENTION_POLICY_SQL = `
SELECT add_retention_policy('signals_raw', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('signals_agg_1m', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('signals_agg_1h', INTERVAL '365 days', if_not_exists => TRUE);
`;
