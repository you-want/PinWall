import React, { useState } from "react";

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

interface NewCardModalProps {
  x: number;
  y: number;
  onConfirm: (title: string, content: string, colorIndex: number) => void;
  onCancel: () => void;
}

export function NewCardModal({ x, y, onConfirm, onCancel }: NewCardModalProps) {
  const [title, setTitle] = useState("新建便签");
  const [content, setContent] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);

  const handleConfirm = () => {
    const colorIndex = selectedColorIndex ?? Math.floor(Math.random() * 8);
    onConfirm(title || "新建便签", content, colorIndex);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onCancel]);

  const modalStyle: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 400),
    top: Math.min(y, window.innerHeight - 320),
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" style={modalStyle} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <span className="modal-title">新建便签</span>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="card-title">标题</label>
            <input
              id="card-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入标题..."
              className="form-input"
              autoFocus
            />
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>创建</button>
        </div>
      </div>
    </div>
  );
}