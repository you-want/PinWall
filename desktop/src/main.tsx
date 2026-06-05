import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { tauriHandler } from "./stores/notificationStore";

tauriHandler.start().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
