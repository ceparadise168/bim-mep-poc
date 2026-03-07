import { describe, expect, it } from 'vitest';
import { buildDeviceSeedRecords } from '../src/device-seeder.js';

describe('device seeder', () => {
  it('builds seed records for the full simulated device fleet', async () => {
    const devices = await buildDeviceSeedRecords();

    expect(devices).toHaveLength(474);
    expect(devices[0]).toMatchObject({
      deviceId: expect.any(String),
      deviceType: expect.any(String),
      vendorName: expect.any(String),
      vendorProtocol: expect.any(String),
      geometry: expect.objectContaining({
        position: expect.any(Object),
        dimensions: expect.any(Object),
        bimModelRef: expect.any(String),
      }),
    });
  });
});
