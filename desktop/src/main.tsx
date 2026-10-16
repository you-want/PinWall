import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { tauriHandler as notificationHandler } from "./stores/notificationStore";
import { tauriHandler as reminderHandler } from "./stores/reminderStore";
import { tauriHandler as cardHandler } from "./stores/cardStore";
import { languageTauriHandler, useLanguageStore } from "./stores/languageStore";
import { moodTauriHandler } from "./stores/moodStore";
import { widgetTauriHandler } from "./stores/widgetStore";
import { getTranslations } from "./i18n";
import { startStoreHandlers } from "./services/storeBootstrap";
import { invoke } from "@tauri-apps/api/core";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const t = getTranslations(useLanguageStore.getState().lang);
root.render(<div className="loading" role="status">{t.loading}</div>);

invoke("prepare_local_storage").then(() => startStoreHandlers([
  notificationHandler,
  reminderHandler,
  cardHandler,
  languageTauriHandler,
  moodTauriHandler,
  widgetTauriHandler,
])).then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}).catch((error: unknown) => {
  // Keep the wall unmounted so failed hydration cannot overwrite saved data.
  const messages = getTranslations(useLanguageStore.getState().lang);
  root.render(
    <div className="startup-error" data-interactive="true" role="alert">
      <p>{messages.startup_error}</p>
      <p>{error === "storage_future_version" ? messages.storage_future_version : messages.storage_startup_help}</p>
      <button className="btn-v2 btn-v2-primary" onClick={() => window.location.reload()}>
        {messages.startup_retry}
      </button>
    </div>,
  );
});
