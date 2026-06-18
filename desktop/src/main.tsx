import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { tauriHandler as notificationHandler } from "./stores/notificationStore";
import { tauriHandler as cardHandler } from "./stores/cardStore";
import { languageTauriHandler } from "./stores/languageStore";
import { moodTauriHandler } from "./stores/moodStore";

Promise.all([
  notificationHandler.start(),
  cardHandler.start(),
  languageTauriHandler.start(),
  moodTauriHandler.start(),
]).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
