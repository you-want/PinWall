import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WidgetManifest, WidgetBridgeRequest } from '@/types';

// Mock dependencies before importing the module under test
vi.mock('@/stores/cardStore', () => {
  const createCard = vi.fn();
  const updateContent = vi.fn();
  const closeCard = vi.fn();
  return {
    useCardStore: {
      getState: () => ({
        cards: [{ id: 'card-1', title: 'Test Card', content: 'Hello' }],
        createCard,
        updateContent,
        closeCard,
      }),
      _mocks: { createCard, updateContent, closeCard },
    },
  };
});

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: {
    getState: () => ({ lang: 'zh' }),
  },
}));

vi.mock('@/services/storage', () => ({
  getSettings: vi.fn().mockResolvedValue({
    ai: { enabled: true, apiKey: 'test-key', provider: 'openai', model: 'gpt-4o-mini', apiEndpoint: 'https://api.openai.com/v1' },
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd: string, args?: any) => {
    if (cmd === 'read_widget_storage') return Promise.resolve({ testKey: 'testValue' });
    if (cmd === 'write_widget_storage') return Promise.resolve();
    if (cmd === 'get_system_info') {
      if (args?.category === 'getBattery') return Promise.resolve({ level: 0.85, charging: false });
      if (args?.category === 'getMemoryInfo') return Promise.resolve({ total: 17179869184, used: 8589934592, free: 8589934592 });
      return Promise.resolve({});
    }
    return Promise.resolve(null);
  }),
}));

function createTestManifest(
  permissions: string[] = ['storage', 'theme', 'i18n', 'notify', 'system', 'network', 'cards', 'app', 'events', 'ai'],
): WidgetManifest {
  return {
    id: 'com.test.widget',
    name: 'Test',
    description: 'Test widget',
    version: '1.0.0',
    author: 'Test',
    entry: 'index.html',
    icon: 'icon.png',
    type: 'official',
    category: 'utility',
    permissions: permissions as any,
    defaultSize: { width: 200, height: 200 },
  };
}

function makeRequest(module: string, method: string, args: any[] = []): WidgetBridgeRequest {
  return { type: 'request', id: `req-${Date.now()}`, module, method, args };
}

