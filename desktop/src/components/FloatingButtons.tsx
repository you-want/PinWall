interface FloatingButtonsProps {
  onNewCard: () => void;
  onSettings: () => void;
}

export function FloatingButtons({ onNewCard, onSettings }: FloatingButtonsProps) {
  return (
    <div className="floating-buttons">
      <button
        data-interactive="true"
        className="floating-btn floating-settings-btn"
        onClick={onSettings}
        title="设置"
      >
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>⚙️</span>
      </button>
      <button
        data-interactive="true"
        className="floating-btn floating-add-btn"
        onClick={onNewCard}
        title="新建卡片 (⌘⇧N)"
      >
        <span style={{ fontSize: '24px', fontWeight: 'bold' }}>+</span>
      </button>
    </div>
  );
}