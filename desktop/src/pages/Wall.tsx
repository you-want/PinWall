import React from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PinCard } from "../components/PinCard";
import { NewCardModal } from "../components/NewCardModal";
import { FloatingAddButton } from "../components/FloatingAddButton";
import type { Settings, PinCardData } from "../types";
import { getSettings } from "../services/storage";

type ContextMenuState =
  | { open: false }
  | { open: true; x: number; y: number };

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

const initialCards: Omit<PinCardData, "x" | "y">[] = [
  { id: "1", title: "温馨提示", content: "保持好心情", collapsed: false, colorIndex: 0, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "2", title: "健康提醒", content: "多喝水哦", collapsed: false, colorIndex: 1, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "3", title: "工作建议", content: "今天辛苦啦", collapsed: false, colorIndex: 2, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "4", title: "作息提醒", content: "早点休息", collapsed: false, colorIndex: 3, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "5", title: "饮食建议", content: "记得吃水果", collapsed: false, colorIndex: 4, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "6", title: "励志语录", content: "加油，你可以的", collapsed: false, colorIndex: 5, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "7", title: "祝福寄语", content: "祝你顺利", collapsed: false, colorIndex: 6, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "8", title: "心情提示", content: "保持微笑呀", collapsed: false, colorIndex: 7, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "9", title: "愿望清单", content: "愿所有烦恼都消失", collapsed: false, colorIndex: 0, createdAt: Date.now(), updatedAt: Date.now() },
  { id: "10", title: "友情提醒", content: "期待下一次见面", collapsed: false, colorIndex: 1, createdAt: Date.now(), updatedAt: Date.now() },
];

type NewCardState =
  | { open: false }
  | { open: true; x: number; y: number };

