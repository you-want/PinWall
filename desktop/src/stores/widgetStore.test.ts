import { describe, it, expect, beforeEach } from 'vitest';
import type { WidgetManifest } from '@/types';

function createMockManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id: 'com.test.widget',
    name: 'Test Widget',
    description: 'A test widget',
    version: '1.0.0',
    author: 'Test',
    entry: 'index.html',
    icon: 'icon.png',
    type: 'official',
    category: 'utility',
    permissions: ['storage', 'theme'],
    defaultSize: { width: 200, height: 200 },
    settings: [
      { key: 'color', label: 'Color', type: 'select', options: ['red', 'blue'], default: 'blue' },
      { key: 'count', label: 'Count', type: 'number', default: 5 },
    ],
    ...overrides,
  };
}

describe('useWidgetStore', () => {
  let useWidgetStore: typeof import('@/stores/widgetStore').useWidgetStore;

  beforeEach(async () => {
    const mod = await import('@/stores/widgetStore');
    useWidgetStore = mod.useWidgetStore;
    useWidgetStore.setState({
      widgets: [],
      _zIndexCounter: 50,
    });
  });

  describe('installWidget', () => {
    it('installs a widget with default settings', () => {
      const manifest = createMockManifest();
      useWidgetStore.getState().installWidget(manifest);

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets).toHaveLength(1);
      expect(widgets[0].manifest.id).toBe('com.test.widget');
      expect(widgets[0].enabled).toBe(true);
      expect(widgets[0].x).toBe(50);
      expect(widgets[0].y).toBe(50);
      expect(widgets[0].size).toEqual({ width: 200, height: 200 });
      expect(widgets[0].zIndex).toBe(51);
    });

    it('builds default settings from manifest', () => {
      const manifest = createMockManifest();
      useWidgetStore.getState().installWidget(manifest);

      const settings = useWidgetStore.getState().widgets[0].settings;
      expect(settings).toEqual({ color: 'blue', count: 5 });
    });

    it('updates an existing widget instead of duplicating it', () => {
      const manifest = createMockManifest();
      useWidgetStore.getState().installWidget(manifest);
      useWidgetStore.getState().toggleWidget(manifest.id, false);
      useWidgetStore.getState().installWidget(createMockManifest({ version: '1.1.0', installedPath: '/tmp/widget' }));

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets).toHaveLength(1);
      expect(widgets[0].manifest.version).toBe('1.1.0');
      expect(widgets[0].manifest.installedPath).toBe('/tmp/widget');
      expect(widgets[0].enabled).toBe(true);
    });

    it('increments zIndex for each widget', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'b' }));
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'c' }));

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets[0].zIndex).toBe(51);
      expect(widgets[1].zIndex).toBe(52);
      expect(widgets[2].zIndex).toBe(53);
    });

    it('handles manifest without settings', () => {
      const manifest = createMockManifest({ settings: undefined });
      useWidgetStore.getState().installWidget(manifest);

      expect(useWidgetStore.getState().widgets[0].settings).toEqual({});
    });
  });

  describe('uninstallWidget', () => {
    it('removes widget by id', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'b' }));
      useWidgetStore.getState().uninstallWidget('a');

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets).toHaveLength(1);
      expect(widgets[0].manifest.id).toBe('b');
    });

    it('no-op for non-existent id', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().uninstallWidget('nonexistent');

      expect(useWidgetStore.getState().widgets).toHaveLength(1);
    });
  });

  describe('toggleWidget', () => {
    it('disables a widget', () => {
      useWidgetStore.getState().installWidget(createMockManifest());
      useWidgetStore.getState().toggleWidget('com.test.widget', false);

      expect(useWidgetStore.getState().widgets[0].enabled).toBe(false);
    });

    it('re-enables a widget', () => {
      useWidgetStore.getState().installWidget(createMockManifest());
      useWidgetStore.getState().toggleWidget('com.test.widget', false);
      useWidgetStore.getState().toggleWidget('com.test.widget', true);

      expect(useWidgetStore.getState().widgets[0].enabled).toBe(true);
    });
  });

  describe('setPosition', () => {
    it('updates widget position', () => {
      useWidgetStore.getState().installWidget(createMockManifest());
      useWidgetStore.getState().setPosition('com.test.widget', 100, 200);

      const w = useWidgetStore.getState().widgets[0];
      expect(w.x).toBe(100);
      expect(w.y).toBe(200);
    });
  });

  describe('setSize', () => {
    it('updates widget size', () => {
      useWidgetStore.getState().installWidget(createMockManifest());
      useWidgetStore.getState().setSize('com.test.widget', { width: 300, height: 300 });

      expect(useWidgetStore.getState().widgets[0].size).toEqual({ width: 300, height: 300 });
    });
  });

  describe('bringToFront', () => {
    it('brings widget to front with highest zIndex', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'b' }));

      // a=51, b=52, counter=52
      useWidgetStore.getState().bringToFront('a');
      // a should now be 53, counter=53

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets.find((w) => w.manifest.id === 'a')!.zIndex).toBe(53);
      expect(widgets.find((w) => w.manifest.id === 'b')!.zIndex).toBe(52);
    });
  });

  describe('updateSettings', () => {
    it('merges new settings into existing', () => {
      useWidgetStore.getState().installWidget(createMockManifest());
      useWidgetStore.getState().updateSettings('com.test.widget', { color: 'red' });

      const settings = useWidgetStore.getState().widgets[0].settings;
      expect(settings.color).toBe('red');
      expect(settings.count).toBe(5); // unchanged
    });
  });

  describe('syncWidgets', () => {
    it('adds new widgets and removes stale ones', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'b' }));

      // sync with only 'b' and new 'c'
      useWidgetStore.getState().syncWidgets([
        createMockManifest({ id: 'b' }),
        createMockManifest({ id: 'c' }),
      ]);

      const widgets = useWidgetStore.getState().widgets;
      expect(widgets).toHaveLength(2);
      expect(widgets.map((w) => w.manifest.id).sort()).toEqual(['b', 'c']);
    });

    it('updates manifest for existing widgets', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a', version: '1.0.0' }));
      useWidgetStore.getState().syncWidgets([
        createMockManifest({ id: 'a', version: '2.0.0' }),
      ]);

      expect(useWidgetStore.getState().widgets[0].manifest.version).toBe('2.0.0');
    });

    it('preserves user settings during sync', () => {
      useWidgetStore.getState().installWidget(createMockManifest({ id: 'a' }));
      useWidgetStore.getState().updateSettings('a', { color: 'red' });

      useWidgetStore.getState().syncWidgets([createMockManifest({ id: 'a' })]);

      expect(useWidgetStore.getState().widgets[0].settings.color).toBe('red');
    });
  });
});
