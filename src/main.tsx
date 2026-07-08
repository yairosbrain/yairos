import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { I18nProvider } from "./i18n";
import { DataProvider } from "./data/store";
import { OrchestratorProvider } from "./core/orchestrator";
import "./styles.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <DataProvider>
        <OrchestratorProvider>
          <App />
        </OrchestratorProvider>
      </DataProvider>
    </I18nProvider>
  </StrictMode>
);
