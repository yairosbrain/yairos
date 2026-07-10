import { useEffect, useRef, useState } from "react";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import { useOrchestrator } from "../core/orchestrator";
import { agentById } from "../agents/registry";
import { renderMarkdown } from "./markdown";
import AskBar from "./AskBar";
import type { AgentId, ChatMessage } from "../types";

function PackageActions({ text, name }: { text: string; name: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="pkg-actions">
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? t("package.copied") : t("package.copy")}
      </button>
      <button
        onClick={() => {
          const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${name || "yairos-package"}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        {t("package.download")}
      </button>
    </div>
  );
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { t } = useI18n();
  const data = useData();

  if (msg.role === "agent") {
    const def = msg.agentId ? agentById(msg.agentId as AgentId) : null;
    return (
      <div className="msg agent-line">
        {def && <span className="agent-dot small" style={{ background: def.color }} />}
        <span>{msg.text}</span>
      </div>
    );
  }

  if (msg.kind === "spec") {
    return (
      <div className="msg yairos spec">
        <details open>
          <summary>{t("spec.title")}</summary>
          <div
            className="md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
          />
        </details>
      </div>
    );
  }

  if (msg.kind === "package") {
    const project = data.projects.find((p) => p.id === msg.projectId);
    return (
      <div className="msg yairos package">
        <details>
          <summary>{t("package.title")}</summary>
          <div
            className="md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
          />
        </details>
        <PackageActions text={msg.text} name={project?.name ?? ""} />
      </div>
    );
  }

  if (msg.kind === "link") {
    const [liveUrl, repoUrl] = msg.text.split("\n");
    return (
      <div className="msg yairos links">
        <a href={liveUrl} target="_blank" rel="noreferrer" className="live-link">
          🚀 {t("live.open")}
        </a>
        {repoUrl && (
          <a href={repoUrl} target="_blank" rel="noreferrer" className="repo-link">
            {t("live.repo")}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`msg ${msg.role} ${msg.kind === "error" ? "error" : ""}`}>
      {msg.text}
    </div>
  );
}

export default function TranscriptScreen() {
  const { t } = useI18n();
  const data = useData();
  const { ask, chooseTrack, activeProject, busy } = useOrchestrator();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.messages.length]);

  const chips =
    activeProject?.status === "awaiting_choice"
      ? [
          { label: t("chips.trackA"), action: () => void chooseTrack("auto") },
          { label: t("chips.trackB"), action: () => void chooseTrack("manual") }
        ]
      : !activeProject
        ? [
            { label: t("chips.portfolio"), action: () => void ask(t("chips.portfolio")) },
            { label: t("chips.business"), action: () => void ask(t("chips.business")) },
            { label: t("chips.landing"), action: () => void ask(t("chips.landing")) },
            { label: t("chips.whatCanYou"), action: () => void ask(t("chips.whatCanYou")) }
          ]
        : [];

  return (
    <div className="screen transcript">
      <div className="messages">
        {data.messages.length === 0 && (
          <div className="empty">{t("transcript.empty")}</div>
        )}
        {data.messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {busy && <div className="msg yairos thinking">{t("status.thinking")}</div>}
        <div ref={bottomRef} />
      </div>
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <button key={c.label} className="chip" onClick={c.action} disabled={busy}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <AskBar />
    </div>
  );
}
