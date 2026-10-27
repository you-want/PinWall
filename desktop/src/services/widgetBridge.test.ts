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
    if (cmd === 'widget_notification_request') return Promise.resolve({submitted:true});
    if (cmd === 'read_widget_storage') return Promise.resolve({ testKey: 'testValue' });
    if (cmd === 'widget_network_request') return Promise.resolve({status:200,data:{ok:true}});
    if (cmd === 'mutate_widget_storage') return Promise.resolve();
    if (cmd === 'get_app_version') return Promise.resolve('0.1.3');
    if (cmd === 'get_system_info') {
      if (args?.category === 'getMetrics') return Promise.resolve({ sampledAt: 1234, cpu: { status: 'ok', value: 25 }, memory: { status: 'ok', value: { total: 8192, inUse: 4096 } }, battery: { status: 'notPresent' } });
      if (args?.category === 'getBattery') return Promise.resolve({ level: 0.85, charging: false });
      if (args?.category === 'getMemoryInfo') return Promise.resolve({ total: 17179869184, used: 8589934592, free: 8589934592 });
      if (args?.category === 'getMediaInfo') return Promise.resolve({ trackName: 'PinWall Focus', isPlaying: false });
      if (args?.category === 'mediaControl') return Promise.resolve({ ok: true });
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

  describe('native power boundary', () => {
    it('requires permission and a host-owned session', async () => {
      const power = { request: vi.fn().mockResolvedValue({ supported: true, active: false, endsAt: null }), dispose: vi.fn(async () => undefined) };
      const denied = await handleBridgeRequest(makeRequest('power', 'status'), createTestManifest([]), { power });
      const noSession = await handleBridgeRequest(makeRequest('power', 'status'), createTestManifest(['power']));
      expect(denied.success).toBe(false); expect(noSession.success).toBe(false);
      expect(power.request).not.toHaveBeenCalled();
      const accepted = await handleBridgeRequest(makeRequest('power', 'start', [25]), createTestManifest(['power']), { power });
      expect(accepted.success).toBe(true);
      expect(power.request).toHaveBeenCalledWith({ method: 'start', minutes: 25 });
    });

    it('rejects invalid arguments before invoking the power service', async () => {
      const power = { request: vi.fn(), dispose: vi.fn(async () => undefined) };
      for (const args of [[], [0], [481], [1.5], ['25'], [25, 'extra']]) {
        const response = await handleBridgeRequest(makeRequest('power', 'start', args), createTestManifest(['power']), { power });
        expect(response.success).toBe(false);
      }
      expect(power.request).not.toHaveBeenCalled();
    });

    it('does not allow malformed storage or card arguments to reach IO', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockClear();
      for (const request of [makeRequest('storage', 'set', ['__proto__', {}]), makeRequest('cards', 'create', [{ content: {} }])]) {
        expect((await handleBridgeRequest(request, createTestManifest())).success).toBe(false);
      }
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('clipboard import boundary', () => {
    it('binds each new tool to its permission and fixed ID, without giving direct file or history access', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockClear();
      const tools = vi.fn().mockResolvedValue({ closed: true });
      for (const [module, id, permission] of [['video', 'video-tools', 'video'], ['input', 'input-tools', 'input'], ['audio', 'music', 'audio'], ['windows', 'window-tools', 'windows'], ['utilities', 'local-tools', 'utilities'], ['shelf', 'file-shelf', 'shelf'], ['screen', 'screen-tools', 'screenCapture'], ['ocr', 'ocr-note', 'ocr'], ['images', 'image-tools', 'images'], ['clipboardHistory', 'clipboard-history', 'clipboardHistory']] as const) {
        const manifest = { ...createTestManifest([permission]), id: `com.pinwall.${id}` };
        for (const request of [makeRequest(module, 'read'), makeRequest(module, 'open', ['path'])]) {
          expect((await handleBridgeRequest(request, manifest, { tools })).success).toBe(false);
        }
        expect((await handleBridgeRequest(makeRequest(module, 'open'), { ...manifest, id: 'com.fake.tool' }, { tools })).success).toBe(false);
        expect((await handleBridgeRequest(makeRequest(module, 'open'), { ...manifest, permissions: [] }, { tools })).success).toBe(false);
        expect((await handleBridgeRequest(makeRequest(module, 'open'), manifest, { tools })).data).toEqual({ closed: true });
        expect(tools).toHaveBeenLastCalledWith(module);
      }
      expect(tools).toHaveBeenCalledTimes(10);
      expect(invoke).not.toHaveBeenCalled();
    });

    it('only opens host UI for the declared official tool and returns no clipboard text', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockClear();
      const clipboard = vi.fn().mockResolvedValue({ created: true, cardId: 'card-new' });
      const manifest = { ...createTestManifest(['clipboard']), id: 'com.pinwall.clipboard-note' };
      for (const [request, source, context] of [
        [makeRequest('clipboard', 'openImport'), createTestManifest(['clipboard']), { clipboard }],
        [makeRequest('clipboard', 'openImport'), { ...manifest, permissions: [] }, { clipboard }],
        [makeRequest('clipboard', 'openImport'), manifest, undefined],
        [makeRequest('clipboard', 'readText'), manifest, { clipboard }],
        [makeRequest('clipboard', 'openImport', ['extra']), manifest, { clipboard }],
      ] as const) {
        expect((await handleBridgeRequest(request, source, context)).success).toBe(false);
      }
      expect(clipboard).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      const result = await handleBridgeRequest(makeRequest('clipboard', 'openImport'), manifest, { clipboard });
      expect(result).toMatchObject({ success: true, data: { created: true, cardId: 'card-new' } });
      expect(clipboard).toHaveBeenCalledOnce();
      expect(invoke).not.toHaveBeenCalled();
    });
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
      expect(invoke).toHaveBeenCalledWith('mutate_widget_storage', {
        id: 'com.test.widget', mutation: { method: 'set', key: 'newKey', value: 'newValue' },
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
      expect(invoke).toHaveBeenCalledWith('mutate_widget_storage', {
        id: 'com.test.widget', mutation: { method: 'clear' },
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
    it('submits a bounded native notification without acknowledging a placeholder', async () => {
      const manifest = createTestManifest();
      const req = makeRequest('notify', 'send', [{ title: 'Test', body: 'Hello' }]);
      const res = await handleBridgeRequest(req, manifest);
      expect(res).toMatchObject({success:true,data:{submitted:true}});
      const { invoke }=await import('@tauri-apps/api/core');expect(invoke).toHaveBeenCalledWith('widget_notification_request',{widgetId:manifest.id,title:'Test',body:'Hello'});
    });
    it('reports denied delivery and rejects oversized notifications before native IO',async()=>{
      const {invoke}=await import('@tauri-apps/api/core');vi.mocked(invoke).mockClear();
      expect((await handleBridgeRequest(makeRequest('notify','send',[{title:'Test',body:'x'.repeat(8193)}]),createTestManifest(['notify']))).success).toBe(false);expect(invoke).not.toHaveBeenCalled();
      vi.mocked(invoke).mockRejectedValueOnce('widget_notification_denied');expect(await handleBridgeRequest(makeRequest('notify','send',[{title:'Test',body:'Hello'}]),createTestManifest(['notify']))).toMatchObject({success:false,error:'widget_notification_denied'});
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
      vi.mocked(useCardStore.getState().createCard).mockReturnValueOnce('created-card');
      const req = makeRequest('cards', 'create', [{ title: 'New', content: 'Content' }]);
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(useCardStore.getState().createCard).toHaveBeenCalled();
      expect(res.data).toEqual({ cardId: 'created-card' });
    });
  });

  describe('system module (with permission)', () => {
    it('returns the shared snapshot and denies undeclared or malformed requests before IO', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockClear();
      expect((await handleBridgeRequest(makeRequest('system', 'getMetrics'), createTestManifest([]))).success).toBe(false);
      expect((await handleBridgeRequest(makeRequest('system', 'getMetrics', ['extra']), createTestManifest(['system']))).success).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
      const response = await handleBridgeRequest(makeRequest('system', 'getMetrics'), createTestManifest(['system']));
      expect(response.success).toBe(true);
      expect(response.data.cpu).toEqual({ status: 'ok', value: 25 });
      expect(response.data.battery).toEqual({ status: 'notPresent' });
      expect(invoke).toHaveBeenCalledExactlyOnceWith('get_system_info', { category: 'getMetrics' });
    });

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

    it('rejects legacy media stubs and directs users to the host-owned audio tool', async () => {
      const { invoke } = await import('@tauri-apps/api/core');vi.mocked(invoke).mockClear();
      for (const request of [makeRequest('system','getMediaInfo'),makeRequest('system','mediaControl',['play'])]) {
        expect(await handleBridgeRequest(request,createTestManifest(['system']))).toMatchObject({success:false,error:'media_use_audio_tool'});
      }
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('network proxy boundary', () => {
    it('sends declared requests through the native proxy, never renderer fetch', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      vi.mocked(invoke).mockClear(); const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const response = await handleBridgeRequest(makeRequest('network', 'get', ['https://api.example.com/data']), createTestManifest(['network']));
      expect(response).toMatchObject({ success:true, data:{status:200,data:{ok:true}} });
      expect(invoke).toHaveBeenCalledWith('widget_network_request', { request: expect.objectContaining({widgetId:'com.test.widget',method:'get',url:'https://api.example.com/data'}) });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('denies malformed or undeclared requests before native IO', async () => {
      const { invoke } = await import('@tauri-apps/api/core'); vi.mocked(invoke).mockClear();
      expect((await handleBridgeRequest(makeRequest('network', 'get', ['https://example.com']), createTestManifest([]))).success).toBe(false);
      expect((await handleBridgeRequest(makeRequest('network', 'get', [123]), createTestManifest(['network']))).success).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('app module (with permission)', () => {
    it('returns app version', async () => {
      const manifest = createTestManifest(['app']);
      const req = makeRequest('app', 'getVersion');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toBe('0.1.3');
    });

    it('returns app locale', async () => {
      const manifest = createTestManifest(['app']);
      const req = makeRequest('app', 'getLocale');
      const res = await handleBridgeRequest(req, manifest);

      expect(res.success).toBe(true);
      expect(res.data).toBe('zh');
    });
  });

  it('reads only the current widget settings, including false values and missing keys',async()=>{
    const context={settings:()=>({seconds:false,color:'purple'})};const manifest=createTestManifest([]);
    expect((await handleBridgeRequest(makeRequest('settings','get',['seconds']),manifest,context)).data).toBe(false);
    expect((await handleBridgeRequest(makeRequest('settings','get',['missing']),manifest,context)).data).toBeNull();
    expect((await handleBridgeRequest(makeRequest('settings','getAll'),manifest,context)).data).toEqual({seconds:false,color:'purple'});
  });
  it('prevents plugins from spoofing host ready events or another widget namespace',async()=>{
    const handler=vi.fn(),unsub=subscribeWidgetEvent('*',handler);
    for(const event of ['pinwall:ready','card:created','widget:com.other.widget:update'])expect((await handleBridgeRequest(makeRequest('events','emit',[event,{}]),createTestManifest(['events']))).success).toBe(false);
    expect(handler).not.toHaveBeenCalled();unsub();
  });
  describe('events module', () => {
    it('emits events', async () => {
      const manifest = createTestManifest(['events']);
      const req = makeRequest('events', 'emit', ['widget:com.test.widget:test-event', { foo: 'bar' }]);
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
