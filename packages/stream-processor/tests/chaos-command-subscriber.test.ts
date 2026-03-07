import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisChaosCommandSubscriber } from '../src/chaos-command-subscriber.js';

describe('RedisChaosCommandSubscriber', () => {
  const duplicate = vi.fn();
  const subscribe = vi.fn().mockResolvedValue(1);
  const on = vi.fn();
  const quit = vi.fn().mockResolvedValue('OK');

  beforeEach(() => {
    duplicate.mockReset();
    subscribe.mockReset();
    on.mockReset();
    quit.mockReset();

    duplicate.mockReturnValue({
      on,
      subscribe,
      quit,
    });
    subscribe.mockResolvedValue(1);
    quit.mockResolvedValue('OK');
  });

  it('duplicates the base Redis client with ready checks disabled', async () => {
    const subscriber = new RedisChaosCommandSubscriber({
      duplicate,
    } as any);

    expect(duplicate).toHaveBeenCalledWith(expect.objectContaining({ enableReadyCheck: false }));

    await subscriber.start(async () => {});

    expect(subscribe).toHaveBeenCalledWith('commands:chaos');
  });
});
