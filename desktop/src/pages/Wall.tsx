import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { webviewWindow } from "@tauri-apps/api";

import { PinBoard } from "../components/PinBoard";
import { NewCardModal } from "../components/NewCardModal";
import { FloatingButtons } from "../components/FloatingButtons";
import { CardStack } from "../components/CardStack";
import { QuotaCard } from "../components/QuotaCard";
import { useI18n } from "../i18n";
import type { Settings } from "../types";
import { getSettings } from "../services/storage";
import { useCards } from "../hooks/useCards";
import { useReminders } from "../hooks/useReminders";
import { useDailyCard } from "../hooks/useDailyCard";
import { useQuotaMonitor } from "../hooks/useQuotaMonitor";

type NewCardState =
  | { open: false }
  | { open: true; x: number; y: number };

function Wall() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newCardModal, setNewCardModal] = useState<NewCardState>({ open: false });
  const newCardPositionRef = useRef({ x: 0, y: 0 });

  const {
    cards,
    visibleCards,
    stashedCards,
    zIndexMap,
    handlePositionChange,
    handleBringToFront,
    handleToggleCollapse,
    handleCloseCard,
    handleMinimizeCard,
    handleCreateCard,
    handleUnstashCard,
    handleDragEnd,
    handleReminderFired,
  } = useCards();

  useReminders(cards, handleReminderFired);
  useDailyCard();

  const { results: quotaResults, loading: quotaLoading, refresh: quotaRefresh } =
    useQuotaMonitor(settings?.quotaMonitor);

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
    return () => document.removeEventListener('mousedown', handleMouseDown);
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
      {!hasSettings && <div className="loading">{t.loading}</div>}
      
      {hasSettings && (
        <>
          <PinBoard
            cards={visibleCards}
            zIndexMap={zIndexMap}
            onPositionChange={handlePositionChange}
            onBringToFront={handleBringToFront}
            onToggleCollapse={handleToggleCollapse}
            onClose={handleCloseCard}
            onMinimize={handleMinimizeCard}
            onDragEnd={handleDragEnd}
          />

          <CardStack
            stashedCards={stashedCards}
            onUnstash={handleUnstashCard}
          />

          {cards.length === 0 && (
            <div className="empty-hint">
              <p className="hint-title">{t.welcome_title}</p>
              <p className="hint-subtitle">{t.welcome_subtitle}</p>
            </div>
          )}

          <FloatingButtons onNewCard={openNewCardModal} onSettings={openSettingsWindow} />

          {settings?.quotaMonitor?.enabled && settings.quotaMonitor.models.length > 0 && (
            <QuotaCard
              results={quotaResults}
              models={settings.quotaMonitor.models}
              loading={quotaLoading}
              onRefresh={quotaRefresh}
            />
          )}

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
