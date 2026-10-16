import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StoreApi } from 'zustand';
import type { PinCardData } from '../types';

export interface CardsDocument { schemaVersion: number; revision: number; cards: PinCardData[]; zIndexMap: Record<string, number> }
export interface CardPatch { creates: PinCardData[]; updates: { id: string; changes: Partial<PinCardData> }[]; deletes: string[]; zIndex: Record<string, number | null> }
interface CardEvent { document: CardsDocument; mutationId: string; clientId: string }
export type CardSaveStatus = 'saved' | 'saving' | 'failed';
export interface CardsIO {
  read: () => Promise<CardsDocument>;
  patch: (patch: CardPatch, mutationId: string, clientId: string) => Promise<CardsDocument>;
  listen: (callback: (event: CardEvent) => void) => Promise<() => void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isCard(value: unknown): value is PinCardData {
  if (!record(value)) return false;
  return ['id', 'title', 'content'].every(key => typeof value[key] === 'string') && value.id !== ''
    && ['x', 'y', 'createdAt', 'updatedAt', 'colorIndex'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && ['collapsed', 'reminderEnabled', 'reminderFired', 'checkinDone'].every(key => typeof value[key] === 'boolean')
    && (value.reminderTime === null || typeof value.reminderTime === 'number')
    && (value.lastCheckinDate === null || typeof value.lastCheckinDate === 'string')
    && ['note', 'reminder', 'daily-checkin', 'hydration', 'mood'].includes(String(value.cardType));
}
export function decodeCardsDocument(value: unknown): CardsDocument {
  if (!record(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.cards) || !value.cards.every(isCard) || !record(value.zIndexMap)
    || !Object.values(value.zIndexMap).every(n => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('cards_invalid_response');
  }
  return value as unknown as CardsDocument;
}

export function applyCardPatch<T extends Pick<CardsDocument, 'cards' | 'zIndexMap'>>(state: T, patch: CardPatch): T {
  const removed = new Set(patch.deletes);
  const updates = new Map(patch.updates.map(update => [update.id, update.changes]));
  const cards = state.cards.filter(card => !removed.has(card.id)).map(card => ({ ...card, ...updates.get(card.id), id: card.id }));
  const ids = new Set(cards.map(card => card.id));
  for (const card of patch.creates) if (!ids.has(card.id)) { cards.push(card); ids.add(card.id); }
  const zIndexMap = { ...state.zIndexMap };
  for (const [id, value] of Object.entries(patch.zIndex)) {
    if (value === null) delete zIndexMap[id];
    else zIndexMap[id] = value;
  }
  for (const id of removed) delete zIndexMap[id];
  return { ...state, cards, zIndexMap };
}

function diff(before: Pick<CardsDocument, 'cards' | 'zIndexMap'>, after: Pick<CardsDocument, 'cards' | 'zIndexMap'>): CardPatch {
  const oldCards = new Map(before.cards.map(card => [card.id, card]));
  const ids = new Set(after.cards.map(card => card.id));
  const patch: CardPatch = { creates: [], updates: [], deletes: before.cards.filter(card => !ids.has(card.id)).map(card => card.id), zIndex: {} };
  for (const card of after.cards) {
    const old = oldCards.get(card.id);
    if (!old) { patch.creates.push(card); continue; }
    const changes = Object.fromEntries(Object.entries(card).filter(([key, value]) => key !== 'id' && value !== undefined && value !== old[key as keyof PinCardData])) as Partial<PinCardData>;
    if (Object.keys(changes).length) patch.updates.push({ id: card.id, changes });
  }
  for (const id of new Set([...Object.keys(before.zIndexMap), ...Object.keys(after.zIndexMap)])) {
    if (before.zIndexMap[id] !== after.zIndexMap[id]) patch.zIndex[id] = after.zIndexMap[id] ?? null;
  }
  return patch;
}
const empty = (patch: CardPatch) => !patch.creates.length && !patch.updates.length && !patch.deletes.length && !Object.keys(patch.zIndex).length;

const nativeIO: CardsIO = {
  read: async () => decodeCardsDocument(await invoke<unknown>('cards_read')),
  patch: async (patch, mutationId, clientId) => decodeCardsDocument(await invoke<unknown>('cards_patch', { patch, mutationId, clientId })),
  listen: callback => listen<unknown>('cards:committed', ({ payload }) => {
    if (!record(payload) || typeof payload.clientId !== 'string' || typeof payload.mutationId !== 'string') return;
    callback({ document: decodeCardsDocument(payload.document), clientId: payload.clientId, mutationId: payload.mutationId });
  }),
};

/** Optimistic local edits stay visible until a native atomic commit acknowledges them. */
export function createCardPersistence<S extends Pick<CardsDocument, 'cards' | 'zIndexMap'> & { _zIndexCounter: number }>(
  store: StoreApi<S>, io: CardsIO = nativeIO, onStatus: (status: CardSaveStatus) => void = () => {},
) {
  const clientId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let sequence = 0;
  let authoritative: CardsDocument = { schemaVersion: 1, revision: -1, cards: [], zIndexMap: {} };
  let pending: { id: string; patch: CardPatch }[] = [];
  let unsubscribe: (() => void) | undefined;
  let unlisten: (() => void) | undefined;
  let suppress = false;
  let failed = false;
  let active = false;
  let running: Promise<void> | undefined;
  let inFlightId: string | undefined;

  const render = () => {
    let rebased = authoritative;
    for (const operation of pending) rebased = applyCardPatch(rebased, operation.patch);
    suppress = true;
    store.setState({ cards: rebased.cards, zIndexMap: rebased.zIndexMap,
      _zIndexCounter: Math.max(store.getState()._zIndexCounter, 100, ...Object.values(rebased.zIndexMap)),
    } as Partial<S>);
    suppress = false;
  };
  const receive = (document: CardsDocument, mutationId?: string) => {
    if (mutationId) pending = pending.filter(operation => operation.id !== mutationId);
    if (document.revision >= authoritative.revision) authoritative = document;
    render();
  };
  const drain = async () => {
    while (active && pending.length && !failed) {
      const operation = pending[0];
      inFlightId = operation.id;
      try {
        const document = await io.patch(operation.patch, operation.id, clientId);
        if (active) receive(document, operation.id);
      } catch {
        // The commit event can arrive even if the response was lost. Do not report it as unsaved.
        if (pending.some(item => item.id === operation.id)) {
          failed = true;
          onStatus('failed');
          throw new Error('cards_save_failed');
        }
      } finally {
        inFlightId = undefined;
      }
    }
    if (active && !failed && !pending.length) onStatus('saved');
  };
  const flush = (): Promise<void> => {
    if (failed) return Promise.reject(new Error('cards_save_failed'));
    if (!running) running = drain().finally(() => {
      running = undefined;
      if (active && !failed && pending.length) queueMicrotask(() => { void flush().catch(() => {}); });
    });
    return running;
  };
  const focus = () => { void io.read().then(document => { if (active) receive(document); }).catch(() => { failed = true; onStatus('failed'); }); };

  return {
    async start() {
      if (active) return;
      active = true;
      try {
        unlisten = await io.listen(event => {
          if (active) receive(event.document, event.clientId === clientId ? event.mutationId : undefined);
        });
        receive(await io.read());
        unsubscribe = store.subscribe((state, previous) => {
          if (suppress) return;
          const patch = diff(previous, state);
          if (empty(patch)) return;
          pending.push({ id: String(++sequence), patch: structuredClone(patch) });
          // Collapse unsent drag/edit updates, while preserving the identity of an uncertain commit.
          const protectedId = inFlightId ?? (failed ? pending[0]?.id : undefined);
          const protectedOperation = pending.find(operation => operation.id === protectedId);
          const unsent = pending.filter(operation => operation.id !== protectedId);
          if (unsent.length > 1) {
            const base = protectedOperation ? applyCardPatch(authoritative, protectedOperation.patch) : authoritative;
            const latest = unsent.reduce((state, operation) => applyCardPatch(state, operation.patch), base);
            const compact = diff(base, latest);
            pending = protectedOperation ? [protectedOperation] : [];
            if (!empty(compact)) pending.push({ id: unsent[unsent.length - 1].id, patch: compact });
          }
          if (!failed) onStatus('saving');
          void flush().catch(() => {}); // Failure is retained and shown through onStatus.
        });
        window.addEventListener('focus', focus);
        onStatus('saved');
      } catch {
        active = false;
        unlisten?.();
        throw new Error('cards_load_failed');
      }
    },
    flush,
    async retry() {
      failed = false;
      onStatus('saving');
      try { receive(await io.read()); await flush(); }
      catch { failed = true; onStatus('failed'); throw new Error('cards_save_failed'); }
    },
    stop() { active = false; unsubscribe?.(); unlisten?.(); window.removeEventListener('focus', focus); },
  };
}