describe('widgetBridge', () => {
  let handleBridgeRequest: typeof import('@/services/widgetBridge').handleBridgeRequest;
  let emitWidgetEvent: typeof import('@/services/widgetBridge').emitWidgetEvent;
  let subscribeWidgetEvent: typeof import('@/services/widgetBridge').subscribeWidgetEvent;

  beforeEach(async () => {
    const mod = await import('@/services/widgetBridge');
    handleBridgeRequest = mod.handleBridgeRequest;
    emitWidgetEvent = mod.emitWidgetEvent;
    subscribeWidgetEvent = mod.subscribeWidgetEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storage module', () => {
    it('handles storage.get', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('storage', 'get', ['testKey']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.type).toBe('response');
      expect(res.success).toBe(true);
      expect(res.data).toBe('testValue');
    });

    it('handles storage.set', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const manifest = createTestManifest();
      const req = makeRequest('storage', 'set', ['newKey', 'newValue']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(invoke).toHaveBeenCalledWith('read_widget_storage', { id: 'com.test.widget' });
      expect(invoke).toHaveBeenCalledWith('write_widget_storage', {
        id: 'com.test.widget',
        data: expect.objectContaining({ newKey: 'newValue' }),
      });
    });

    it('handles storage.remove', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('storage', 'remove', ['testKey']);
      const res = await handleBridgeRequest(req, manifest);
      expect(res.success).toBe(true);
    });

    it('handles storage.clear', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const manifest = createTestManifest();
      const req = makeRequest('storage', 'clear');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(invoke).toHaveBeenCalledWith('write_widget_storage', {
        id: 'com.test.widget',
        data: {},
      });
    });
  });

  describe('theme module', () => {
    it('returns theme config', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('theme', 'get');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('mode', 'light');
      expect(res.data.colors).toHaveProperty('primary', '#6366f1');
      expect(res.data.fonts).toHaveProperty('body');
    });
  });

  describe('i18n module', () => {
    it('returns current locale', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('i18n', 'getLocale');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toBe('zh');
    });
  });

  describe('notify module', () => {
    it('handles notify without error', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('notify', 'send', [{ title: 'Test', body: 'Hello' }]);
      const res = await handleBridgeRequest(req, manifest);
      expect(res.success).toBe(true);
    });
  });

  describe('permission checks', () => {
    it('denies cards access without permission', async () => {
      const manifest = createTestManifest(['storage']); // no cards permission
      const req = makeRequest('cards', 'list');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: cards');
    });

    it('denies ai access without permission', async () => {
      const manifest = createTestManifest(['storage']);
      const req = makeRequest('ai', 'generate', ['hello']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: ai');
    });

    it('denies system access without permission', async () => {
      const manifest = createTestManifest(['theme']);
      const req = makeRequest('system', 'getBattery');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: system');
    });

    it('denies network access without permission', async () => {
      const manifest = createTestManifest(['storage']);
      const req = makeRequest('network', 'get', ['https://example.com']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: network');
    });

    it('denies app access without permission', async () => {
      const manifest = createTestManifest(['storage']);
      const req = makeRequest('app', 'getVersion');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: app');
    });

    it('denies events access without permission', async () => {
      const manifest = createTestManifest(['storage']);
      const req = makeRequest('events', 'emit', ['test']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Permission denied: events');
    });
  });

  describe('cards module (with permission)', () => {
    it('lists cards', async () => {
      const manifest = createTestManifest(['cards']);
      const req = makeRequest('cards', 'list');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].title).toBe('Test Card');
    });

    it('creates a card', async () => {
      const { useCardStore } = await import('@/stores/cardStore');
      const manifest = createTestManifest(['cards']);
      const req = makeRequest('cards', 'create', [{ title: 'New', content: 'Content' }]);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect((useCardStore as any)._mocks.createCard).toHaveBeenCalled();
    });
  });

  describe('system module (with permission)', () => {
    it('returns battery info', async () => {
      const manifest = createTestManifest(['system']);
      const req = makeRequest('system', 'getBattery');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ level: 0.85, charging: false });
    });

    it('returns memory info', async () => {
      const manifest = createTestManifest(['system']);
      const req = makeRequest('system', 'getMemoryInfo');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data.total).toBe(17179869184);
    });
  });

  describe('network module (with permission)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true }),
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('performs allowed get requests without credentials', async () => {
      const manifest = createTestManifest(['network']);
      const req = makeRequest('network', 'get', ['https://api.example.com/data']);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'GET',
        headers: {},
        credentials: 'omit',
      });
    });

    it('filters sensitive request headers', async () => {
      const manifest = createTestManifest(['network']);
      const req = makeRequest('network', 'post', [
        'https://api.example.com/data',
        {
          headers: {
            Authorization: 'Bearer secret',
            Cookie: 'sid=secret',
            'X-Widget': 'clock',
          },
          body: { hello: 'world' },
        },
      ]);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'POST',
        headers: {
          'X-Widget': 'clock',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hello: 'world' }),
        credentials: 'omit',
      });
    });

    it('rejects localhost and private network URLs', async () => {
      const manifest = createTestManifest(['network']);

      for (const url of [
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://192.168.1.2',
        'http://10.0.0.2',
        'http://172.16.0.2',
        'http://device.local/status',
      ]) {
        const res = await handleBridgeRequest(makeRequest('network', 'get', [url]), manifest);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Network URL host is not allowed');
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects non-http protocols', async () => {
      const manifest = createTestManifest(['network']);
      const res = await handleBridgeRequest(
        makeRequest('network', 'get', ['file:///Users/test/.ssh/id_rsa']),
        manifest,
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Network URL protocol must be http or https');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects unsupported network methods', async () => {
      const manifest = createTestManifest(['network']);
      const res = await handleBridgeRequest(
        makeRequest('network', 'delete', ['https://api.example.com/data']),
        manifest,
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown network method: delete');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('app module (with permission)', () => {
    it('returns app version', async () => {
      const manifest = createTestManifest(['app']);
      const req = makeRequest('app', 'getVersion');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toBe('0.1.1');
    });

    it('returns app locale', async () => {
      const manifest = createTestManifest(['app']);
      const req = makeRequest('app', 'getLocale');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toBe('zh');
    });
  });

  describe('events module', () => {
    it('emits events', async () => {
      const manifest = createTestManifest(['events']);
      const req = makeRequest('events', 'emit', ['test:event', { foo: 'bar' }]);
      const res = await handleBridgeRequest(req, manifest);
      expect(res.success).toBe(true);
    });

    it('subscribe and receive events', () => {
      const handler = vi.fn();
      const unsub = subscribeWidgetEvent('*', handler);

      emitWidgetEvent('card:created', { id: 'card-1' });

      expect(handler).toHaveBeenCalledWith('card:created', { id: 'card-1' });
      unsub();
    });

    it('unsubscribe stops receiving events', () => {
      const handler = vi.fn();
      const unsub = subscribeWidgetEvent('*', handler);
      unsub();

      emitWidgetEvent('card:created', { id: 'card-1' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('specific event subscription', () => {
      const handler = vi.fn();
      const unsub = subscribeWidgetEvent('card:created', handler);

      emitWidgetEvent('card:deleted', { id: 'card-2' });
      expect(handler).not.toHaveBeenCalled();

      emitWidgetEvent('card:created', { id: 'card-3' });
      expect(handler).toHaveBeenCalledWith('card:created', { id: 'card-3' });

      unsub();
    });
  });

  describe('unknown module', () => {
    it('returns error for unknown module', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('unknown', 'foo');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown module: unknown');
    });
  });
});
