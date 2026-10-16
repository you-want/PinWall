import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { addBackgroundImage, getSettings, updateCareSettings, updateOpacity } from './storage';

describe('settings transactions', () => {
  let document: Record<string, unknown>;
  beforeEach(() => {
    document = { schemaVersion: 1, revision: 0 };
    vi.mocked(invoke).mockImplementation(async (command, raw) => {
      if (command === 'settings_read') return structuredClone(document);
      if (command === 'settings_compare_and_swap') {
        const args = raw as { expectedRevision: number; data: Record<string, unknown> };
        if (args.expectedRevision !== document.revision) return null;
        document = { ...structuredClone(args.data), schemaVersion: 1, revision: args.expectedRevision + 1 };
        return structuredClone(document);
      }
      throw new Error('Unexpected command');
    });
  });

  it('retries a stale revision and preserves disjoint updates from concurrent callers', async () => {
    await Promise.all([updateOpacity(0.4), updateCareSettings({ weatherCity: 'Shanghai' })]);
    expect(await getSettings()).toMatchObject({ opacity: 0.4, weatherCity: 'Shanghai' });
    expect(document.revision).toBe(2);
  });

  it('replays array operations against the latest data', async () => {
    await Promise.all([addBackgroundImage('a.png', 'a'), addBackgroundImage('b.png', 'b')]);
    const settings = await getSettings();
    expect(settings.backgroundImages.map(image => image.fileName).sort()).toEqual(['a', 'b']);
    expect(settings.backgroundImages.filter(image => image.isDefault)).toHaveLength(1);
  });

  it('migrates legacy holidays and supplies independent nested defaults', async () => {
    document.holidayEnabled = false;
    const first = await getSettings();
    first.quotaMonitor?.models.push({ id: 'a', name: 'a', apiKey: '', apiEndpoint: '', model: 'custom' });
    expect(await getSettings()).toMatchObject({ holidayEnabledCn: false, holidayEnabledIntl: false, quotaMonitor: { models: [] } });
  });

  it('propagates unreadable storage instead of returning defaults', async () => {
    vi.mocked(invoke).mockRejectedValue('storage_unreadable');
    await expect(getSettings()).rejects.toBe('storage_unreadable');
    await expect(updateOpacity(0.5)).rejects.toBe('storage_unreadable');
  });

  it('rejects future versions and malformed native responses', async () => {
    document.schemaVersion = 20;
    await expect(getSettings()).rejects.toThrow();
    document = { schemaVersion: 1, revision: 0, opacity: 'invalid' };
    await expect(getSettings()).rejects.toThrow();
  });

  it('bounds retries when other windows keep winning', async () => {
    vi.mocked(invoke).mockImplementation(async command => command === 'settings_read' ? document : null);
    await expect(updateOpacity(0.5)).rejects.toThrow('settings_busy');
  });
});
