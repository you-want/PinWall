import { create } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { createMockCard } from '../__tests__/fixtures/cards';
import { createCardPersistence, type CardsDocument, type CardsIO, type CardPatch, applyCardPatch } from './cardPersistence';

function setup() {
  let document: CardsDocument = { schemaVersion: 1, revision: 0, cards: [createMockCard({ id: 'a' })], zIndexMap: {} };
  let listener: Parameters<CardsIO['listen']>[0] = () => {};
  const io: CardsIO = {
    read: vi.fn(async () => structuredClone(document)),
    listen: vi.fn(async callback => { listener = callback; return () => {}; }),
    patch: vi.fn(async (patch, mutationId, clientId) => {
      document = { ...applyCardPatch(document, patch), revision: document.revision + 1 };
      listener({ document, mutationId, clientId });
      return structuredClone(document);
    }),
  };
  const store = create<{ cards: typeof document.cards; zIndexMap: Record<string, number>; _zIndexCounter: number }>(() => ({ cards: [], zIndexMap: {}, _zIndexCounter: 100 }));
  const statuses: string[] = [];
  const handler = createCardPersistence(store, io, status => statuses.push(status));
  return { io, store, handler, statuses, remote: (patch: CardPatch) => {
    document = { ...applyCardPatch(document, patch), revision: document.revision + 1 };
    listener({ document, mutationId: '', clientId: 'other-window' });
  } };
}

describe('atomic card persistence', () => {
  it('hydrates before watching and sends only changed card fields', async () => {
    const { io, store, handler } = setup();
    await handler.start();
    expect(store.getState().cards[0].id).toBe('a');
    expect(io.patch).not.toHaveBeenCalled();
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, x: 70 })) }));
    await handler.flush();
    expect(io.patch).toHaveBeenCalledWith(expect.objectContaining({ updates: [{ id: 'a', changes: { x: 70 } }] }), expect.any(String), expect.any(String));
    handler.stop();
  });

  it('keeps unsaved edits visible through remote updates and retries after failure', async () => {
    const { io, store, handler, statuses, remote } = setup();
    await handler.start();
    vi.mocked(io.patch).mockRejectedValueOnce('private-path-and-body');
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, content: 'local draft' })) }));
    await expect(handler.flush()).rejects.toThrow('cards_save_failed');
    remote({ creates: [createMockCard({ id: 'b' })], updates: [{ id: 'a', changes: { y: 88 } }], deletes: [], zIndex: {} });
    expect(store.getState().cards.find(c => c.id === 'a')).toMatchObject({ content: 'local draft', y: 88 });
    expect(store.getState().cards.map(c => c.id)).toEqual(['a', 'b']);
    expect(statuses.at(-1)).toBe('failed');
    await handler.retry();
    expect(statuses.at(-1)).toBe('saved');
    expect(store.getState().cards.find(c => c.id === 'a')).toMatchObject({ content: 'local draft', y: 88 });
    handler.stop();
  });

  it('rebases edits made while a native save is in flight', async () => {
    const { io, store, handler } = setup();
    await handler.start();
    const original = vi.mocked(io.patch).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(io.patch).mockImplementationOnce(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return original(...args);
    });
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, x: 10 })) }));
    const saving = handler.flush();
    await vi.waitFor(() => expect(release).toBeDefined());
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, x: 20, content: 'newer edit' })) }));
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, x: 30, title: 'latest title' })) }));
    release();
    await saving;
    expect(store.getState().cards[0]).toMatchObject({ x: 30, content: 'newer edit', title: 'latest title' });
    expect(io.patch).toHaveBeenCalledTimes(2);
    handler.stop();
  });

  it('does not resurrect remotely deleted cards with a stale edit', () => {
    const current = { schemaVersion: 1, revision: 2, cards: [], zIndexMap: {} };
    const merged = applyCardPatch(current, { creates: [], updates: [{ id: 'gone', changes: { content: 'stale' } }], deletes: [], zIndex: {} });
    expect(merged.cards).toEqual([]);
  });

  it('treats a native commit event as success even if the response is lost', async () => {
    const { io, store, handler, statuses } = setup();
    await handler.start();
    const commit = vi.mocked(io.patch).getMockImplementation()!;
    vi.mocked(io.patch).mockImplementationOnce(async (...args) => {
      await commit(...args);
      throw new Error('lost response');
    });
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, content: 'committed' })) }));
    await handler.flush();
    expect(statuses.at(-1)).toBe('saved');
    expect(store.getState().cards[0].content).toBe('committed');
    expect(io.patch).toHaveBeenCalledTimes(1);
    handler.stop();
  });

  it('keeps the failed mutation identity and compacts later draft edits for retry', async () => {
    const { io, store, handler, remote } = setup();
    await handler.start();
    vi.mocked(io.patch).mockRejectedValueOnce('storage_write_failed');
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, content: 'first draft' })) }));
    await expect(handler.flush()).rejects.toThrow('cards_save_failed');
    const failedMutation = vi.mocked(io.patch).mock.calls[0][1];
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, content: 'second draft' })) }));
    store.setState(s => ({ cards: s.cards.map(c => ({ ...c, content: 'final draft' })) }));
    remote({ creates: [], updates: [{ id: 'a', changes: { y: 44 } }], deletes: [], zIndex: {} });
    await handler.retry();
    expect(vi.mocked(io.patch).mock.calls[1][1]).toBe(failedMutation);
    expect(io.patch).toHaveBeenCalledTimes(3);
    expect(store.getState().cards[0]).toMatchObject({ content: 'final draft', y: 44 });
    handler.stop();
  });
});
