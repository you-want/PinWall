import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './appStore';

afterEach(() => vi.mocked(invoke).mockReset());

describe('createAppStore', () => {
  it('propagates a load failure that tauri-store normally swallows', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'plugin:zustand|load') throw new Error('unreadable native data');
      return null;
    });
    const store = create<{ cards: string[] }>(() => ({ cards: [] }));
    const handler = createAppStore('failed-load', store);
    await expect(handler.start()).rejects.toThrow('failed to initialize');
    expect(store.getState().cards).toEqual([]);
  });
});
