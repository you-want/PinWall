import { useI18n } from "../i18n";

interface FloatingButtonsProps {
  onNewCard: () => void;
  onSettings: () => void;
}

export function FloatingButtons({ onNewCard, onSettings }: FloatingButtonsProps) {
  const { t } = useI18n();
  return (
    <div className="floating-buttons">
      <button
        data-interactive="true"
        className="floating-btn floating-settings-btn"
        onClick={onSettings}
        title={t.floating_settings}
      >
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>⚙️</span>
      </button>
      <button
        data-interactive="true"
        className="floating-btn floating-add-btn"
        onClick={onNewCard}
        title={t.floating_new_card}
      >
        <span style={{ fontSize: '24px', fontWeight: 'bold' }}>+</span>
      </button>
    </div>
  );
}
