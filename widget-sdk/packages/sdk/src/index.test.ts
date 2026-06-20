import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock window.parent.postMessage before importing SDK
const mockPostMessage = vi.fn();
Object.defineProperty(window, 'parent', {
  value: { postMessage: mockPostMessage },
  writable: true,
});

// We need to import after setting up mocks
let PinWall: any;
let _eventHandlers: Map<string, Set<any>>;

beforeEach(async () => {
  mockPostMessage.mockClear();
  // Dynamic import to get fresh module state
  const mod = await import('./index');
  PinWall = mod.PinWall;
});

describe('@pinwall/widget-sdk', () => {
  describe('i18n module', () => {
    it('returns key when no messages registered', () => {
      const result = PinWall.i18n.t('hello');
      expect(result).toBe('hello');
    });

    it('translates after setMessages', () => {
      PinWall.i18n.setMessages('zh', { greeting: '你好' });
      const result = PinWall.i18n.t('greeting');
      expect(result).toBe('你好');
    });

    it('supports parameter interpolation', () => {
      PinWall.i18n.setMessages('zh', { hello: '你好，{name}！' });
      const result = PinWall.i18n.t('hello', { name: '世界' });
      expect(result).toBe('你好，世界！');
    });

    it('supports multiple locales', () => {
      PinWall.i18n.setMessages('zh', { hi: '你好' });
      PinWall.i18n.setMessages('en', { hi: 'Hello' });
      // Default locale is zh
      expect(PinWall.i18n.t('hi')).toBe('你好');
    });

    it('getLocale returns default locale', () => {
      expect(PinWall.i18n.getLocale()).toBe('zh');
    });

    it('merges messages for same locale', () => {
      PinWall.i18n.setMessages('zh', { a: 'A' });
      PinWall.i18n.setMessages('zh', { b: 'B' });
      expect(PinWall.i18n.t('a')).toBe('A');
      expect(PinWall.i18n.t('b')).toBe('B');
    });
  });

  describe('bridge communication', () => {
    it('sends request via postMessage for storage.get', async () => {
      // Start a request but don't resolve it
      const promise = PinWall.storage.get('testKey');

      // Verify postMessage was called
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request',
          module: 'storage',
          method: 'get',
          args: ['testKey'],
        }),
        '*',
      );

      // Simulate response from host
      const msg = mockPostMessage.mock.calls[0][0];
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'response', id: msg.id, success: true, data: 'testValue' },
        }),
      );

      const result = await promise;
      expect(result).toBe('testValue');
    });

    it('rejects on error response', async () => {
      const promise = PinWall.storage.get('key');
      const msg = mockPostMessage.mock.calls[0][0];

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'response', id: msg.id, success: false, error: 'Not found' },
        }),
      );

      await expect(promise).rejects.toThrow('Not found');
    });

    it('sends theme.get request', async () => {
      const promise = PinWall.theme.get();
      const msg = mockPostMessage.mock.calls[0][0];

      expect(msg.module).toBe('theme');
      expect(msg.method).toBe('get');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'response',
            id: msg.id,
            success: true,
            data: { mode: 'light', colors: { primary: '#6366f1' } },
          },
        }),
      );

      const result = await promise;
      expect(result.mode).toBe('light');
    });

    it('sends notify request', async () => {
      const promise = PinWall.notify({ title: 'Test', body: 'Hello' });
      const msg = mockPostMessage.mock.calls[0][0];

      expect(msg.module).toBe('notify');
      expect(msg.method).toBe('send');
      expect(msg.args[0]).toEqual({ title: 'Test', body: 'Hello' });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'response', id: msg.id, success: true },
        }),
      );

      await promise;
    });
  });

  describe('event handling', () => {
    it('events.on registers and receives events', () => {
      const handler = vi.fn();
      PinWall.events.on('test:event', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'event', event: 'test:event', payload: { foo: 'bar' } },
        }),
      );

      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('events.on returns unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = PinWall.events.on('test:event', handler);
      unsub();

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'event', event: 'test:event', payload: {} },
        }),
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('onReady registers handler for pinwall:ready', () => {
      const handler = vi.fn();
      PinWall.onReady(handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'event',
            event: 'pinwall:ready',
            payload: { widgetId: 'w1', settings: {}, locale: 'zh' },
          },
        }),
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ widgetId: 'w1' }),
      );
    });

    it('onDestroy registers handler for pinwall:destroy', () => {
      const handler = vi.fn();
      PinWall.onDestroy(handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'event', event: 'pinwall:destroy' },
        }),
      );

      expect(handler).toHaveBeenCalled();
    });

    it('settings.onChange receives settings changes', () => {
      const handler = vi.fn();
      PinWall.settings.onChange(handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'event',
            event: 'settings:changed',
            payload: { key: 'color', newVal: 'red', oldVal: 'blue' },
          },
        }),
      );

      expect(handler).toHaveBeenCalledWith('color', 'red', 'blue');
    });
  });

  describe('API modules exist', () => {
    it('has storage API', () => {
      expect(PinWall.storage).toBeDefined();
      expect(typeof PinWall.storage.get).toBe('function');
      expect(typeof PinWall.storage.set).toBe('function');
      expect(typeof PinWall.storage.remove).toBe('function');
      expect(typeof PinWall.storage.clear).toBe('function');
    });

    it('has settings API', () => {
      expect(PinWall.settings).toBeDefined();
      expect(typeof PinWall.settings.getAll).toBe('function');
      expect(typeof PinWall.settings.get).toBe('function');
      expect(typeof PinWall.settings.onChange).toBe('function');
    });

    it('has theme API', () => {
      expect(PinWall.theme).toBeDefined();
      expect(typeof PinWall.theme.get).toBe('function');
      expect(typeof PinWall.theme.onChange).toBe('function');
    });

    it('has cards API', () => {
      expect(PinWall.cards).toBeDefined();
      expect(typeof PinWall.cards.list).toBe('function');
      expect(typeof PinWall.cards.create).toBe('function');
      expect(typeof PinWall.cards.update).toBe('function');
      expect(typeof PinWall.cards.delete).toBe('function');
    });

    it('has system API', () => {
      expect(PinWall.system).toBeDefined();
      expect(typeof PinWall.system.getBattery).toBe('function');
      expect(typeof PinWall.system.getMemoryInfo).toBe('function');
    });

    it('has network API', () => {
      expect(PinWall.network).toBeDefined();
      expect(typeof PinWall.network.get).toBe('function');
      expect(typeof PinWall.network.post).toBe('function');
    });

    it('has ai API', () => {
      expect(PinWall.ai).toBeDefined();
      expect(typeof PinWall.ai.chat).toBe('function');
      expect(typeof PinWall.ai.generate).toBe('function');
    });

    it('has app API', () => {
      expect(PinWall.app).toBeDefined();
      expect(typeof PinWall.app.getVersion).toBe('function');
      expect(typeof PinWall.app.getLocale).toBe('function');
    });
  });
});
