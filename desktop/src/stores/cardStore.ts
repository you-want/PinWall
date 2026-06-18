import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import { getTranslations } from "../i18n";
import { useLanguageStore } from "./languageStore";
import { getNextGridPosition } from "../utils/gridLayout";
import type { PinCardData, CardType } from "../types";

function getDefaultMessages(): string[] {
  const lang = useLanguageStore.getState().lang;
  const t = getTranslations(lang);
  return [
    t.msg_1, t.msg_2, t.msg_3, t.msg_4, t.msg_5, t.msg_6, t.msg_7, t.msg_8,
    t.msg_9, t.msg_10, t.msg_11, t.msg_12, t.msg_13, t.msg_14, t.msg_15, t.msg_16,
  ];
}

// 向后兼容迁移：旧卡片推断类型
function migrateCard(card: any): PinCardData {
  if (!card.cardType) {
    card.cardType = card.reminderEnabled ? "reminder" : "note";
  }
  card.checkinDone ??= false;
  card.lastCheckinDate ??= null;
  return card as PinCardData;
}

type CardState = {
  cards: PinCardData[];
  zIndexMap: Record<string, number>;
  _zIndexCounter: number;

  setPosition: (id: string, x: number, y: number) => void;
  batchSetPositions: (positions: { id: string; x: number; y: number }[]) => void;
  bringToFront: (id: string) => void;
  toggleCollapse: (id: string) => void;
  closeCard: (id: string) => void;
  createCard: (
    title: string,
    content: string,
    colorIndex: number,
    cardType: CardType,
    reminderEnabled: boolean,
    reminderTime: number | null,
    x: number,
    y: number
  ) => void;
  updateReminder: (id: string, reminderEnabled: boolean, reminderTime: number | null) => void;
  updateContent: (id: string, content: string) => void;
  reminderFired: (id: string) => void;
  unstashCard: (id: string) => void;
  checkinCard: (id: string) => void;
  checkinHydration: (id: string) => void;
  resetDailyCheckins: () => void;
  resetDailyHydration: () => void;
};

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  zIndexMap: {},
  _zIndexCounter: 100,

  setPosition: (id, x, y) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, x, y, updatedAt: Date.now() } : card
      ),
    }));
  },

  batchSetPositions: (positions) => {
    const posMap = new Map(positions.map((p) => [p.id, p]));
    set((s) => ({
      cards: s.cards.map((card) => {
        const pos = posMap.get(card.id);
        return pos ? { ...card, x: pos.x, y: pos.y } : card;
      }),
    }));
  },

  bringToFront: (id) => {
    const { zIndexMap, _zIndexCounter } = get();
    const maxInMap = Math.max(0, ...Object.values(zIndexMap));
    const nextCounter = Math.max(_zIndexCounter, maxInMap) + 1;
    set((s) => ({
      zIndexMap: { ...s.zIndexMap, [id]: nextCounter },
      _zIndexCounter: nextCounter,
    }));
  },

  toggleCollapse: (id) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, collapsed: !card.collapsed, updatedAt: Date.now() } : card
      ),
    }));
  },

  closeCard: (id) => {
    set((s) => ({ cards: s.cards.filter((card) => card.id !== id) }));
  },

  createCard: (title, content, colorIndex, cardType, reminderEnabled, reminderTime, _x, _y) => {
    const now = Date.now();
    // 始终使用网格位置，确保卡片整齐排列
    const existingPositions = get().cards.map((c) => ({ x: c.x, y: c.y }));
    const gridPos = getNextGridPosition(existingPositions);
    const newCard: PinCardData = {
      id: `card-${now}`,
      title,
      content: content || getDefaultMessages()[Math.floor(Math.random() * 16)],
      x: gridPos.x,
      y: gridPos.y,
      collapsed: false,
      colorIndex,
      createdAt: now,
      updatedAt: now,
      cardType,
      reminderEnabled,
      reminderTime,
      reminderFired: false,
      checkinDone: false,
      lastCheckinDate: null,
      // Hydration card defaults
      ...(cardType === "hydration" ? {
        hydrationCount: 0,
        hydrationGoal: 8,
        hydrationDate: new Date().toISOString().slice(0, 10),
      } : {}),
    };
    const { zIndexMap, _zIndexCounter } = get();
    const maxInMap = Math.max(0, ...Object.values(zIndexMap));
    const nextCounter = Math.max(_zIndexCounter, maxInMap) + 1;
    set((s) => ({
      cards: [...s.cards, newCard],
      zIndexMap: { ...s.zIndexMap, [newCard.id]: nextCounter },
      _zIndexCounter: nextCounter,
    }));
  },

  updateReminder: (id, reminderEnabled, reminderTime) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id
          ? { ...card, reminderEnabled, reminderTime, reminderFired: false, updatedAt: Date.now() }
          : card
      ),
    }));
  },

  updateContent: (id, content) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, content, updatedAt: Date.now() } : card
      ),
    }));
  },

  reminderFired: (id) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, reminderFired: true, updatedAt: Date.now() } : card
      ),
    }));
  },

  // 将收纳区的卡片钉回桌面：更新 updatedAt 使其重新排到第一位（可见区）
  // 注意：这会将原本第 5 位的卡片挤到收纳区，即“一进一出”行为
  unstashCard: (id) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, collapsed: false, updatedAt: Date.now() } : card
      ),
    }));
  },

  checkinCard: (id) => {
    const today = new Date().toISOString().slice(0, 10);
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id
          ? { ...card, checkinDone: true, lastCheckinDate: today, updatedAt: Date.now() }
          : card
      ),
    }));
  },

  resetDailyCheckins: () => {
    const today = new Date().toISOString().slice(0, 10);
    set((s) => ({
      cards: s.cards.map((card) =>
        card.cardType === "daily-checkin" && card.lastCheckinDate !== today
          ? { ...card, checkinDone: false, reminderFired: false, updatedAt: Date.now() }
          : card
      ),
    }));
  },

  checkinHydration: (id) => {
    const today = new Date().toISOString().slice(0, 10);
    set((s) => ({
      cards: s.cards.map((card) => {
        if (card.id !== id || card.cardType !== "hydration") return card;
        // Reset count if it's a new day
        const count = card.hydrationDate === today
          ? (card.hydrationCount ?? 0) + 1
          : 1;
        return {
          ...card,
          hydrationCount: count,
          hydrationDate: today,
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  resetDailyHydration: () => {
    const today = new Date().toISOString().slice(0, 10);
    set((s) => ({
      cards: s.cards.map((card) =>
        card.cardType === "hydration" && card.hydrationDate !== today
          ? { ...card, hydrationCount: 0, hydrationDate: today, updatedAt: Date.now() }
          : card
      ),
    }));
  },
}));

// createTauriStore 自动处理：
// 1. 持久化到本地磁盘（状态变化时自动保存）
// 2. 跨窗口状态同步
export const tauriHandler = createTauriStore("cards", useCardStore, {
  autoStart: true,
  saveOnChange: true,
  // 内部字段不参与持久化和跨窗口同步
  filterKeys: ["_zIndexCounter"],
  filterKeysStrategy: "omit",
});

// 向后兼容迁移：在 store 初始化后执行一次
export function migrateCardsIfNeeded() {
  const cards = useCardStore.getState().cards;
  const needsMigration = cards.some(
    (c: any) => !c.cardType || c.checkinDone === undefined || c.lastCheckinDate === undefined
  );
  if (needsMigration) {
    const migrated = cards.map(migrateCard);
    useCardStore.setState({ cards: migrated });
  }
}
