import { useEffect, useRef, useState } from "react";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import { useOrchestrator } from "../core/orchestrator";
import AskBar from "./AskBar";
import { MessageBubble } from "./TranscriptScreen";
import type { Project } from "../types";

// The project hub: every site Yairos built, its live URL, and a dedicated
// chat per project that remembers that project's whole story.

function ProjectChat({ project, onBack }: { project: Project; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const { busy } = useOrchestrator();
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgs = data.messages.filter((m) => m.projectId === project.id);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  return (
    <div className="screen transcript project-chat">
      <div className="project-chat-head">
        <button className="back-btn" onClick={onBack} aria-label={t("projects.back")}>
          ‹
        </button>
        <span className="project-chat-name">{project.name}</span>
        {project.liveUrl && (
          <a
            className="project-chat-live"
            href={project.liveUrl}
            target="_blank"
            rel="noreferrer"
            title={t("live.open")}
          >
            🚀
          </a>
        )}
      </div>
      <div className="messages">
        {msgs.length === 0 && <div className="empty">{t("projects.chatEmpty")}</div>}
        {msgs.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {busy && <div className="msg yairos thinking">{t("status.thinking")}</div>}
        <div ref={bottomRef} />
      </div>
      <AskBar projectId={project.id} />
    </div>
  );
}

export default function ProjectsScreen() {
  const { t, lang } = useI18n();
  const data = useData();
  const [openId, setOpenId] = useState<string | null>(null);

  const projects = [...data.projects].sort((a, b) => b.createdAt - a.createdAt);
  const open = projects.find((p) => p.id === openId) ?? null;
  if (open) return <ProjectChat project={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="screen projects">
      <h2>{t("projects.title")}</h2>
      {projects.length === 0 && <div className="empty">{t("projects.empty")}</div>}
      <div className="project-list">
        {projects.map((p) => (
          <div
            key={p.id}
            className="project-card"
            onClick={() => setOpenId(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") setOpenId(p.id);
            }}
          >
            <div className="project-head">
              <span className="project-name">{p.name}</span>
              <span className={`status-chip s-${p.status}`}>{t(`status.${p.status}`)}</span>
            </div>
            <div className="project-date">
              {new Date(p.createdAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-US", {
                day: "numeric",
                month: "short",
                year: "numeric"
              })}
            </div>
            {p.liveUrl && (
              <a
                className="project-url"
                href={p.liveUrl}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                onClick={(e) => e.stopPropagation()}
              >
                🚀 {p.liveUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
            <div className="project-actions">
              {p.repoUrl && (
                <a
                  href={p.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("live.repo")}
                </a>
              )}
              <span className="project-chat-cta">💬 {t("projects.chat")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
