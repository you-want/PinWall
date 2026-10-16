import { afterEach, describe, expect, it, vi } from 'vitest';
import { startStoreHandlers } from './storeBootstrap';

afterEach(() => vi.useRealTimers());

describe('startStoreHandlers', () => {
  it('waits for every store to hydrate before completing', async () => {
    let hydrate: () => void = () => {};
    const slowStore = new Promise<void>((resolve) => { hydrate = resolve; });
    let complete = false;
    const started = startStoreHandlers([
      { start: () => Promise.resolve() },
      { start: () => slowStore },
    ]).then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    hydrate();
    await started;
    expect(complete).toBe(true);
  });

  it('fails startup when hydration fails instead of rendering defaults', async () => {
    await expect(startStoreHandlers([
      { start: () => Promise.reject(new Error('unreadable store')) },
    ])).rejects.toThrow('unreadable store');
  });

  it('fails a stalled startup and clears its timeout', async () => {
    vi.useFakeTimers();
    const started = startStoreHandlers([{ start: () => new Promise(() => {}) }], 100);
    const failure = expect(started).rejects.toThrow('Store initialization timed out');
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
});
