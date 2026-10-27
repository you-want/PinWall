import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WidgetFrame } from '@/components/WidgetFrame';
import { useWidgetStore } from '@/stores/widgetStore';
import type { WidgetInstance } from '@/types';
import { handleBridgeRequest } from '@/services/widgetBridge';
import { loadWidgetEntryHtml } from '@/services/widgetLoader';

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

const entryHtml = '<!doctype html><html><body>Clock</body></html>';

async function renderLoadedWidget(props: ComponentProps<typeof WidgetFrame>) {
  // The srcDoc mutation alone does not guarantee passive bridge effects have run.
  // Flush the loader promise, React commit and effects before accessing the new iframe.
  const view = await act(async () => render(<WidgetFrame {...props} />));
  const iframe = screen.getByTitle('Clock') as HTMLIFrameElement;
  expect(iframe.getAttribute('srcdoc')).toContain('Clock');
  return { ...view, iframe };
}

describe('WidgetFrame', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadWidgetEntryHtml).mockReset().mockResolvedValue(entryHtml);
    vi.mocked(handleBridgeRequest).mockReset().mockResolvedValue({ type: 'response', id: 'r1', success: true });
    useWidgetStore.setState({ widgets: [], _zIndexCounter: 50 });
  });

  it('renders as a docked right-panel widget without absolute positioning', async () => {
    await renderLoadedWidget({ instance: createInstance(), variant: 'side-panel' });

    const frame = screen.getByTitle('Clock').closest('.widget-frame') as HTMLElement;
    expect(frame).toHaveClass('widget-frame-side');
    expect(frame.style.position).toBe('relative');
    expect(frame.style.left).toBe('');
    expect(frame.style.width).toBe('100%');
  });

  it('loads installed widgets into iframe srcDoc', async () => {
    await renderLoadedWidget({ instance: createInstance({
      manifest: {
        ...createInstance().manifest,
        installedPath: '/Users/test/PinWall/widgets/com.pinwall.clock',
      },
    }), variant: 'side-panel' });
  });

  it('attaches the bridge to the replacement iframe after a delayed load', async () => {
    let resolveEntry!: (html: string) => void;
    vi.mocked(loadWidgetEntryHtml).mockReturnValueOnce(new Promise(resolve => { resolveEntry = resolve; }));
    const { unmount } = render(<WidgetFrame instance={createInstance()} />);
    const placeholder = screen.getByTitle('Clock') as HTMLIFrameElement;
    const previousWindow = placeholder.contentWindow;
    const data = { type: 'request', id: 'r1', module: 'theme', method: 'get' };
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: previousWindow, origin: 'null', data }));
    });
    expect(handleBridgeRequest).not.toHaveBeenCalled();

    await act(async () => { resolveEntry(entryHtml); });
    const iframe = screen.getByTitle('Clock') as HTMLIFrameElement;
    expect(iframe).not.toBe(placeholder);
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: previousWindow, origin: 'null', data }));
    });
    expect(handleBridgeRequest).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'null', data }));
    });
    expect(handleBridgeRequest).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('only routes valid requests from this opaque frame', async () => {
    const { iframe } = await renderLoadedWidget({ instance: createInstance() });
    const data = { type: 'request', id: 'r1', module: 'theme', method: 'get' };
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data }));
      window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'https://other.example', data }));
      window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'null', data: { ...data, args: 'invalid' } }));
    });
    expect(handleBridgeRequest).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'null', data }));
    });
    expect(handleBridgeRequest).toHaveBeenCalledTimes(1);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('ignores duplicate requests and does not deliver late replies after disposal', async () => {
    let finish!: (value: { type: 'response'; id: string; success: boolean }) => void;
    vi.mocked(handleBridgeRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { unmount, iframe } = await renderLoadedWidget({ instance: createInstance() });
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const event = () => new MessageEvent('message', { source: iframe.contentWindow, origin: 'null', data: { type: 'request', id: 'r1', module: 'theme', method: 'get' } });
    await act(async () => { window.dispatchEvent(event()); window.dispatchEvent(event()); });
    expect(handleBridgeRequest).toHaveBeenCalledTimes(1);
    unmount(); const count = post.mock.calls.length;
    await act(async () => { finish({ type: 'response', id: 'r1', success: true }); });
    expect(post).toHaveBeenCalledTimes(count);
  });

  it('preserves an active tool session across equivalent cross-window manifests, but revokes changed permissions', async () => {
    const instance = createInstance();
    const { rerender, iframe } = await renderLoadedWidget({ instance });
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'null', data: { type: 'request', id: 'session-1', module: 'theme', method: 'get' } })); });
    const signal = vi.mocked(handleBridgeRequest).mock.calls[0][2]!.signal!;
    await act(async () => rerender(<WidgetFrame instance={structuredClone(instance)} />));
    expect(signal.aborted).toBe(false);
    const changed = structuredClone(instance); changed.manifest.permissions = ['i18n'];
    await act(async () => rerender(<WidgetFrame instance={changed} />));
    expect(signal.aborted).toBe(true);
  });

  it('sends to opaque asset origins and cancels the load retry on unmount', async () => {
    vi.useFakeTimers();
    const instance = createInstance();
    instance.manifest.type = 'community';
    const { unmount, iframe } = await renderLoadedWidget({ instance });
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ event: 'pinwall:ready' }), '*');
    const beforeLoad = post.mock.calls.length;
    fireEvent.load(iframe);
    expect(post).toHaveBeenCalledTimes(beforeLoad);
    await act(async () => { await vi.advanceTimersByTimeAsync(119); });
    expect(post).toHaveBeenCalledTimes(beforeLoad);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(post).toHaveBeenCalledTimes(beforeLoad + 1);
    fireEvent.load(iframe);
    const count = post.mock.calls.length;
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    expect(post).toHaveBeenCalledTimes(count);
  });
});
