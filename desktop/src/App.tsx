import { webviewWindow } from "@tauri-apps/api";
import Wall from "./pages/Wall";
import Settings from "./pages/Settings";
import Notification from "./pages/Notification";
import "./App.css";
import React from "react";

async function getWindowLabel(): Promise<string> {
  const currentWindow = webviewWindow.getCurrentWebviewWindow();
  return currentWindow.label;
}

function App() {
  return <WindowRouter />;
}

function WindowRouter() {
  const [windowLabel, setWindowLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    getWindowLabel().then(setWindowLabel);
  }, []);

  if (windowLabel === null) {
    return <div className="loading">加载中...</div>;
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

export default App;
