import { useState } from "react";
import BootScreen from "./app/BootScreen";
import TranscriptScreen from "./app/TranscriptScreen";
import ProjectsScreen from "./app/ProjectsScreen";
import SettingsScreen from "./app/SettingsScreen";
import OpsScreen from "./app/OpsScreen";
import AgentCard from "./app/AgentCard";
import AskBar from "./app/AskBar";
import GalaxyScene from "./galaxy/GalaxyScene";
import Dock, { DesktopHint } from "./os/Dock";
import Window from "./os/Window";
import { useWm } from "./os/WindowManager";
import { useI18n } from "./i18n";
import { useOrchestrator } from "./core/orchestrator";
import type { AgentId } from "./types";
import type { AppId } from "./os/apps";

function GalaxyApp() {
  const { activeAgent, activeProject } = useOrchestrator();
  const { t } = useI18n();
  const [selected, setSelected] = useState<AgentId | null>(null);

  return (
    <div className="galaxy-app">
      <div className="galaxy-canvas">
        <GalaxyScene activeAgent={activeAgent} onSelect={setSelected} />
      </div>
      {activeProject && (
        <div className="project-pill">
          {t("project.active")}: {activeProject.name}
        </div>
      )}
      {selected && <AgentCard agentId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WindowBody({ app }: { app: AppId }) {
  switch (app) {
    case "term":
      return <TranscriptScreen />;
    case "galaxy":
      return <GalaxyApp />;
    case "ops":
      return <OpsScreen />;
    case "projects":
      return <ProjectsScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      return null;
  }
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const { busy } = useOrchestrator();
  const { windows, focusedId, isMobile } = useWm();
  const [booted, setBooted] = useState(false);

  if (!booted) return <BootScreen onDone={() => setBooted(true)} />;

  // On phones only the focused window is on screen; the dock is the switcher
  const visible = isMobile
    ? windows.filter((w) => w.id === focusedId && !w.minimized)
    : windows.filter((w) => !w.minimized);

  return (
    <div className="shell">
      <header className="topbar" dir="ltr">
        <span className="brand">
          <span className="brand-user">yairos@core</span>
          <span className="brand-sep">:</span>
          <span className="brand-path">~</span>
          <span className="brand-sep">$</span>
        </span>
        <span
          className={`status-dot ${busy ? "busy" : ""}`}
          title={busy ? t("status.thinking") : t("status.idle")}
        />
        <button
          className="lang-toggle"
          onClick={() => setLang(lang === "he" ? "en" : "he")}
          title={t("settings.language")}
        >
          {lang === "he" ? "EN" : "עב"}
        </button>
      </header>

      <main className="desktop">
        {!visible.length && <DesktopHint />}
        {visible.map((w) => (
          <Window key={w.id} win={w}>
            <WindowBody app={w.app} />
          </Window>
        ))}
      </main>

      <AskBar />
      <Dock />
    </div>
  );
}
