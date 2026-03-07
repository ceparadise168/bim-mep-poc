import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/signal-simulator',
  'packages/ingestion-gateway',
  'packages/stream-processor',
  'packages/anomaly-engine',
  'packages/api-server',
  'packages/dashboard',
  'tests/integration',
]);
