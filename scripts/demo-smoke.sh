#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3100}"

echo "BOOTSTRAP_OK: checking seeded devices"
devices_total="$(curl -fsS "${API_URL}/api/v1/devices?limit=1" | grep -o '"total":[0-9]*' | head -n1 | cut -d: -f2)"
if [[ -z "${devices_total}" || "${devices_total}" -lt 474 ]]; then
  echo "Expected at least 474 seeded devices, got '${devices_total:-missing}'" >&2
  exit 1
fi

echo "INGEST_OK: checking ingestion gateway health"
curl -fsS "${GATEWAY_URL}/health" >/dev/null

echo "CHAOS_OK: triggering a fault injection"
curl -fsS -X POST "${API_URL}/api/v1/chaos/trigger" \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"空調主機故障","devices":["CH-00F-001"]}' >/dev/null

sleep 2

echo "ANOMALY_OK: checking anomaly feed"
curl -fsS "${API_URL}/api/v1/anomalies?limit=5" | grep -q '"device_id":"CH-00F-001"' || {
  echo "Expected anomaly event for CH-00F-001 after chaos trigger" >&2
  exit 1
}

echo "SMOKE_OK"
