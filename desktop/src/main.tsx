import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { tauriHandler as notificationHandler } from "./stores/notificationStore";
import { tauriHandler as cardHandler } from "./stores/cardStore";

Promise.all([notificationHandler.start(), cardHandler.start()]).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
