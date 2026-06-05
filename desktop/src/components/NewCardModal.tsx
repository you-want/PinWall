import React, { useState, useCallback } from "react";

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

interface NewCardModalProps {
  x: number;
  y: number;
  onConfirm: (
    title: string,
    content: string,
    colorIndex: number,
    reminderEnabled: boolean,
    reminderTime: number | null
  ) => void;
  onCancel: () => void;
}

export function NewCardModal({ x, y, onConfirm, onCancel }: NewCardModalProps) {
  const [title, setTitle] = useState("新建便签");
  const [content, setContent] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDate, setReminderDate] = useState<string>("");
  const [reminderTimeValue, setReminderTimeValue] = useState<string>("");

  // Set default reminder time to current time + 5 minutes
  React.useEffect(() => {
    if (reminderEnabled && !reminderDate) {
      const now = new Date(Date.now() + 5 * 60 * 1000);
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setReminderDate(`${y}-${m}-${d}`);
      const h = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setReminderTimeValue(`${h}:${min}`);
    }
  }, [reminderEnabled]);

  const handleConfirm = () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const colorIndex = selectedColorIndex ?? Math.floor(Math.random() * 8);
      let reminderTs: number | null = null;
      if (reminderEnabled && reminderDate && reminderTimeValue) {
        reminderTs = new Date(`${reminderDate}T${reminderTimeValue}`).getTime();
        if (isNaN(reminderTs) || reminderTs <= Date.now()) {
          reminderTs = null;
        }
      }
      const finalReminderEnabled = reminderEnabled && reminderTs !== null;
      onConfirm(title || "新建便签", content, colorIndex, finalReminderEnabled, reminderTs);
    } catch (err) {
      console.error("[NewCardModal] Error in handleConfirm:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleUseCurrentTime = useCallback(() => {
    setTitle(formatCurrentTime());
  }, []);

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onCancel]);

  const handleControlClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const target = e.target as HTMLElement;
      const control = target.closest(".control");

      if (control?.classList.contains("close")) {
        onCancel();
      } else if (control?.classList.contains("minimize")) {
        setIsFullscreen(false);
        setIsMinimized(false);
      } else if (control?.classList.contains("collapse")) {
        setIsMinimized(false);
        setIsFullscreen(true);
      }
    },
    [onCancel]
  );

  const modalStyle: React.CSSProperties = isFullscreen
    ? { left: 0, top: 0, width: "100%", height: "100%", borderRadius: 0 }
    : isMinimized
    ? { left: Math.min(x, window.innerWidth - 400), top: Math.min(y, window.innerHeight - 60) }
    : { left: Math.min(x, window.innerWidth - 400), top: Math.min(y, window.innerHeight - 320) };

  return (
    <div data-interactive="true" className="modal-overlay" onClick={onCancel}>
      <div
        className={`modal-content ${isFullscreen ? "fullscreen" : ""} ${isMinimized ? "minimized" : ""}`}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header" onClick={handleControlClick}>
          <div className="window-controls">
            <button className="control close" type="button" aria-label="关闭" />
            <button
              className={`control minimize ${isFullscreen || isMinimized ? "" : "disabled"}`}
              type="button"
              aria-label="恢复"
              disabled={!isFullscreen && !isMinimized}
            />
            <button
              className={`control collapse ${isFullscreen ? "disabled" : ""}`}
              type="button"
              aria-label="全屏"
              disabled={isFullscreen}
            />
          </div>
          <span className="modal-title">新建便签</span>
          <div style={{ width: 60 }} />
        </div>

        {!isMinimized && (
          <>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="card-title">标题</label>
                <div className="title-input-row">
                  <input
                    id="card-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入标题..."
                    className="form-input"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-time"
                    onClick={handleUseCurrentTime}
                    title="使用当前时间作为标题"
                  >
                    🕐
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="card-content">内容</label>
                <textarea
                  id="card-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入内容..."
                  className="form-textarea"
                />
              </div>

              <div className="form-group">
                <label>颜色</label>
                <div className="color-picker">
                  {colors.map((color, index) => (
                    <button
                      key={index}
                      className={`color-option ${selectedColorIndex === index ? "selected" : ""}`}
                      style={{ background: color }}
                      onClick={() => setSelectedColorIndex(index)}
                      title={`颜色 ${index + 1}`}
                    />
                  ))}
                </div>
                {selectedColorIndex === null && (
                  <span className="color-hint">未选择颜色，将随机分配</span>
                )}
              </div>

              <div className="form-group">
                <label className="reminder-toggle-label">
                  <span>提醒</span>
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                  />
                </label>
                {reminderEnabled && (
                  <div className="reminder-time-row">
                    <input
                      type="date"
                      className="form-input reminder-date-input"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="form-input reminder-time-value-input"
                      value={reminderTimeValue}
                      onChange={(e) => setReminderTimeValue(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onCancel} disabled={isCreating}>取消</button>
              <button
                className={`btn btn-primary ${isCreating ? "btn-loading" : ""}`}
                onClick={handleConfirm}
                disabled={isCreating}
              >
                {isCreating ? (
                  <span className="btn-loading-content">
                    <span className="btn-spinner" />
                    创建中...
                  </span>
                ) : "创建"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
