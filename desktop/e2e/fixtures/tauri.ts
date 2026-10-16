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
      if (location.origin !== 'http://localhost:1932') return;
      type Args = Record<string, unknown>;
      type Callback = (value: unknown) => void;
      const callbacks = new Map<number, Callback>();
      const listeners = new Map<string, Map<number, number>>();
      let nextId = 1;
      const prefix = 'pinwall-e2e:';
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
            emit('main-layer-changed', false);
            return null;
          case 'list_installed_widgets':
            return [];
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
