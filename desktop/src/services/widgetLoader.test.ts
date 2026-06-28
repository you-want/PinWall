import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getWidgetFrameUrl,
  installOfficialWidget,
  isSafeWidgetRelativePath,
  isValidWidgetId,
  validateManifest,
} from './widgetLoader';
import type { WidgetManifest } from '@/types';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://converted/${path}`),
}));

function createManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id: 'com.pinwall.clock',
    name: 'Clock',
    description: 'Desktop clock',
    version: '1.0.0',
    author: 'PinWall',
    entry: 'index.html',
    icon: 'icon.png',
    type: 'official',
    category: 'utility',
    permissions: ['storage', 'theme', 'i18n'],
    defaultSize: { width: 200, height: 200 },
    ...overrides,
  };
}

describe('widgetLoader validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts reverse-domain widget ids', () => {
    expect(isValidWidgetId('com.pinwall.clock')).toBe(true);
    expect(isValidWidgetId('io.example.my-widget1')).toBe(true);
  });

  it('rejects unsafe widget ids', () => {
    expect(isValidWidgetId('../clock')).toBe(false);
    expect(isValidWidgetId('com..clock')).toBe(false);
    expect(isValidWidgetId('Com.PinWall.Clock')).toBe(false);
    expect(isValidWidgetId('clock')).toBe(false);
  });

  it('accepts only safe relative widget paths', () => {
    expect(isSafeWidgetRelativePath('index.html')).toBe(true);
    expect(isSafeWidgetRelativePath('dist/index.html')).toBe(true);
    expect(isSafeWidgetRelativePath('../index.html')).toBe(false);
    expect(isSafeWidgetRelativePath('/tmp/index.html')).toBe(false);
    expect(isSafeWidgetRelativePath('dist\\index.html')).toBe(false);
  });

  it('validates a complete manifest', () => {
    expect(validateManifest(createManifest())).toBe(true);
  });

  it('rejects invalid manifest paths and sizes', () => {
    expect(validateManifest(createManifest({ entry: '../index.html' }))).toBe(false);
    expect(validateManifest(createManifest({ icon: '/tmp/icon.png' }))).toBe(false);
    expect(validateManifest(createManifest({ defaultSize: { width: 0, height: 200 } }))).toBe(false);
  });

  it('rejects invalid manifest enums', () => {
    expect(validateManifest(createManifest({ type: 'unknown' as any }))).toBe(false);
    expect(validateManifest(createManifest({ category: 'unknown' as any }))).toBe(false);
    expect(validateManifest(createManifest({ permissions: ['storage', 'dangerous'] as any }))).toBe(false);
  });

  it('validates bundled example widget manifests', () => {
    const widgetsDir = join(process.cwd(), '../widgets');
    const manifestPaths = readdirSync(widgetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(widgetsDir, entry.name, 'widget.json'));

    expect(manifestPaths.length).toBeGreaterThan(0);
    for (const manifestPath of manifestPaths) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(validateManifest(manifest), manifestPath).toBe(true);
    }
  });

  it('uses installedPath to build iframe URLs for installed widgets', () => {
    const url = getWidgetFrameUrl(createManifest({
      installedPath: '/Users/test/Library/Application Support/PinWall/widgets/com.pinwall.clock',
    }));

    expect(url).toBe('asset://converted//Users/test/Library/Application Support/PinWall/widgets/com.pinwall.clock/index.html');
  });

  it('installs official widgets through the dedicated Tauri command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(createManifest());

    const result = await installOfficialWidget('com.pinwall.clock');

    expect(invoke).toHaveBeenCalledWith('install_official_widget', { id: 'com.pinwall.clock' });
    expect(result.manifest?.id).toBe('com.pinwall.clock');
    expect(result.error).toBeUndefined();
  });

  it('returns a visible error for unknown official widgets', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Official widget is not available'));

    const result = await installOfficialWidget('com.pinwall.unknown');

    expect(invoke).toHaveBeenCalledWith('install_official_widget', { id: 'com.pinwall.unknown' });
    expect(result.manifest).toBeNull();
    expect(result.error).toBe('Official widget is not available');
  });
});
