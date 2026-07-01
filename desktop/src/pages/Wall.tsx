import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { webviewWindow } from "@tauri-apps/api";

import { PinBoard } from "../components/PinBoard";
import { NewCardModal } from "../components/NewCardModal";
import { FloatingButtons } from "../components/FloatingButtons";
import { CardStack } from "../components/CardStack";
import { QuotaCard } from "../components/QuotaCard";
import { WeatherCard } from "../components/WeatherCard";
import { BreathingGuide } from "../components/BreathingGuide";
import { WidgetManager } from "../components/WidgetManager";
import { useI18n } from "../i18n";
import type { Settings } from "../types";
import { getSettings } from "../services/storage";
import { loadInstalledWidgets } from "../services/widgetLoader";
import { syncLaunchOnStartupSetting } from "../services/autostart";
import { useCards } from "../hooks/useCards";
import { useReminders } from "../hooks/useReminders";
import { useDailyReset } from "../hooks/useDailyReset";
import { useDailyCard } from "../hooks/useDailyCard";
import { useHolidayCard } from "../hooks/useHolidayCard";
import { useQuotaMonitor } from "../hooks/useQuotaMonitor";
import { useHydrationReminder } from "../hooks/useHydrationReminder";
import { useRestReminder } from "../hooks/useRestReminder";
import { useOffWorkReminder } from "../hooks/useOffWorkReminder";
import { useEyeCareReminder } from "../hooks/useEyeCareReminder";
import { useMoodCheckin } from "../hooks/useMoodCheckin";
import { useDesktopClickThrough } from "../hooks/useDesktopClickThrough";
import type { CardType } from "../types";
import { useWidgetStore } from "../stores/widgetStore";

type NewCardState =
  | { open: false }
  | { open: true; x: number; y: number };

function Wall() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const hasSettings = !!settings;
  const [newCardModal, setNewCardModal] = useState<NewCardState>({ open: false });
  const [showBreathing, setShowBreathing] = useState(false);
  const newCardPositionRef = useRef({ x: 0, y: 0 });
  const widgets = useWidgetStore((state) => state.widgets);
  const syncWidgets = useWidgetStore((state) => state.syncWidgets);

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
    handleArrangeCards,
    handleReminderFired,
  } = useCards();

  useReminders(cards, handleReminderFired);
  useDailyReset();
  useDailyCard();
  useHolidayCard();
  // ── Care / Companion hooks ──
  useHydrationReminder();
  useRestReminder();
  useOffWorkReminder();
  useEyeCareReminder();
  useMoodCheckin();
  useDesktopClickThrough(hasSettings);

  const { results: quotaResults, loading: quotaLoading, refresh: quotaRefresh } =
    useQuotaMonitor(settings?.quotaMonitor);

  const refresh = useCallback(async () => {
    const savedSettings = await getSettings();
    setSettings(savedSettings);
  }, []);

  useEffect(() => {
    syncLaunchOnStartupSetting()
      .then(setSettings)
      .catch(() => refresh());

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
    loadInstalledWidgets().then((manifests) => {
      if (manifests.length > 0) {
        syncWidgets(manifests);
      }
    });
  }, [syncWidgets]);

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
    // Breathing guide shortcut: Cmd+Shift+B
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "b") {
      e.preventDefault();
      setShowBreathing(true);
    }
    // Arrange cards shortcut: Cmd+Shift+A
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "a") {
      e.preventDefault();
      handleArrangeCards();
    }
  }, [openNewCardModal, handleArrangeCards]);

  useEffect(() => {
    window.addEventListener("keydown", handleCreateCardShortcut);
    return () => window.removeEventListener("keydown", handleCreateCardShortcut);
  }, [handleCreateCardShortcut]);

  const onCreateCard = useCallback((
    title: string,
    content: string,
    colorIndex: number,
    cardType: CardType,
    reminderEnabled: boolean,
    reminderTime: number | null
  ) => {
    const pos = newCardPositionRef.current;
    handleCreateCard(title, content, colorIndex, cardType, reminderEnabled, reminderTime, pos.x, pos.y);
    setNewCardModal({ open: false });
  }, [handleCreateCard]);

  const handleCancelCreate = useCallback(() => {
    setNewCardModal({ open: false });
  }, []);

  const quotaConfig = settings?.quotaMonitor;
  const showQuotaCard = !!(quotaConfig?.enabled && quotaConfig.models.length > 0);
  const showWeatherCard = !!settings?.weatherCareEnabled;
  const hasEnabledWidgets = widgets.some((widget) => widget.enabled);

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

          <FloatingButtons onNewCard={openNewCardModal} onSettings={openSettingsWindow} onArrange={handleArrangeCards} />

          {(showQuotaCard || showWeatherCard || hasEnabledWidgets) && (
            <aside className="wall-side-panel" data-testid="wall-side-panel">
              {showQuotaCard && (
                <QuotaCard
                  results={quotaResults}
                  models={quotaConfig.models}
                  loading={quotaLoading}
                  onRefresh={quotaRefresh}
                />
              )}

              {showWeatherCard && (
                <WeatherCard settings={settings} />
              )}

              <WidgetManager variant="side-panel" />
            </aside>
          )}

          {newCardModal.open && (
            <NewCardModal
              x={newCardModal.x}
              y={newCardModal.y}
              onConfirm={onCreateCard}
              onCancel={handleCancelCreate}
            />
          )}

          {showBreathing && (
            <BreathingGuide onClose={() => setShowBreathing(false)} />
          )}
        </>
      )}
    </div>
  );
}

export default Wall;
