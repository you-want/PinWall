import { useState, useEffect } from "react";
import { webviewWindow } from "@tauri-apps/api";

import Wall from "./pages/Wall";
import Settings from "./pages/Settings";
import Notification from "./pages/Notification";
import { useI18n } from "./i18n";
import "./App.css";

async function getWindowLabel(): Promise<string> {
  try {
    const currentWindow = webviewWindow.getCurrentWebviewWindow();
    if (currentWindow) {
      return currentWindow.label;
    }
  } catch {
    // Running in browser, not Tauri
  }
  return "main";
}

function WindowRouter() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    getWindowLabel().then(setWindowLabel);
  }, []);

  if (windowLabel === null) {
    return <div className="loading">{t.loading}</div>;
  }

  switch (windowLabel) {
    case "main":
      return <Wall />;
    case "settings":
      return <Settings />;
    case "notification":
      return <Notification />;
    default:
      return <Wall />;
  }
}

function App() {
  return <WindowRouter />;
}

export default App;
