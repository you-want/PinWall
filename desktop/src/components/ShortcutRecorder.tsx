import { useState, useEffect, useCallback, useRef } from "react";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  onReset: () => void;
  defaultValue: string;
  t: Record<string, string>;
}

/**
 * Convert Tauri shortcut format to human-readable display.
 * e.g. "CommandOrControl+Shift+Space" -> "⌘⇧Space" (macOS) / "Ctrl+Shift+Space" (other)
 */
function shortcutToDisplay(shortcut: string): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts = shortcut.split("+");
  const result: string[] = [];

  for (const part of parts) {
    const p = part.trim();
    if (p === "CommandOrControl" || p === "CmdOrCtrl") {
      result.push(isMac ? "⌘" : "Ctrl");
    } else if (p === "Command" || p === "Cmd") {
      result.push("⌘");
    } else if (p === "Control" || p === "Ctrl") {
      result.push(isMac ? "⌃" : "Ctrl");
    } else if (p === "Alt" || p === "Option") {
      result.push(isMac ? "⌥" : "Alt");
    } else if (p === "Shift") {
      result.push(isMac ? "⇧" : "Shift");
    } else if (p === "Super" || p === "Meta") {
      result.push(isMac ? "⌘" : "Win");
    } else {
      // Regular key: capitalize first letter
      result.push(p.length === 1 ? p.toUpperCase() : p);
    }
  }

  return isMac ? result.join("") : result.join("+");
}

/**
 * Convert a KeyboardEvent to a Tauri shortcut string.
 */
function eventToShortcut(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  if (isMac ? e.metaKey : e.ctrlKey) {
    modifiers.push("CommandOrControl");
  }
  if (e.shiftKey) modifiers.push("Shift");
  if (e.altKey) modifiers.push("Alt");
  // On Windows/Linux, Ctrl is an extra modifier (not the primary)
  if (!isMac && e.metaKey) modifiers.push("Super");
  if (isMac && e.ctrlKey) modifiers.push("Control");

  // Ignore if no modifier is pressed
  if (modifiers.length === 0) return null;

  // Ignore if the key itself is a modifier
  const modifierKeys = ["Meta", "Shift", "Alt", "Control", "OS"];
  if (modifierKeys.includes(e.key)) return null;

  // Normalize key
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  // Function keys (F1-F24) keep as-is
  else if (/^F\d+$/.test(key)) key = key;
  // Other special keys
  else if (key === "Escape") key = "Escape";
  else if (key === "Enter") key = "Return";
  else if (key === "Backspace") key = "Backspace";
  else if (key === "Delete") key = "Delete";
  else if (key === "Tab") key = "Tab";
  else if (key === "ArrowUp") key = "Up";
  else if (key === "ArrowDown") key = "Down";
  else if (key === "ArrowLeft") key = "Left";
  else if (key === "ArrowRight") key = "Right";
  else key = key;

  modifiers.push(key);
  return modifiers.join("+");
}

export function ShortcutRecorder({
  value,
  onChange,
  onReset,
  defaultValue,
  t,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDefault = value === defaultValue;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        setRecording(false);
        setError(null);
        return;
      }

      const shortcut = eventToShortcut(e);
      if (!shortcut) {
        setError(t.shortcut_need_modifier ?? "需要至少一个修饰键");
        return;
      }

      // Save the shortcut
      onChange(shortcut);
      setRecording(false);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
    [recording, onChange, t]
  );

  useEffect(() => {
    if (recording) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [recording, handleKeyDown]);

  // Stop recording when clicking outside
  useEffect(() => {
    if (!recording) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setRecording(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [recording]);

  return (
    <div className="shortcut-recorder" ref={containerRef}>
      <div className="shortcut-display-row">
        <kbd className={`shortcut-kbd ${recording ? "recording" : ""}`}>
          {recording
            ? (t.shortcut_recording ?? "请按下组合键...")
            : shortcutToDisplay(value)}
        </kbd>

        {!recording && (
          <button
            className="ap-btn shortcut-record-btn"
            onClick={() => {
              setRecording(true);
              setError(null);
            }}
          >
            {t.shortcut_record ?? "录制快捷键"}
          </button>
        )}
      </div>

      {error && <div className="shortcut-error">{error}</div>}

      {saved && (
        <div className="shortcut-saved">{t.shortcut_saved ?? "已保存"}</div>
      )}

      <div className="shortcut-actions">
        {!isDefault && (
          <button
            className="shortcut-reset-btn"
            onClick={onReset}
          >
            {t.shortcut_reset ?? "恢复默认"}
          </button>
        )}
        <span className="shortcut-hint">
          {t.shortcut_hint ?? "提示：按 Esc 取消录制"}
        </span>
      </div>
    </div>
  );
}
