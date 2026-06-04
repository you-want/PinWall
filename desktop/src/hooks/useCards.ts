import { useState, useCallback, useRef, useEffect } from "react";
import type { PinCardData } from "../types";

const STORAGE_KEY = "pinwall_cards";

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

export function useCards() {
  const [cards, setCards] = useState<PinCardData[]>([]);
  const [zIndexMap, setZIndexMap] = useState<Record<string, number>>({});
  const zIndexCounter = useRef(100);

  const loadCardsFromStorage = useCallback((): PinCardData[] | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PinCardData[];
        if (parsed.length > 0) {
          return parsed.map((c) => ({
            ...c,
            reminderEnabled: c.reminderEnabled ?? false,
            reminderTime: c.reminderTime ?? null,
            reminderFired: c.reminderFired ?? false,
          }));
        }
      }
    } catch (e) {
      console.error("Failed to load cards from storage:", e);
    }
    return null;
  }, []);

  const saveCardsToStorage = useCallback((cards: PinCardData[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch (e) {
      console.error("Failed to save cards to storage:", e);
    }
  }, []);

  const initializeCards = useCallback(() => {
    const storedCards = loadCardsFromStorage();
    
    let initializedCards: PinCardData[];
    
    if (storedCards && storedCards.length > 0) {
      initializedCards = storedCards;
    } else {
      const cols = 5;
      const cardWidth = 220;
      const cardHeight = 140;
      const gapX = 30;
      const gapY = 30;
      const startX = 40;
      const startY = 40;

      const defaultCards: Omit<PinCardData, "x" | "y">[] = [
        { id: "1", title: "温馨提示", content: "保持好心情", collapsed: false, colorIndex: 0, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "2", title: "健康提醒", content: "多喝水哦", collapsed: false, colorIndex: 1, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "3", title: "工作建议", content: "今天辛苦啦", collapsed: false, colorIndex: 2, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "4", title: "作息提醒", content: "早点休息", collapsed: false, colorIndex: 3, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "5", title: "饮食建议", content: "记得吃水果", collapsed: false, colorIndex: 4, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "6", title: "励志语录", content: "加油，你可以的", collapsed: false, colorIndex: 5, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "7", title: "祝福寄语", content: "祝你顺利", collapsed: false, colorIndex: 6, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "8", title: "心情提示", content: "保持微笑呀", collapsed: false, colorIndex: 7, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "9", title: "愿望清单", content: "愿所有烦恼都消失", collapsed: false, colorIndex: 0, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
        { id: "10", title: "友情提醒", content: "期待下一次见面", collapsed: false, colorIndex: 1, createdAt: Date.now(), updatedAt: Date.now(), reminderEnabled: false, reminderTime: null, reminderFired: false },
      ];

      initializedCards = defaultCards.map((card, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const now = Date.now();
        return {
          ...card,
          x: startX + col * (cardWidth + gapX),
          y: startY + row * (cardHeight + gapY),
          createdAt: now,
          updatedAt: now,
        };
      });
    }

    setCards(initializedCards);
    saveCardsToStorage(initializedCards);

    const initialZIndex: Record<string, number> = {};
    initializedCards.forEach((card, index) => {
      initialZIndex[card.id] = 100 + index;
    });
    setZIndexMap(initialZIndex);
  }, [loadCardsFromStorage, saveCardsToStorage]);

  useEffect(() => {
    initializeCards();
  }, [initializeCards]);

  useEffect(() => {
    if (cards.length > 0) {
      saveCardsToStorage(cards);
    }
  }, [cards, saveCardsToStorage]);

  const handlePositionChange = useCallback((id: string, x: number, y: number) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, x, y, updatedAt: Date.now() } : card
      )
    );
  }, []);

  const handleBringToFront = useCallback((id: string) => {
    zIndexCounter.current += 1;
    setZIndexMap((prev) => ({
      ...prev,
      [id]: zIndexCounter.current,
    }));
  }, []);

  const handleToggleCollapse = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, collapsed: !card.collapsed, updatedAt: Date.now() } : card
      )
    );
  }, []);

  const handleCloseCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleMinimizeCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleCreateCard = useCallback((
    title: string,
    content: string,
    colorIndex: number,
    reminderEnabled: boolean,
    reminderTime: number | null,
    x: number,
    y: number
  ) => {
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

    setCards((prev) => [...prev, newCard]);
    zIndexCounter.current += 1;
    setZIndexMap((prev) => ({
      ...prev,
      [newCard.id]: zIndexCounter.current,
    }));
  }, []);

  const updateCardReminder = useCallback((id: string, reminderEnabled: boolean, reminderTime: number | null) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, reminderEnabled, reminderTime, reminderFired: false, updatedAt: Date.now() } : card
      )
    );
  }, []);

  const handleReminderFired = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, reminderFired: true, updatedAt: Date.now() } : card
      )
    );
  }, []);

  return {
    cards,
    zIndexMap,
    handlePositionChange,
    handleBringToFront,
    handleToggleCollapse,
    handleCloseCard,
    handleMinimizeCard,
    handleCreateCard,
    updateCardReminder,
    handleReminderFired,
  };
}
