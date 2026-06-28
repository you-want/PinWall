import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WidgetFrame } from '@/components/WidgetFrame';
import { useWidgetStore } from '@/stores/widgetStore';
import type { WidgetInstance } from '@/types';

vi.mock('@/services/widgetLoader', () => ({
  getWidgetFrameUrl: vi.fn(() => 'asset://localhost/widgets/com.pinwall.clock/index.html'),
  loadWidgetEntryHtml: vi.fn(async () => '<!doctype html><html><body>Clock</body></html>'),
}));

vi.mock('@/services/widgetBridge', () => ({
  handleBridgeRequest: vi.fn(),
  subscribeWidgetEvent: vi.fn(() => vi.fn()),
}));

function createInstance(overrides: Partial<WidgetInstance> = {}): WidgetInstance {
  return {
    manifest: {
      id: 'com.pinwall.clock',
      name: 'Clock',
      description: 'Clock widget',
      version: '1.0.0',
      author: 'PinWall',
      entry: 'index.html',
      icon: 'icon.svg',
      type: 'official',
      category: 'utility',
      permissions: ['storage', 'theme', 'i18n'],
      defaultSize: { width: 200, height: 200 },
    },
    enabled: true,
    x: 50,
    y: 60,
    size: { width: 200, height: 200 },
    zIndex: 51,
    settings: {},
    installedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('WidgetFrame', () => {
  beforeEach(() => {
    useWidgetStore.setState({ widgets: [], _zIndexCounter: 50 });
  });

  it('renders as a docked right-panel widget without absolute positioning', () => {
    render(<WidgetFrame instance={createInstance()} variant="side-panel" />);

    const frame = screen.getByTitle('Clock').closest('.widget-frame') as HTMLElement;
    expect(frame).toHaveClass('widget-frame-side');
    expect(frame.style.position).toBe('relative');
    expect(frame.style.left).toBe('');
    expect(frame.style.width).toBe('100%');
  });

  it('loads installed widgets into iframe srcDoc', async () => {
    render(<WidgetFrame instance={createInstance({
      manifest: {
        ...createInstance().manifest,
        installedPath: '/Users/test/PinWall/widgets/com.pinwall.clock',
      },
    })} variant="side-panel" />);

    await waitFor(() =>
      expect(screen.getByTitle('Clock').getAttribute('srcdoc')).toContain('Clock')
    );
  });
});
