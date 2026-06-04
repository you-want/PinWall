import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { webviewWindow } from "@tauri-apps/api";

import { PinBoard } from "../components/PinBoard";
import { NewCardModal } from "../components/NewCardModal";
import { FloatingButtons } from "../components/FloatingButtons";
import type { Settings } from "../types";
import { getSettings } from "../services/storage";
import { useCards } from "../hooks/useCards";
import { useReminders } from "../hooks/useReminders";

type NewCardState =
  | { open: false }
  | { open: true; x: number; y: number };

function Wall() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newCardModal, setNewCardModal] = useState<NewCardState>({ open: false });
  const newCardPositionRef = useRef({ x: 0, y: 0 });

  const {
    cards,
    zIndexMap,
    handlePositionChange,
    handleBringToFront,
    handleToggleCollapse,
    handleCloseCard,
    handleMinimizeCard,
    handleCreateCard,
    handleReminderFired,
  } = useCards();

  useReminders(cards, handleReminderFired);

  const refresh = useCallback(async () => {
    const savedSettings = await getSettings();
    setSettings(savedSettings);
  }, []);

  useEffect(() => {
    refresh();

    let unlisten: (() => void) | null = null;
    listen("settings:changed", () => refresh()).then((fn) => {
      unlisten = fn;
    });

    const handleFocus = () => {
      refresh();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      unlisten?.();
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      if (e.button !== 0) return;
      
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const isBlankArea = !el || !el.closest('[data-interactive]');
      
      if (isBlankArea) {
        await invoke('send_to_background');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const openNewCardModal = useCallback(() => {
    const centerX = window.innerWidth / 2 - 190;
    const centerY = window.innerHeight / 2 - 160;
    newCardPositionRef.current = { x: centerX, y: centerY };
    setNewCardModal({ open: true, x: centerX, y: centerY });
  }, []);

  const openSettingsWindow = useCallback(async () => {
    const settingsWindow = await webviewWindow.WebviewWindow.getByLabel("settings");
    if (settingsWindow !== null) {
      await settingsWindow.show();
      await settingsWindow.setFocus();
    }
  }, []);

  const handleCreateCardShortcut = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n") {
      e.preventDefault();
      openNewCardModal();
    }
  }, [openNewCardModal]);

  useEffect(() => {
    window.addEventListener("keydown", handleCreateCardShortcut);
    return () => window.removeEventListener("keydown", handleCreateCardShortcut);
  }, [handleCreateCardShortcut]);

  const onCreateCard = useCallback((
    title: string,
    content: string,
    colorIndex: number,
    reminderEnabled: boolean,
    reminderTime: number | null
  ) => {
    const pos = newCardPositionRef.current;
    handleCreateCard(title, content, colorIndex, reminderEnabled, reminderTime, pos.x, pos.y);
    setNewCardModal({ open: false });
  }, [handleCreateCard]);

  const handleCancelCreate = useCallback(() => {
    setNewCardModal({ open: false });
  }, []);

  const hasSettings = !!settings;

  return (
    <div className="app-container">
      {!hasSettings && <div className="loading">加载中...</div>}
      
      {hasSettings && (
        <>
          <PinBoard
            cards={cards}
            zIndexMap={zIndexMap}
            onPositionChange={handlePositionChange}
            onBringToFront={handleBringToFront}
            onToggleCollapse={handleToggleCollapse}
            onClose={handleCloseCard}
            onMinimize={handleMinimizeCard}
          />

          {cards.length === 0 && (
            <div className="empty-hint">
              <p>欢迎来到 PinWall</p>
              <p>点击右下角按钮创建便签或打开设置</p>
            </div>
          )}

          <FloatingButtons onNewCard={openNewCardModal} onSettings={openSettingsWindow} />

          {newCardModal.open && (
            <NewCardModal
              x={newCardModal.x}
              y={newCardModal.y}
              onConfirm={onCreateCard}
              onCancel={handleCancelCreate}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Wall;