function Wall() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>({ open: false });
  const [newCardModal, setNewCardModal] = React.useState<NewCardState>({ open: false });
  const [cards, setCards] = React.useState<PinCardData[]>([]);
  const [zIndexMap, setZIndexMap] = React.useState<Record<string, number>>({});
  const zIndexCounter = React.useRef(100);
  const newCardPositionRef = React.useRef({ x: 0, y: 0 });

  const loadCardsFromStorage = React.useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PinCardData[];
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load cards from storage:", e);
    }
    return null;
  }, []);

  const saveCardsToStorage = React.useCallback((cards: PinCardData[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch (e) {
      console.error("Failed to save cards to storage:", e);
    }
  }, []);

  const initializeCards = React.useCallback(() => {
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

      initializedCards = initialCards.map((card, index) => {
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

  const refresh = React.useCallback(async () => {
    const savedSettings = await getSettings();
    setSettings(savedSettings);
  }, []);

  React.useEffect(() => {
    refresh();
    initializeCards();
  }, [refresh, initializeCards]);

  React.useEffect(() => {
    if (cards.length > 0) {
      saveCardsToStorage(cards);
    }
  }, [cards, saveCardsToStorage]);

  React.useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("settings:changed", () => refresh()).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  React.useEffect(() => {
    const handleFocus = () => {
      refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  // Click on blank area: send window to background
  React.useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      // Only handle left click
      if (e.button !== 0) return;
      
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const isBlankArea = !el || !el.closest('[data-interactive]');
      
      if (isBlankArea) {
        // Use Rust command to properly update state and send to background
        await invoke('send_to_background');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu({ open: false });
  }, []);

  React.useEffect(() => {
    if (!contextMenu.open) return;

    const handlePointerDown = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenu, contextMenu.open]);

  const openSettingsWindow = React.useCallback(async () => {
    closeContextMenu();
    const settingsWindow = await WebviewWindow.getByLabel("settings");
    if (settingsWindow !== null) {
      await settingsWindow.show();
      await settingsWindow.setFocus();
      return;
    }
  }, [closeContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY });
  };

  const handlePositionChange = React.useCallback((id: string, x: number, y: number) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, x, y, updatedAt: Date.now() } : card
      )
    );
  }, []);

  const handleBringToFront = React.useCallback((id: string) => {
    zIndexCounter.current += 1;
    setZIndexMap((prev) => ({
      ...prev,
      [id]: zIndexCounter.current,
    }));
  }, []);

  const handleToggleCollapse = React.useCallback((id: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, collapsed: !card.collapsed, updatedAt: Date.now() } : card
      )
    );
  }, []);

  const handleCloseCard = React.useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleMinimizeCard = React.useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const openNewCardFromMenu = React.useCallback(() => {
    closeContextMenu();
    const centerX = window.innerWidth / 2 - 190;
    const centerY = window.innerHeight / 2 - 160;
    newCardPositionRef.current = { x: centerX, y: centerY };
    setNewCardModal({ open: true, x: centerX, y: centerY });
  }, [closeContextMenu]);

  const handleCreateCardShortcut = React.useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n") {
      e.preventDefault();
      const centerX = window.innerWidth / 2 - 190;
      const centerY = window.innerHeight / 2 - 160;
      
      newCardPositionRef.current = { x: centerX, y: centerY };
      
      setNewCardModal({
        open: true,
        x: centerX,
        y: centerY,
      });
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener("keydown", handleCreateCardShortcut);
    return () => window.removeEventListener("keydown", handleCreateCardShortcut);
  }, [handleCreateCardShortcut]);

  const handleCreateCard = React.useCallback((title: string, content: string, colorIndex: number) => {
    const now = Date.now();
    const pos = newCardPositionRef.current;
    const newCard: PinCardData = {
      id: `card-${now}`,
      title,
      content: content || messages[Math.floor(Math.random() * messages.length)],
      x: pos.x + 190 - 110,
      y: pos.y + 160 - 70,
      collapsed: false,
      colorIndex,
      createdAt: now,
      updatedAt: now,
    };

    setCards((prev) => [...prev, newCard]);
    zIndexCounter.current += 1;
    setZIndexMap((prev) => ({
      ...prev,
      [newCard.id]: zIndexCounter.current,
    }));
    setNewCardModal({ open: false });
  }, []);

  const handleCancelCreate = React.useCallback(() => {
    setNewCardModal({ open: false });
  }, []);

  if (!settings) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div
      className="app-container"
    >
      <div className="pin-board" onContextMenu={handleContextMenu}>
        {cards.map((card) => (
          <PinCard
            key={card.id}
            card={card}
            onPositionChange={handlePositionChange}
            onBringToFront={handleBringToFront}
            onToggleCollapse={handleToggleCollapse}
            onClose={handleCloseCard}
            onMinimize={handleMinimizeCard}
            zIndex={zIndexMap[card.id] || 100}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {cards.length === 0 && (
        <div className="empty-hint">
          <p>点击右下角 + 创建卡片</p>
          <p className="hint-subtitle">右键空白处查看更多操作</p>
        </div>
      )}

      <FloatingAddButton onClick={() => {
        const centerX = window.innerWidth / 2 - 190;
        const centerY = window.innerHeight / 2 - 160;
        newCardPositionRef.current = { x: centerX, y: centerY };
        setNewCardModal({ open: true, x: centerX, y: centerY });
      }} />

      {contextMenu.open && (
        <div data-interactive="true" className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="menu-item" onClick={openNewCardFromMenu}>
            <span className="menu-label">新建卡片</span>
            <span className="menu-shortcut">⌘⇧N</span>
          </button>
          <div className="menu-divider" />
          <button className="menu-item" onClick={openSettingsWindow}>
            <span className="menu-label">设置</span>
          </button>
        </div>
      )}

      {newCardModal.open && (
        <NewCardModal
          x={newCardModal.x}
          y={newCardModal.y}
          onConfirm={handleCreateCard}
          onCancel={handleCancelCreate}
        />
      )}
    </div>
  );
}

export default Wall;
