import { describe, expect, it, vi } from 'vitest';
const nativeCheck = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-updater', () => ({ check: nativeCheck }));
import { autoCheckForUpdates, checkForUpdates, downloadAndInstall, getReleaseUrl } from './index';

describe('manual beta updates', () => {
  it('never checks or installs through the unconfigured native updater', async () => {
    await autoCheckForUpdates();
    await checkForUpdates(true);
    await downloadAndInstall();
    expect(nativeCheck).not.toHaveBeenCalled();
  });
  it('uses the canonical repository download page', () => {
    expect(getReleaseUrl()).toBe('https://github.com/you-want/PinWall/releases');
  });
});
