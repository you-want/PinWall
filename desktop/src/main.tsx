import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { tauriHandler as notificationHandler } from "./stores/notificationStore";
import { tauriHandler as reminderHandler } from "./stores/reminderStore";
import { tauriHandler as cardHandler } from "./stores/cardStore";
import { languageTauriHandler } from "./stores/languageStore";
import { moodTauriHandler } from "./stores/moodStore";
import { widgetTauriHandler } from "./stores/widgetStore";

Promise.all([
  notificationHandler.start(),
  reminderHandler.start(),
  cardHandler.start(),
  languageTauriHandler.start(),
  moodTauriHandler.start(),
  widgetTauriHandler.start(),
]).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
