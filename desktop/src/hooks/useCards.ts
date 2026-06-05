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
    
    const initializedCards: PinCardData[] = storedCards && storedCards.length > 0 ? storedCards : [];

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
    saveCardsToStorage(cards);
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
