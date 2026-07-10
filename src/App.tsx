import { useState } from "react";
import BootScreen from "./app/BootScreen";
import TranscriptScreen from "./app/TranscriptScreen";
import ProjectsScreen from "./app/ProjectsScreen";
import SettingsScreen from "./app/SettingsScreen";
import AgentCard from "./app/AgentCard";
import AskBar from "./app/AskBar";
import GalaxyScene from "./galaxy/GalaxyScene";
import { useI18n } from "./i18n";
import { useOrchestrator } from "./core/orchestrator";
import type { AgentId } from "./types";

type Screen = "boot" | "galaxy" | "transcript" | "projects" | "settings";

function GalaxyScreen() {
  const { activeAgent, activeProject } = useOrchestrator();
  const { t } = useI18n();
  const [selected, setSelected] = useState<AgentId | null>(null);

  return (
    <div className="screen galaxy-screen">
      <div className="galaxy-canvas">
        <GalaxyScene activeAgent={activeAgent} onSelect={setSelected} />
      </div>
      {activeProject && (
        <div className="project-pill">
          {t("project.active")}: {activeProject.name}
        </div>
      )}
      {selected && <AgentCard agentId={selected} onClose={() => setSelected(null)} />}
      <AskBar />
    </div>
  );
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const { busy } = useOrchestrator();
  const [screen, setScreen] = useState<Screen>("boot");

  if (screen === "boot") {
    return <BootScreen onDone={() => setScreen("galaxy")} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Y.A.I.R.O.S</span>
        <span className={`status-dot ${busy ? "busy" : ""}`} title={busy ? t("status.thinking") : t("status.idle")} />
        <button
          className="lang-toggle"
          onClick={() => setLang(lang === "he" ? "en" : "he")}
          title={t("settings.language")}
        >
          {lang === "he" ? "EN" : "עב"}
        </button>
      </header>

      <main className="content">
        {screen === "galaxy" && <GalaxyScreen />}
        {screen === "transcript" && <TranscriptScreen />}
        {screen === "projects" && <ProjectsScreen />}
        {screen === "settings" && <SettingsScreen />}
      </main>

      <nav className="bottomnav">
        <button className={screen === "galaxy" ? "on" : ""} onClick={() => setScreen("galaxy")}>
          <span className="nav-ico">✦</span>
          {t("nav.galaxy")}
        </button>
        <button
          className={screen === "transcript" ? "on" : ""}
          onClick={() => setScreen("transcript")}
        >
          <span className="nav-ico">☰</span>
          {t("nav.transcript")}
        </button>
        <button
          className={screen === "projects" ? "on" : ""}
          onClick={() => setScreen("projects")}
        >
          <span className="nav-ico">▤</span>
          {t("nav.projects")}
        </button>
        <button className={screen === "settings" ? "on" : ""} onClick={() => setScreen("settings")}>
          <span className="nav-ico">⚙</span>
          {t("nav.settings")}
        </button>
      </nav>
    </div>
  );
}
