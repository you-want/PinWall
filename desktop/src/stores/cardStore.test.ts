import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockCard, createMockCards, createReminderCard, createDailyCheckinCard, createHydrationCard } from '@/__tests__';

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('useCardStore', () => {
  let useCardStore: typeof import('@/stores/cardStore').useCardStore;
  let migrateCardsIfNeeded: typeof import('@/stores/cardStore').migrateCardsIfNeeded;
  let cardAId: string;
  let cardBId: string;

  beforeEach(async () => {
    const mod = await import('@/stores/cardStore');
    useCardStore = mod.useCardStore;
    migrateCardsIfNeeded = mod.migrateCardsIfNeeded;
    useCardStore.setState({
      cards: [],
      zIndexMap: {},
      _zIndexCounter: 100,
    });
    cardAId = '';
    cardBId = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createTwoCards() {
    useCardStore.getState().createCard('A', 'C', 0, 'note', false, null, 0, 0);
    cardAId = useCardStore.getState().cards[0].id;
    await delay(10);
    useCardStore.getState().createCard('B', 'C', 0, 'note', false, null, 0, 0);
    cardBId = useCardStore.getState().cards[1].id;
    return { cardAId, cardBId };
  }

  describe('createCard', () => {
    it('creates a card with default grid position', () => {
      useCardStore.getState().createCard(
        'Test Title', 'Test Content', 0, 'note', false, null, 0, 0
      );
      const cards = useCardStore.getState().cards;
      expect(cards).toHaveLength(1);
      expect(cards[0].title).toBe('Test Title');
      expect(cards[0].content).toBe('Test Content');
      expect(cards[0].cardType).toBe('note');
      expect(cards[0].id).toMatch(/^card-/);
    });

    it('assigns grid position even when x,y are 0', () => {
      useCardStore.getState().createCard('Title', '', -1, 'note', false, null, 0, 0);
      const cards = useCardStore.getState().cards;
      expect(cards[0].x).toBeGreaterThanOrEqual(0);
      expect(cards[0].y).toBeGreaterThanOrEqual(0);
    });

    it('generates random content when content is empty', () => {
      useCardStore.getState().createCard('Title', '', 0, 'note', false, null, 0, 0);
      expect(useCardStore.getState().cards[0].content.length).toBeGreaterThan(0);
    });

    it('sets timestamp on createdAt and updatedAt', () => {
      const before = Date.now() - 1000;
      useCardStore.getState().createCard('T', 'C', 0, 'note', false, null, 0, 0);
      const after = Date.now() + 1000;
      const cards = useCardStore.getState().cards;
      expect(cards[0].createdAt).toBeGreaterThanOrEqual(before);
      expect(cards[0].createdAt).toBeLessThanOrEqual(after);
      expect(cards[0].updatedAt).toBe(cards[0].createdAt);
    });

    it('creates unique cards with delays', async () => {
      await createTwoCards();
      const cards = useCardStore.getState().cards;
      expect(cards).toHaveLength(2);
      expect(cards.find(c => c.title === 'A')!.title).toBe('A');
      expect(cards.find(c => c.title === 'B')!.title).toBe('B');
    });

    it('increments zIndex for each new card', async () => {
      await createTwoCards();
      const { zIndexMap, _zIndexCounter } = useCardStore.getState();
      expect(Object.keys(zIndexMap)).toHaveLength(2);
      expect(_zIndexCounter).toBe(102);
    });
  });

  describe('closeCard', () => {
    it('removes a card by id', () => {
      useCardStore.getState().createCard('To Delete', 'C', 0, 'note', false, null, 0, 0);
      const id = useCardStore.getState().cards[0].id;
      useCardStore.getState().closeCard(id);
      expect(useCardStore.getState().cards).toHaveLength(0);
    });

    it('does nothing for non-existent card', () => {
      useCardStore.getState().createCard('Keep Me', 'C', 0, 'note', false, null, 0, 0);
      useCardStore.getState().closeCard('non-existent-id');
      expect(useCardStore.getState().cards).toHaveLength(1);
    });
  });

  describe('setPosition', () => {
    it('updates card position and timestamp', async () => {
      useCardStore.getState().createCard('Move Me', 'C', 0, 'note', false, null, 0, 0);
      const id = useCardStore.getState().cards[0].id;
      const oldUpdated = useCardStore.getState().cards[0].updatedAt;
      await delay(10);
      useCardStore.getState().setPosition(id, 100, 200);
      const card = useCardStore.getState().cards.find(c => c.id === id);
      expect(card!.x).toBe(100);
      expect(card!.y).toBe(200);
      expect(card!.updatedAt).toBeGreaterThan(oldUpdated);
    });
  });

  describe('bringToFront', () => {
    it('assigns highest zIndex to the specified card', async () => {
      await createTwoCards();
      useCardStore.getState().bringToFront(cardAId);
      const { zIndexMap } = useCardStore.getState();
      expect(zIndexMap[cardAId]).toBeGreaterThan(zIndexMap[cardBId]);
    });
  });

  describe('toggleCollapse', () => {
    it('toggles collapsed state', () => {
      useCardStore.getState().createCard('Collapse Me', 'C', 0, 'note', false, null, 0, 0);
      const id = useCardStore.getState().cards[0].id;
      expect(useCardStore.getState().cards[0].collapsed).toBe(false);
      useCardStore.getState().toggleCollapse(id);
      expect(useCardStore.getState().cards.find(c => c.id === id)!.collapsed).toBe(true);
      useCardStore.getState().toggleCollapse(id);
      expect(useCardStore.getState().cards.find(c => c.id === id)!.collapsed).toBe(false);
    });
  });

  describe('updateReminder', () => {
    it('updates reminder state and resets fired flag', () => {
      useCardStore.getState().createCard('Reminder Card', 'C', 0, 'reminder', false, null, 0, 0);
      const id = useCardStore.getState().cards[0].id;
      const tomorrow = Date.now() + 86400000;
      useCardStore.getState().updateReminder(id, true, tomorrow);
      const card = useCardStore.getState().cards.find(c => c.id === id)!;
      expect(card.reminderEnabled).toBe(true);
      expect(card.reminderTime).toBe(tomorrow);
      expect(card.reminderFired).toBe(false);
    });
  });

  describe('upsertSystemCard', () => {
    it('updates an existing system card instead of creating duplicates', async () => {
      useCardStore.getState().upsertSystemCard({
        kind: 'eye-care',
        title: 'Eye Break',
        content: 'Look away',
        colorIndex: 5,
        x: 100,
        y: 100,
      });
      const first = useCardStore.getState().cards[0];
      await delay(10);
      useCardStore.getState().upsertSystemCard({
        kind: 'eye-care',
        title: 'Eye Break Again',
        content: 'Look away again',
        colorIndex: 6,
        x: 200,
        y: 200,
      });

      const cards = useCardStore.getState().cards;
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(first.id);
      expect(cards[0].systemKind).toBe('eye-care');
      expect(cards[0].title).toBe('Eye Break Again');
      expect(cards[0].content).toBe('Look away again');
      expect(cards[0].colorIndex).toBe(6);
      expect(cards[0].x).toBe(first.x);
      expect(cards[0].y).toBe(first.y);
      expect(cards[0].updatedAt).toBeGreaterThan(first.updatedAt);
    });

    it('keeps different system card kinds separate', () => {
      useCardStore.getState().upsertSystemCard({
        kind: 'eye-care',
        title: 'Eye Break',
        content: 'Look away',
        colorIndex: 5,
        x: 100,
        y: 100,
      });
      useCardStore.getState().upsertSystemCard({
        kind: 'rest',
        title: 'Rest',
        content: 'Stand up',
        colorIndex: 3,
        x: 160,
        y: 160,
      });

      expect(useCardStore.getState().cards).toHaveLength(2);
      expect(useCardStore.getState().cards.map((card) => card.systemKind).sort()).toEqual([
        'eye-care',
        'rest',
      ]);
    });
  });

  describe('reminderFired', () => {
    it('marks reminder as fired', () => {
      useCardStore.getState().createCard('Fired Card', 'C', 0, 'reminder', true, Date.now(), 0, 0);
      const id = useCardStore.getState().cards[0].id;
      useCardStore.getState().reminderFired(id);
      expect(useCardStore.getState().cards.find(c => c.id === id)!.reminderFired).toBe(true);
    });
  });

  describe('batchSetPositions', () => {
    it('updates multiple cards at once', async () => {
      await createTwoCards();
      await delay(10);
      useCardStore.getState().createCard('C', 'C', 0, 'note', false, null, 0, 0);
      const cards = useCardStore.getState().cards;
      const ids = [cards[0].id, cards[1].id, cards[2].id];
      useCardStore.getState().batchSetPositions([
        { id: ids[0], x: 10, y: 20 },
        { id: ids[1], x: 30, y: 40 },
      ]);
      expect(useCardStore.getState().cards.find(c => c.id === ids[0])!.x).toBe(10);
      expect(useCardStore.getState().cards.find(c => c.id === ids[0])!.y).toBe(20);
      expect(useCardStore.getState().cards.find(c => c.id === ids[1])!.x).toBe(30);
      expect(useCardStore.getState().cards.find(c => c.id === ids[1])!.y).toBe(40);
    });
  });

  describe('unstashCard', () => {
    it('clears collapsed flag', () => {
      useCardStore.getState().createCard('Stash Me', 'C', 0, 'note', false, null, 0, 0);
      const id = useCardStore.getState().cards[0].id;
      useCardStore.getState().toggleCollapse(id);
      expect(useCardStore.getState().cards.find(c => c.id === id)!.collapsed).toBe(true);
      useCardStore.getState().unstashCard(id);
      expect(useCardStore.getState().cards.find(c => c.id === id)!.collapsed).toBe(false);
    });
  });

  describe('fixture helpers', () => {
    it('createMockCard produces valid card data', () => {
      const card = createMockCard();
      expect(card.id).toBe('card-1700000000000');
      expect(card.title).toBe('测试卡片');
      expect(card.cardType).toBe('note');
      expect(card.reminderEnabled).toBe(false);
    });

    it('createMockCard with overrides', () => {
      const card = createMockCard({ title: 'Custom', colorIndex: 3 });
      expect(card.title).toBe('Custom');
      expect(card.colorIndex).toBe(3);
    });

    it('createMockCards generates multiple cards', () => {
      const cards = createMockCards(3);
      expect(cards).toHaveLength(3);
      expect(cards[0].id).toBe('card-0');
      expect(cards[1].id).toBe('card-1');
    });

    it('createReminderCard sets reminder fields', () => {
      const card = createReminderCard();
      expect(card.cardType).toBe('reminder');
      expect(card.reminderEnabled).toBe(true);
      expect(card.reminderTime).toBeGreaterThan(Date.now() - 1000);
    });

    it('createDailyCheckinCard sets checkin fields', () => {
      const card = createDailyCheckinCard();
      expect(card.cardType).toBe('daily-checkin');
      expect(card.reminderEnabled).toBe(true);
    });

    it('createHydrationCard sets hydration fields', () => {
      const card = createHydrationCard();
      expect(card.cardType).toBe('hydration');
      expect(card.hydrationCount).toBe(3);
      expect(card.hydrationGoal).toBe(8);
    });
  });

  describe('migrateCardsIfNeeded', () => {
    it('migrates old cards without cardType', () => {
      useCardStore.setState({
        cards: [{ id: 'old-1', reminderEnabled: true } as any],
        zIndexMap: {},
        _zIndexCounter: 1,
      });
      migrateCardsIfNeeded();
      const migrated = useCardStore.getState().cards[0] as any;
      expect(migrated.cardType).toBe('reminder');
      expect(migrated.checkinDone).toBe(false);
    });

    it('does nothing for already-migrated cards', () => {
      useCardStore.getState().createCard('New Card', 'C', 0, 'note', false, null, 0, 0);
      migrateCardsIfNeeded();
      expect(useCardStore.getState().cards).toHaveLength(1);
      expect(useCardStore.getState().cards[0].cardType).toBe('note');
    });
  });
});
