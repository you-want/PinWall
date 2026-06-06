import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import type { PinCardData } from "../types";

const messages = [
  "保持好心情",
  "多喝水哦",
  "今天辛苦啦",
  "早点休息",
  "记得吃水果",
  "加油，你可以的",
  "祝你顺利",
  "保持微笑呀",
  "愿所有烦恼都消失",
  "期待下一次见面",
  "梦想总会实现",
  "天气冷了，多穿衣服",
  "记得给自己放松",
  "每天都要元气满满",
  "今天也要好好爱自己",
  "适当休息一下",
];

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
    reminderEnabled: boolean,
    reminderTime: number | null,
    x: number,
    y: number
  ) => void;
  updateReminder: (id: string, reminderEnabled: boolean, reminderTime: number | null) => void;
  reminderFired: (id: string) => void;
  unstashCard: (id: string) => void;
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

  createCard: (title, content, colorIndex, reminderEnabled, reminderTime, x, y) => {
    const now = Date.now();
    const newCard: PinCardData = {
      id: `card-${now}`,
      title,
      content: content || messages[Math.floor(Math.random() * messages.length)],
      x: x + 190 - 110,
      y: y + 160 - 70,
      collapsed: false,
      colorIndex,
      createdAt: now,
      updatedAt: now,
      reminderEnabled,
      reminderTime,
      reminderFired: false,
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

  reminderFired: (id) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, reminderFired: true, updatedAt: Date.now() } : card
      ),
    }));
  },

  unstashCard: (id) => {
    set((s) => ({
      cards: s.cards.map((card) =>
        card.id === id ? { ...card, updatedAt: Date.now() } : card
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
