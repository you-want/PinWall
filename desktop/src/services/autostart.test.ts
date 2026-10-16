import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { updateLaunchOnStartup } from './storage';
import { setLaunchOnStartup } from './autostart';
import { createMockSettings } from '../__tests__/fixtures/settings';

vi.mock('@tauri-apps/plugin-autostart', () => ({ disable: vi.fn(), enable: vi.fn(), isEnabled: vi.fn() }));
vi.mock('./storage', () => ({ getSettings: vi.fn(), updateLaunchOnStartup: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('setLaunchOnStartup', () => {
  it('rolls the system change back when saving fails', async () => {
    vi.mocked(isEnabled).mockResolvedValue(false);
    vi.mocked(updateLaunchOnStartup).mockRejectedValue('storage_write_failed');
    await expect(setLaunchOnStartup(true)).rejects.toBe('storage_write_failed');
    expect(enable).toHaveBeenCalledOnce();
    expect(disable).toHaveBeenCalledOnce();
  });
  it('retains the system change when persistence succeeds', async () => {
    vi.mocked(isEnabled).mockResolvedValue(true);
    vi.mocked(updateLaunchOnStartup).mockResolvedValue(createMockSettings({ launchOnStartup: false }));
    expect(await setLaunchOnStartup(false)).toMatchObject({ launchOnStartup: false });
    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });
});
