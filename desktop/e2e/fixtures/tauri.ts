import { test as base, expect, type Page } from '@playwright/test';

/**
 * Browser-only native boundary. Real React, stores and tauri-store run unchanged.
 * State survives reload inside one isolated Playwright context, never real AppData.
 * Unknown commands fail loudly so unsupported native behavior cannot pass silently.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const trackErrors = (surface: Page) => {
      surface.on('pageerror', error => errors.push(error.message));
      surface.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    };
    trackErrors(page);
    page.context().on('page', trackErrors);

    await page.context().addInitScript(() => {
      // New pages and embedded widgets also receive context scripts. Only adapt the app origin.
      if (window !== window.top || location.origin !== 'http://localhost:1932') return;
      type Args = Record<string, unknown>;
      type Callback = (value: unknown) => void;
      const callbacks = new Map<number, Callback>();
      const listeners = new Map<string, Map<number, number>>();
      let nextId = 1;
      const prefix = 'pinwall-e2e:';
      let powerToken: string | null = null;
      let powerStatus = { supported: true, active: false, endsAt: null as number | null };
      const powerLog = (method: string) => {
        const key = `${prefix}power:log`;
        localStorage.setItem(key, JSON.stringify([...JSON.parse(localStorage.getItem(key) ?? '[]'), method]));
      };
      const historyKey = `${prefix}history:state`;
      const emptyHistory = () => ({ recording: false, stopping: false, entries: [] as { id: string; text: string; createdAt: number }[], skipped: 0, failed: false });
      const historyState = () => JSON.parse(localStorage.getItem(historyKey) ?? JSON.stringify(emptyHistory())) as ReturnType<typeof emptyHistory>;
      const saveHistory = (state: ReturnType<typeof emptyHistory>) => {
        localStorage.setItem(historyKey, JSON.stringify(state));
        localStorage.setItem(`${prefix}history:revision`, String(Number(localStorage.getItem(`${prefix}history:revision`) ?? 0) + 1));
      };
      if (!['settings', 'notification'].includes(new URL(location.href).searchParams.get('window') ?? '')) saveHistory(emptyHistory());
      let shelfActive = false, shelfEpoch = 0, screenEpoch = 0;
      type ShelfFixture = { id: string; name: string; bytes: number; addedAt: number; expiresAt: number; available: boolean };
      const shelfEntries = () => JSON.parse(localStorage.getItem(`${prefix}shelf:entries`) ?? '[]') as ShelfFixture[];
      const saveShelf = (entries: ShelfFixture[]) => localStorage.setItem(`${prefix}shelf:entries`, JSON.stringify(entries));
      const shelfItem = (id: string, name: string): ShelfFixture => ({ id, name, bytes: 1024, addedAt: Date.now(), expiresAt: Date.now() + 7 * 86400000, available: true });
      const capturePreview = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAFElEQVR4nGNMmXaCAQaY4CwGBgYAKhoBxrgvo6EAAAAASUVORK5CYII=';
      if (!['settings', 'notification'].includes(new URL(location.href).searchParams.get('window') ?? '')) localStorage.removeItem(`${prefix}screen:token`);
      window.addEventListener('pinwall-e2e:shelf-drop', () => {
        if (!shelfActive) return;
        const entries = shelfEntries(); const duplicate = entries.some(e => e.id === '4-5-6'); if (!duplicate) entries.push(shelfItem('4-5-6', 'Dropped fixture.txt'));
        saveShelf(entries); emit('pinwall:shelf-changed', { added: duplicate ? 0 : 1, skipped: duplicate ? 1 : 0 });
      });
      const settingsKey = `${prefix}file:pinwall-settings.json`;
      if (localStorage.getItem(settingsKey) === null) {
        localStorage.setItem(settingsKey, JSON.stringify({
          backgroundImages: [], currentImageId: null, opacity: 0.8,
          autoChangeEnabled: false, autoChangeInterval: 60, launchOnStartup: false,
          holidayEnabledCn: false, holidayEnabledIntl: false,
          moodCheckinEnabled: false, restReminderEnabled: false,
          offWorkReminderEnabled: false, eyeCareEnabled: false,
          weatherCareEnabled: false, autoCheckUpdates: false,
        }));
      }

      const emit = (event: string, payload: unknown) => {
        for (const [id, callbackId] of listeners.get(event) ?? []) {
          callbacks.get(callbackId)?.({ event, id, payload });
        }
      };
      const readSettings = (preferencesOnly = false) => {
        const data = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') as Args;
        if (Number(data.schemaVersion ?? 0) > 2) throw 'storage_future_version';
        if (data.opacity !== undefined && typeof data.opacity !== 'number') throw 'storage_corrupt';
        if (preferencesOnly) {
          if (data.ai) (data.ai as Args).apiKey = '';
          for (const model of (data.quotaMonitor as { models?: Args[] })?.models ?? []) model.apiKey = '';
          delete data.credentialsRef;
          return { ...data, revision: data.revision ?? 0 };
        }
        if (localStorage.getItem(`${prefix}credentials-fail`) === 'true' && (data.credentialsRef || (data.ai as Args)?.apiKey)) throw 'credentials_unavailable';
        if (data.credentialsRef) {
          const keys = JSON.parse(localStorage.getItem(`${prefix}vault:${data.credentialsRef}`) ?? '{}') as Record<string, string>;
          if (data.ai) (data.ai as Args).apiKey = keys.ai ?? '';
          for (const model of (data.quotaMonitor as { models?: Args[] })?.models ?? []) model.apiKey = keys[`quota:${model.id}`] ?? '';
        }
        delete data.credentialsRef;
        return { ...data, revision: data.revision ?? 0 };
      };
      const secureWrite = (data: Args) => {
        if (localStorage.getItem(`${prefix}credentials-fail`) === 'true') throw 'credentials_unavailable';
        const disk = structuredClone(data);
        const keys: Record<string, string> = {};
        if (disk.ai) { const ai = disk.ai as Args; if (ai.apiKey) keys.ai = String(ai.apiKey); ai.apiKey = ''; }
        for (const model of (disk.quotaMonitor as { models?: Args[] })?.models ?? []) {
          if (model.apiKey) keys[`quota:${model.id}`] = String(model.apiKey);
          model.apiKey = '';
        }
        if (Object.keys(keys).length) {
          disk.credentialsRef = `credentials-e2e-${disk.revision}`;
          localStorage.setItem(`${prefix}vault:${disk.credentialsRef}`, JSON.stringify(keys));
        }
        localStorage.setItem(settingsKey, JSON.stringify({ ...disk, schemaVersion: 2 }));
        return { ...data, schemaVersion: 2 };
      };
      const readCards = () => {
        const state = JSON.parse(localStorage.getItem(`${prefix}store:cards`) ?? '{"cards":[],"zIndexMap":{}}') as Args;
        return { ...state, schemaVersion: 1, revision: state.revision ?? 0, cards: state.cards ?? [], zIndexMap: state.zIndexMap ?? {} };
      };
      window.addEventListener('storage', event => {
        if (event.key === settingsKey) emit('settings:changed', null);
        if (event.key === `${prefix}store:cards` && event.newValue) emit('cards:committed', { document: readCards(), clientId: 'other-window', mutationId: '' });
      });

      const invoke = async (
        command: string,
        rawArgs: Args | Uint8Array = {},
        options?: { headers?: Record<string, string> },
      ): Promise<unknown> => {
        const args = rawArgs as Args;
        switch (command) {
          case 'cards_read': return readCards();
          case 'cards_patch': {
            if (localStorage.getItem(`${prefix}cards-fail`) === 'true') throw 'storage_write_failed';
            const document = readCards();
            const receipt = `${prefix}receipt:${args.clientId}`;
            if (Number(localStorage.getItem(receipt) ?? 0) >= Number(args.mutationId)) return document;
            const patch = args.patch as { creates: Args[]; updates: { id: string; changes: Args }[]; deletes: string[]; zIndex: Record<string, number | null> };
            const updates = new Map(patch.updates.map(update => [update.id, update.changes]));
            const cards = (document.cards as Args[]).filter(card => !patch.deletes.includes(String(card.id))).map(card => ({ ...card, ...updates.get(String(card.id)) }));
            const ids = new Set(cards.map(card => card.id));
            for (const card of patch.creates) if (!ids.has(card.id)) { cards.push(card); ids.add(card.id); }
            const zIndexMap = { ...document.zIndexMap as Args };
            for (const [id, value] of Object.entries(patch.zIndex)) { if (value === null) delete zIndexMap[id]; else zIndexMap[id] = value; }
            for (const id of patch.deletes) delete zIndexMap[id];
            const saved = { ...document, cards, zIndexMap, revision: Number(document.revision) + 1 };
            localStorage.setItem(`${prefix}store:cards`, JSON.stringify(saved));
            localStorage.setItem(receipt, String(args.mutationId));
            emit('cards:committed', { document: saved, clientId: args.clientId, mutationId: args.mutationId });
            return saved;
          }
          case 'prepare_local_storage': {
            for (const key of [settingsKey, `${prefix}store:cards`]) {
              const content = localStorage.getItem(key);
              if (content === null) continue;
              try {
                const data = JSON.parse(content) as Args;
                if (Number(data.schemaVersion ?? 0) > (key === settingsKey ? 2 : 1)) throw 'storage_future_version';
                if (key === settingsKey && data.opacity !== undefined && typeof data.opacity !== 'number') throw 'storage_corrupt';
              } catch (error) {
                if (error === 'storage_future_version') throw error;
                if (localStorage.getItem(`${key}.corrupt-backup`) === null) localStorage.setItem(`${key}.corrupt-backup`, content);
                throw 'storage_corrupt';
              }
            }
            return null;
          }
          case 'settings_read': {
            if (new URL(location.href).searchParams.get('window') === 'notification') return readSettings(true);
            const data = readSettings();
            const original = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') as Args;
            const hasPlaintext = (original.ai as Args)?.apiKey || ((original.quotaMonitor as { models?: Args[] })?.models ?? []).some(model => model.apiKey);
            if (hasPlaintext) return secureWrite({ ...data, revision: Number(data.revision) + 1 });
            return data;
          }
          case 'settings_compare_and_swap': {
            const current = readSettings();
            if (current.revision !== args.expectedRevision) return null;
            const data = secureWrite({ ...args.data as Args, revision: Number(current.revision) + 1 });
            emit('settings:changed', null);
            return data;
          }
          case 'export_note_backup': {
            if (localStorage.getItem(`${prefix}backup:cancel`) === 'true') return false;
            const state = JSON.parse(localStorage.getItem(`${prefix}store:cards`) ?? '{"cards":[]}') as { cards: Args[] };
            const fields = ['id', 'title', 'content', 'x', 'y', 'collapsed', 'colorIndex', 'createdAt', 'updatedAt', 'cardType', 'reminderEnabled', 'reminderTime', 'reminderFired', 'checkinDone', 'lastCheckinDate', 'systemKind', 'hydrationCount', 'hydrationGoal', 'hydrationDate'];
            const cards = state.cards.map(card => Object.fromEntries(fields.filter(key => key in card).map(key => [key, card[key]])));
            localStorage.setItem(`${prefix}backup:notes`, JSON.stringify({ format: 'pinwall-notes', schemaVersion: 1, cards }));
            return true;
          }
          case 'read_note_backup': {
            if (localStorage.getItem(`${prefix}backup:cancel`) === 'true') return null;
            let data: Args;
            try { data = JSON.parse(localStorage.getItem(`${prefix}backup:notes`) ?? 'null') as Args; }
            catch { throw 'storage_invalid_backup'; }
            if (!data || data.format !== 'pinwall-notes' || data.schemaVersion !== 1 || !Array.isArray(data.cards)) throw 'storage_invalid_backup';
            return data.cards;
          }
          case 'restore_note_backup': {
            const key = `${prefix}store:cards`;
            const previous = localStorage.getItem(key) ?? '{"cards":[]}';
            const state = JSON.parse(previous) as { cards: Args[]; schemaVersion: number };
            const ids = new Set(state.cards.map(card => card.id));
            const incoming = (args.cards as Args[]).filter(card => !ids.has(card.id)).map(card => ({ ...card, reminderEnabled: false, reminderFired: true }));
            if (incoming.length > 0) {
              localStorage.setItem(`${key}.before-restore`, previous);
              const document = { ...state, cards: [...state.cards, ...incoming], schemaVersion: 1, revision: Number((state as unknown as Args).revision ?? 0) + 1 };
              localStorage.setItem(key, JSON.stringify(document));
              emit('cards:committed', { document, clientId: 'restore', mutationId: '' });
            }
            return incoming.length;
          }
          case 'plugin:zustand|allow_save':
          case 'plugin:zustand|allow_sync':
          case 'plugin:zustand|set_store_options':
          case 'plugin:zustand|save_some':
          case 'plugin:zustand|save_some_now':
          case 'plugin:zustand|unload':
            return null;
          case 'plugin:zustand|load':
            return JSON.parse(localStorage.getItem(`${prefix}store:${args.id}`) ?? '{}');
          case 'plugin:zustand|patch': {
            const key = `${prefix}store:${args.id}`;
            const previous = JSON.parse(localStorage.getItem(key) ?? '{}') as Args;
            localStorage.setItem(key, JSON.stringify({ ...previous, ...args.state as Args }));
            return null;
          }
          case 'plugin:fs|read_text_file': {
            const content = localStorage.getItem(`${prefix}file:${args.path}`);
            if (content === null) throw new Error('Test file not found');
            return Array.from(new TextEncoder().encode(content));
          }
          case 'plugin:fs|write_text_file': {
            const path = decodeURIComponent(options?.headers?.path ?? '');
            localStorage.setItem(`${prefix}file:${path}`, new TextDecoder().decode(rawArgs as Uint8Array));
            return null;
          }
          case 'plugin:event|listen': {
            const id = nextId++;
            const event = args.event as string;
            if (!listeners.has(event)) listeners.set(event, new Map());
            listeners.get(event)?.set(id, args.handler as number);
            return id;
          }
          case 'plugin:event|unlisten':
            listeners.get(args.event as string)?.delete(args.eventId as number);
            return null;
          case 'plugin:event|emit':
          case 'plugin:event|emit_to':
            emit(args.event as string, args.payload);
            return null;
          case 'plugin:autostart|is_enabled':
            return localStorage.getItem(`${prefix}autostart`) === 'true';
          case 'plugin:autostart|enable':
          case 'plugin:autostart|disable':
            localStorage.setItem(`${prefix}autostart`, String(command.endsWith('|enable')));
            return null;
          case 'is_main_summoned':
            return true;
          case 'summon_main':
            emit('main-layer-changed', true);
            return null;
          case 'send_to_background':
            localStorage.setItem(`${prefix}background:calls`, String(Number(localStorage.getItem(`${prefix}background:calls`) ?? 0) + 1));
            emit('main-layer-changed', false);
            return null;
          case 'list_installed_widgets':
            return JSON.parse(localStorage.getItem(`${prefix}widgets:installed`) ?? '[]');
          case 'get_widget_rollback':
            return JSON.parse(localStorage.getItem(`${prefix}widgets:previous`) ?? 'null');
          case 'rollback_widget': {
            const previous = JSON.parse(localStorage.getItem(`${prefix}widgets:previous`) ?? 'null') as Args | null;
            if (!previous || previous.id !== args.id || previous.version !== args.version || JSON.stringify(previous.permissions) !== JSON.stringify(args.permissions)) throw 'widget_package_changed';
            const installed = JSON.parse(localStorage.getItem(`${prefix}widgets:installed`) ?? '[]') as Args[];
            localStorage.setItem(`${prefix}widgets:previous`, JSON.stringify(installed[0] ?? null));
            const manifest = { ...previous, defaultEnabled: false };
            localStorage.setItem(`${prefix}widgets:installed`, JSON.stringify([manifest]));
            return manifest;
          }
          case 'read_widget_storage':
            return JSON.parse(localStorage.getItem(`${prefix}widget-data:${args.id}`) ?? '{}');
          case 'mutate_widget_storage': {
            const mutation = args.mutation as {method:string;key?:string;value?:unknown};
            const key = `${prefix}widget-data:${args.id}`;
            const data = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string,unknown>;
            if (mutation.method === 'clear') { localStorage.setItem(key,'{}'); return null; }
            if (!mutation.key || ['__proto__','constructor','prototype'].includes(mutation.key)) throw 'widget_storage_invalid';
            if (mutation.method === 'set') data[mutation.key] = mutation.value;
            else if (mutation.method === 'remove') delete data[mutation.key];
            else throw new Error('Unsupported test mutation');
            localStorage.setItem(key,JSON.stringify(data));return null;
          }
          case 'widget_utilities_request': {
            const action = args.action as {method:string;id?:string;title?:string;text?:string};
            if (localStorage.getItem(`${prefix}utilities:fail`)) throw localStorage.getItem(`${prefix}utilities:fail`);
            const key = `${prefix}utilities:snippets`;
            let entries = JSON.parse(localStorage.getItem(key) ?? '[]') as {id:string;title:string;text:string}[];
            if (action.method === 'copy') { localStorage.setItem(`${prefix}clipboard:lastwrite`,action.text ?? ''); return []; }
            if (action.method === 'save') { entries=entries.filter(e=>e.id!==action.id);entries.push({id:action.id!,title:action.title!,text:action.text!}); }
            else if (action.method === 'remove') entries=entries.filter(e=>e.id!==action.id);
            else if (action.method === 'clear') entries=[];
            else if (action.method !== 'list') throw new Error('Unsupported test utility action');
            localStorage.setItem(key,JSON.stringify(entries));return entries;
          }
          case 'install_official_widget': {
            const pkg = JSON.parse(localStorage.getItem(`${prefix}widgets:package`) ?? 'null') as { manifest: Args; html: string } | null;
            if (!pkg || pkg.manifest.id !== args.id) throw new Error('Unsupported test widget package');
            const manifest = { ...pkg.manifest, installedPath: `/test/widgets/${args.id}` };
            localStorage.setItem(`${prefix}widgets:installed`, JSON.stringify([manifest]));
            return manifest;
          }
          case 'read_widget_entry_html': {
            const installed = JSON.parse(localStorage.getItem(`${prefix}widgets:installed`) ?? '[]') as Args[];
            const pkg = JSON.parse(localStorage.getItem(`${prefix}widgets:package`) ?? 'null') as { manifest: Args; html: string } | null;
            if (!pkg || !installed.some(widget => widget.id === args.id)) throw new Error('Test widget is not installed');
            return pkg.html;
          }
          case 'widget_shelf_request': {
            const action = args.action as { method: string; id?: string };
            if (action.method === 'activate') { shelfActive = true; shelfEpoch++; }
            const epoch = shelfEpoch;
            if (!shelfActive) throw 'tool_cancelled';
            const failure = localStorage.getItem(`${prefix}shelf:fail`);
            if (failure && !(failure === 'shelf_corrupt' && action.method === 'clear')) throw failure;
            let entries = shelfEntries(); let added = 0, skipped = 0;
            if (action.method === 'add') {
              if (localStorage.getItem(`${prefix}shelf:delay`) === 'true') await new Promise(resolve => setTimeout(resolve, 400));
              if (epoch !== shelfEpoch || !shelfActive) throw 'tool_cancelled';
              if (localStorage.getItem(`${prefix}shelf:cancel`) !== 'true') {
                for (const item of [shelfItem('1-2-3', 'Fixture document.txt'), shelfItem('2-3-4', 'Reference image.png')]) {
                  if (entries.some(e => e.id === item.id)) skipped++; else { entries.push(item); added++; }
                }
              }
            } else if (action.method === 'remove') entries = entries.filter(e => e.id !== action.id);
            else if (action.method === 'clear') { entries = []; localStorage.removeItem(`${prefix}shelf:fail`); }
            else if (action.method === 'reveal' || action.method === 'export') {
              const item = entries.find(e => e.id === action.id); if (!item?.available) throw 'shelf_file_unavailable';
              const failure = localStorage.getItem(`${prefix}shelf:operation-fail`); if (failure) throw failure;
              localStorage.setItem(`${prefix}shelf:${action.method}`, action.id ?? '');
            } else if (!['activate','status'].includes(action.method)) throw new Error('Unsupported test shelf action');
            saveShelf(entries); return { entries, added, skipped };
          }
          case 'widget_screen_request': {
            const action = args.action as { method: string; token?: string; x?: number; y?: number; copy?: boolean };
            const failure = localStorage.getItem(`${prefix}screen:fail`); if (failure) throw failure;
            if (action.method === 'capture') {
              const epoch = ++screenEpoch; localStorage.removeItem(`${prefix}screen:token`);
              localStorage.setItem(`${prefix}screen:calls`, String(Number(localStorage.getItem(`${prefix}screen:calls`) ?? 0) + 1));
              if (localStorage.getItem(`${prefix}screen:delay`) === 'true') await new Promise(resolve => setTimeout(resolve, 400));
              if (epoch !== screenEpoch) throw 'tool_cancelled';
              if (localStorage.getItem(`${prefix}screen:cancel`) === 'true') return { kind: 'cancelled' };
              localStorage.setItem(`${prefix}screen:token`, 'captured-region');
              return { kind: 'capture', image: { token: 'captured-region', width: 800, height: 400, preview: capturePreview } };
            }
            if (action.token !== localStorage.getItem(`${prefix}screen:token`)) throw 'screen_expired';
            if (action.method === 'ocr') return { kind: 'text', text: 'Screen fixture\n屏幕文字' };
            if (action.method === 'export') { localStorage.setItem(`${prefix}screen:export`, 'true'); return { kind: 'exported', bytes: 1234 }; }
            if (action.method === 'color') {
              if (!Number.isInteger(action.x) || !Number.isInteger(action.y) || Number(action.x) < 0 || Number(action.x) >= 800 || Number(action.y) < 0 || Number(action.y) >= 400) throw 'screen_invalid_pixel';
              localStorage.setItem(`${prefix}screen:pixel`, JSON.stringify({ x: action.x, y: action.y }));
              if (action.copy) localStorage.setItem(`${prefix}clipboard:lastwrite`, '#0C2238');
              return { kind: 'color', hex: '#0C2238', r: 12, g: 34, b: 56, copied: action.copy };
            }
            throw new Error('Unsupported test screen action');
          }
          case 'recognize_widget_image': {
            localStorage.setItem(`${prefix}ocr:calls`, String(Number(localStorage.getItem(`${prefix}ocr:calls`) ?? 0) + 1));
            const error = localStorage.getItem(`${prefix}ocr:fail`); if (error) throw error;
            if (localStorage.getItem(`${prefix}ocr:delay`) === 'true') await new Promise(resolve => setTimeout(resolve, 400));
            return localStorage.getItem(`${prefix}ocr:cancel`) === 'true' ? null : 'Recognized fixture\n本地识字';
          }
          case 'select_widget_image': {
            const error = localStorage.getItem(`${prefix}images:fail`); if (error) throw error;
            if (localStorage.getItem(`${prefix}images:cancel`) === 'true') return null;
            localStorage.setItem(`${prefix}images:token`, 'selected-image');
            return { token: 'selected-image', width: 800, height: 400, originalBytes: 40960, preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAFElEQVR4nGNMmXaCAQaY4CwGBgYAKhoBxrgvo6EAAAAASUVORK5CYII=' };
          }
          case 'export_widget_image': {
            if (args.token !== localStorage.getItem(`${prefix}images:token`)) throw 'image_expired';
            const error = localStorage.getItem(`${prefix}images:export-fail`); if (error) throw error;
            if (localStorage.getItem(`${prefix}images:export-cancel`) === 'true') return null;
            const options = args.options as Args;
            localStorage.setItem(`${prefix}images:export`, JSON.stringify(options));
            return { width: options.width, height: options.height, format: options.format, bytes: 1234 };
          }
          case 'widget_history_request': {
            const error = localStorage.getItem(`${prefix}history:fail`); if (error) throw error;
            const action = args.action as { method: string; id?: string }; const state = historyState();
            if (action.method === 'start') state.recording = true;
            else if (action.method === 'pause') state.recording = false;
            else if (action.method === 'clear') { state.recording = false; state.entries = []; state.skipped = 0; }
            else if (action.method === 'delete') state.entries = state.entries.filter(e => e.id !== action.id);
            else if (action.method === 'copy') localStorage.setItem(`${prefix}clipboard:lastwrite`, state.entries.find(e => e.id === action.id)?.text ?? '');
            else if (action.method !== 'status') throw new Error('Unsupported test history action');
            if (action.method !== 'status') saveHistory(state);
            return state;
          }
          case 'get_widget_history_status': { const state = historyState(); return { recording: state.recording, count: state.entries.length, revision: localStorage.getItem(`${prefix}history:revision`) ?? '0' }; }
          case 'revoke_widget_tool': {
            if (args.widgetId === 'com.pinwall.clipboard-history') saveHistory(emptyHistory());
            else if (args.widgetId === 'com.pinwall.image-tools') localStorage.removeItem(`${prefix}images:token`);
            else if (args.widgetId === 'com.pinwall.file-shelf') { shelfActive = false; shelfEpoch++; }
            else if (args.widgetId === 'com.pinwall.screen-tools') { screenEpoch++; localStorage.removeItem(`${prefix}screen:token`); }
            else if (!['com.pinwall.ocr-note', 'com.pinwall.local-tools'].includes(String(args.widgetId))) throw new Error('Unsupported test native tool');
            return null;
          }
          case 'get_system_info': {
            if (args.category !== 'getMetrics') throw new Error('Unsupported test system category');
            const calls = Number(localStorage.getItem(`${prefix}metrics:calls`) ?? 0) + 1;
            localStorage.setItem(`${prefix}metrics:calls`, String(calls));
            if (localStorage.getItem(`${prefix}metrics:fail`) === 'true') throw 'metrics_unavailable';
            const partial = localStorage.getItem(`${prefix}metrics:partial`) === 'true';
            return {
              sampledAt: Date.now(),
              cpu: partial ? { status: 'unavailable' } : { status: 'ok', value: 37.5 },
              memory: { status: 'ok', value: { total: 17179869184, inUse: 8589934592 } },
              battery: partial ? { status: 'notPresent' } : { status: 'ok', value: { level: 0.85, charging: false, onAc: true } },
            };
          }
          case 'read_widget_clipboard_text': {
            if (args.widgetId !== 'com.pinwall.clipboard-note') throw 'clipboard_permission_denied';
            localStorage.setItem(`${prefix}clipboard:reads`, String(Number(localStorage.getItem(`${prefix}clipboard:reads`) ?? 0) + 1));
            const failure = localStorage.getItem(`${prefix}clipboard:fail`);
            if (failure) throw failure;
            if (localStorage.getItem(`${prefix}clipboard:delay`) === 'true') await new Promise(resolve => setTimeout(resolve, 400));
            return localStorage.getItem(`${prefix}clipboard:text`) ?? 'Clipboard fixture\nSecond line';
          }
          case 'open_widget_power_session':
            if (args.widgetId !== 'com.pinwall.keep-awake') throw 'power_permission_denied';
            powerToken = `test-session-${nextId++}`;
            powerStatus = { supported: true, active: false, endsAt: null };
            powerLog('open'); return powerToken;
          case 'widget_power_request': {
            if (!powerToken || args.token !== powerToken) throw 'power_session_closed';
            const action = args.action as { method: string; minutes?: number };
            powerLog(action.method);
            if (powerStatus.endsAt !== null && Date.now() >= powerStatus.endsAt) powerStatus = { supported: true, active: false, endsAt: null };
            if (action.method === 'start') {
              if (localStorage.getItem(`${prefix}power:failStart`) === 'true') throw 'power_acquire_failed';
              if (!Number.isInteger(action.minutes) || Number(action.minutes) < 1 || Number(action.minutes) > 480) throw 'power_invalid_duration';
              if (!powerStatus.active) powerStatus = { supported: true, active: true, endsAt: Date.now() + Number(action.minutes) * 60000 };
            } else if (action.method === 'stop') powerStatus = { supported: true, active: false, endsAt: null };
            else if (action.method !== 'status') throw new Error('Unknown test power action');
            return powerStatus;
          }
          case 'close_widget_power_session':
            powerLog('close');
            if (args.token === powerToken) { powerToken = null; powerStatus = { supported: true, active: false, endsAt: null }; }
            return null;
          case 'revoke_widget_power':
            if (args.widgetId !== 'com.pinwall.keep-awake') throw 'power_permission_denied';
            if (localStorage.getItem(`${prefix}power:failStop`) === 'true') throw 'power_release_failed';
            powerLog('revoke');
            powerToken = null; powerStatus = { supported: true, active: false, endsAt: null };
            return null;
          case 'uninstall_widget':
            if (!['com.pinwall.keep-awake', 'com.pinwall.system-monitor', 'com.pinwall.clipboard-note', 'com.pinwall.ocr-note', 'com.pinwall.image-tools', 'com.pinwall.clipboard-history', 'com.pinwall.file-shelf', 'com.pinwall.screen-tools', 'com.pinwall.local-tools'].includes(String(args.id))) throw new Error('Unsupported test widget uninstall');
            localStorage.setItem(`${prefix}widgets:installed`, '[]');
            if (args.id === 'com.pinwall.local-tools') localStorage.removeItem(`${prefix}utilities:snippets`);
            if (args.id === 'com.pinwall.file-shelf') { shelfActive = false; shelfEpoch++; saveShelf([]); }
            if (args.id === 'com.pinwall.screen-tools') { screenEpoch++; localStorage.removeItem(`${prefix}screen:token`); }
            if (args.id === 'com.pinwall.clipboard-history') saveHistory(emptyHistory());
            if (args.id === 'com.pinwall.image-tools') localStorage.removeItem(`${prefix}images:token`);
            if (args.id === 'com.pinwall.keep-awake') { powerToken = null; powerStatus = { supported: true, active: false, endsAt: null }; powerLog('uninstall'); }
            return null;
          case 'plugin:window|get_all_windows':
            return ['main', 'settings', 'notification'];
          case 'plugin:window|set_ignore_cursor_events':
          case 'plugin:window|set_position':
          case 'plugin:window|show':
          case 'plugin:window|hide':
          case 'plugin:window|set_focus':
            return null;
          case 'plugin:dialog|message': {
            const buttons = args.buttons as { OkCancelCustom?: [string, string] };
            const labels = buttons.OkCancelCustom;
            if (!labels) throw new Error('Unsupported test dialog buttons');
            return window.confirm((args.message as string) ?? '') ? labels[0] : labels[1];
          }
          default:
            console.error(`Unsupported test IPC command: ${command}`);
            throw new Error(`Unsupported test IPC command: ${command}`);
        }
      };

      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        configurable: true,
        value: {
          metadata: {
            currentWindow: { label: new URL(location.href).searchParams.get('window') ?? 'main' },
            currentWebview: { label: new URL(location.href).searchParams.get('window') ?? 'main', windowLabel: new URL(location.href).searchParams.get('window') ?? 'main' },
          },
          invoke,
          transformCallback: (callback: Callback, once = false) => {
            const id = nextId++;
            callbacks.set(id, (value) => {
              if (once) callbacks.delete(id);
              callback(value);
            });
            return id;
          },
          unregisterCallback: (id: number) => callbacks.delete(id),
          convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
        },
      });
      Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
        configurable: true,
        value: {
          unregisterListener: (event: string, id: number) => {
            const callbackId = listeners.get(event)?.get(id);
            if (callbackId !== undefined) callbacks.delete(callbackId);
            listeners.get(event)?.delete(id);
          },
        },
      });
    });

    await use(page);
    expect(errors, 'The page must not emit runtime or native-adapter errors').toEqual([]);
  },
});

export { expect };
