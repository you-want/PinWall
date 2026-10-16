import React, { useState, useCallback, useRef } from "react";
import { useI18n, interpolate } from "../i18n";
import { useLanguageStore } from "../stores/languageStore";
import { getSettings } from "../services/storage";
import { generateNoteContent } from "../services/aiService";
import type { CardType, PinCardData } from "../types";

const colors = [
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
  "linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)",
  "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
  "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
];

function formatCurrentTime(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface NewCardModalProps {
  x: number;
  y: number;
  onConfirm: (
    title: string,
    content: string,
    colorIndex: number,
    cardType: CardType,
    reminderEnabled: boolean,
    reminderTime: number | null
  ) => void;
  onCancel: () => void;
  initialCard?: PinCardData;
}

export function NewCardModal({ x: _x, y: _y, onConfirm, onCancel, initialCard }: NewCardModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initialCard?.title ?? t.new_card);
  const [content, setContent] = useState(initialCard?.content ?? "");
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(initialCard?.colorIndex ?? null);
  const modalRef = useRef<HTMLDivElement>(null);
  const initialReminder = initialCard?.reminderTime != null ? new Date(initialCard.reminderTime) : null;
  const initialDate = initialReminder ? localDate(initialReminder) : "";
  const initialTime = initialReminder ? localTime(initialReminder) : "";

  const [isCreating, setIsCreating] = useState(false);
  const [cardType, setCardType] = useState<CardType>(initialCard?.cardType ?? "note");
  const [reminderDate, setReminderDate] = useState(initialDate);
  const [reminderTimeValue, setReminderTimeValue] = useState(initialTime);
  const [reminderActive, setReminderActive] = useState(initialCard?.reminderEnabled ?? true);
  const [validationError, setValidationError] = useState("");
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiError, setAiError] = useState<string>("");

  // Set default reminder time to current time + 5 minutes
  React.useEffect(() => {
    if (!initialCard && cardType === "reminder" && !reminderDate) {
      const now = new Date(Date.now() + 5 * 60 * 1000);
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setReminderDate(`${y}-${m}-${d}`);
      const h = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setReminderTimeValue(`${h}:${min}`);
    }
  }, [cardType, initialCard, reminderDate]);

  // Set default time for daily-checkin
  React.useEffect(() => {
    if (!initialCard && cardType === "daily-checkin" && !reminderTimeValue) {
      const now = new Date(Date.now() + 5 * 60 * 1000);
      const h = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setReminderTimeValue(`${h}:${min}`);
    }
  }, [cardType, initialCard, reminderTimeValue]);

  const handleConfirm = () => {
    if (isCreating) return;
    setValidationError("");
    setIsCreating(true);
    try {
      const colorIndex = selectedColorIndex ?? Math.floor(Math.random() * 8);
      let reminderEnabled = false;
      let reminderTs: number | null = null;

      const unchangedReminder = initialCard &&
        reminderActive === initialCard.reminderEnabled &&
        reminderDate === initialDate && reminderTimeValue === initialTime;

      if (unchangedReminder) {
        // Preserve seconds and already-fired schedules when only content is edited.
        reminderEnabled = initialCard.reminderEnabled;
        reminderTs = initialCard.reminderTime;
      } else if (cardType === "reminder" && reminderActive) {
        if (reminderDate && reminderTimeValue) {
          reminderTs = new Date(`${reminderDate}T${reminderTimeValue}`).getTime();
          if (!isNaN(reminderTs) && reminderTs > Date.now()) {
            reminderEnabled = true;
          } else {
            setValidationError(t.reminder_invalid);
            return;
          }
        } else {
          setValidationError(t.reminder_invalid);
          return;
        }
      } else if (cardType === "daily-checkin" && reminderActive) {
        // daily-checkin: use today's date + selected time, always enabled
        if (reminderTimeValue) {
          const today = localDate(new Date());
          reminderTs = new Date(`${today}T${reminderTimeValue}`).getTime();
          if (!isNaN(reminderTs)) {
            reminderEnabled = true;
            // If time already passed today, set to tomorrow
            if (reminderTs <= Date.now()) {
              const tomorrow = new Date(reminderTs);
              tomorrow.setDate(tomorrow.getDate() + 1);
              reminderTs = tomorrow.getTime();
            }
          } else {
            setValidationError(t.reminder_invalid);
            return;
          }
        } else {
          setValidationError(t.reminder_invalid);
          return;
        }
      }

      onConfirm(title.trim() || t.new_card, content, colorIndex, cardType, reminderEnabled, reminderTs);
    } catch (err) {
      console.error("[NewCardModal] Error in handleConfirm:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const handleUseCurrentTime = useCallback(() => {
    setTitle(formatCurrentTime());
  }, []);

  const handleAIGenerate = useCallback(async () => {
    if (isAIGenerating || isCreating) return;
    const keyword = title.trim() || content.trim();
    if (!keyword) return;
    setIsAIGenerating(true);
    setAiError("");
    try {
      const settings = await getSettings();
      if (!settings.ai?.enabled || !settings.ai.apiKey) {
        setAiError(t.ai_not_configured);
        return;
      }
      const lang = useLanguageStore.getState().lang;
      const generated = await generateNoteContent(settings.ai, keyword, lang);
      setContent(generated);
    } catch (err) {
      console.error("[NewCardModal] AI generate error:", err);
      setAiError(t.ai_error);
    } finally {
      setIsAIGenerating(false);
    }
  }, [isAIGenerating, isCreating, title, content]);

  React.useEffect(() => {
    const previouslyFocused = document.activeElement;
    modalRef.current?.querySelector<HTMLInputElement>("#card-title")?.focus();
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [onCancel]);



  const cardTypes: { value: CardType; label: string; icon: string }[] = [
    { value: "note", label: t.card_type_note, icon: "📝" },
    { value: "reminder", label: t.card_type_reminder, icon: "⏰" },
    { value: "daily-checkin", label: t.card_type_daily_checkin, icon: "✅" },
    { value: "hydration", label: t.card_type_hydration, icon: "💧" },
  ];

  const previewColor = selectedColorIndex !== null ? colors[selectedColorIndex] : null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div data-interactive="true" className="modal-overlay-v2" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="modal-v2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="modal-v2-header">
          <h3 className="modal-v2-title" id="card-dialog-title">{initialCard ? t.edit_card : t.new_card}</h3>
          <button className="modal-v2-close" type="button" onClick={onCancel} aria-label={t.aria_close}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Card Type Tabs */}
        {!initialCard && <div className="modal-v2-type-tabs">
          {cardTypes.map((ct) => (
            <button
              key={ct.value}
              type="button"
              className={`type-tab ${cardType === ct.value ? "active" : ""}`}
              onClick={() => setCardType(ct.value)}
            >
              <span className="type-tab-icon">{ct.icon}</span>
              <span className="type-tab-label">{ct.label}</span>
            </button>
          ))}
        </div>}

        {/* Body */}
        <div className="modal-v2-body">
          {/* Title */}
          <div className="field-v2">
            <label htmlFor="card-title" className="field-v2-label">{t.title_label}</label>
            <div className="field-v2-row">
              <input
                id="card-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder={t.title_placeholder}
                className="input-v2"
              />
              <button
                type="button"
                className="icon-btn-v2"
                onClick={handleUseCurrentTime}
                title={t.use_current_time}
              >
                🕐
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="field-v2">
            <label htmlFor="card-content" className="field-v2-label">{t.content_label}</label>
            <textarea
              id="card-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.content_placeholder}
              className="textarea-v2"
              rows={4}
            />
            <div className="content-toolbar">
              <button
                type="button"
                className="ai-btn-v2"
                onClick={handleAIGenerate}
                disabled={isAIGenerating || isCreating || (!title.trim() && !content.trim())}
                title={t.ai_generate}
              >
                {isAIGenerating ? (
                  <span className="ai-btn-content">
                    <span className="ai-btn-spinner" />
                    {t.ai_generating}
                  </span>
                ) : (
                  <span>✨ {t.ai_generate}</span>
                )}
              </button>
              {aiError && (
                <span className="ai-error-inline">{aiError}</span>
              )}
            </div>
          </div>

          {/* Reminder / Checkin time (only show when relevant) */}
          {initialCard && (cardType === "reminder" || cardType === "daily-checkin") && (
            <label className="field-v2-label reminder-toggle">
              <input type="checkbox" checked={reminderActive} onChange={(e) => setReminderActive(e.target.checked)} />
              {t.reminder_enabled}
            </label>
          )}

          {cardType === "reminder" && reminderActive && (
            <div className="field-v2">
              <label className="field-v2-label">{t.reminder_label}</label>
              <div className="time-row-v2">
                <input
                  type="date"
                  aria-label={t.reminder_date}
                  className="input-v2 time-input-v2"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
                <input
                  type="time"
                  aria-label={t.checkin_time_label}
                  className="input-v2 time-input-v2"
                  value={reminderTimeValue}
                  onChange={(e) => setReminderTimeValue(e.target.value)}
                />
              </div>
            </div>
          )}

          {cardType === "daily-checkin" && reminderActive && (
            <div className="field-v2">
              <label className="field-v2-label">{t.checkin_time_label}</label>
              <div className="time-row-v2">
                <input
                  type="time"
                  aria-label={t.checkin_time_label}
                  className="input-v2 time-input-v2"
                  value={reminderTimeValue}
                  onChange={(e) => setReminderTimeValue(e.target.value)}
                />
              </div>
            </div>
          )}
          {validationError && <p className="ai-error-inline" role="alert">{validationError}</p>}
        </div>

        {/* Footer: Color + Actions */}
        <div className="modal-v2-footer">
          <div className="footer-left">
            <span className="color-label-v2">{t.color_label}</span>
            <div className="color-strip-v2">
              {colors.map((color, index) => (
                <button
                  key={index}
                  className={`color-dot-v2 ${selectedColorIndex === index ? "active" : ""}`}
                  style={{ background: color }}
                  onClick={() => setSelectedColorIndex(index)}
                  title={interpolate(t.color_n, { n: index + 1 })}
                />
              ))}
            </div>
            {selectedColorIndex === null && (
              <span className="color-hint-v2">{t.color_random_hint}</span>
            )}
          </div>
          <div className="footer-actions">
            <button className="btn-v2 btn-v2-cancel" onClick={onCancel} disabled={isCreating}>{t.btn_cancel}</button>
            <button
              className={`btn-v2 btn-v2-primary ${isCreating ? "btn-v2-loading" : ""}`}
              onClick={handleConfirm}
              disabled={isCreating}
              style={previewColor ? { background: previewColor, color: "rgba(0,0,0,0.75)" } : undefined}
            >
              {isCreating ? (
                <span className="btn-v2-loading-content">
                  <span className="btn-v2-spinner" />
                  {t.btn_creating}
                </span>
              ) : initialCard ? t.btn_save : t.btn_create}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
