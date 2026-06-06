import { useEffect } from "react";
import { webviewWindow } from "@tauri-apps/api";

function Settings() {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await webviewWindow.getCurrentWebviewWindow().close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="settings-page">
      <div className="settings-coming-soon">
        <div className="settings-coming-body">
          <div className="settings-coming-icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
              <path
                d="M40 22v20l12 8"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M52.5 52.5L58 58"
                stroke="rgba(74,144,217,0.8)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="40" cy="40" r="4" fill="rgba(74,144,217,0.6)" />
            </svg>
          </div>

          <h1 className="settings-coming-title">正在开发中</h1>
          <p className="settings-coming-subtitle">敬请期待</p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
