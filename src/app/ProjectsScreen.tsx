import { useEffect, useRef, useState } from "react";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import { useOrchestrator } from "../core/orchestrator";
import { useWm } from "../os/WindowManager";
import { loadFolders } from "../os/projectFs";
import { getSettings } from "../data/localSettings";
import { deleteRepo, parseRepoUrl } from "../deploy/github";
import AskBar from "./AskBar";
import { MessageBubble } from "./TranscriptScreen";
import type { Project } from "../types";

/**
 * Deleting a project is irreversible and reaches outside the app, so the
 * dialog states every consequence before the button is live and reports what
 * actually happened afterwards — including a repo it could not remove.
 */
function DeleteDialog({
  project,
  onClose,
  onDeleted
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const repo = project.repoUrl ? parseRepoUrl(project.repoUrl) : null;
  const armed = confirm.trim() === project.name.trim();

  const run = async () => {
    setBusy(true);
    setError("");
    // Remove the repo first: if that fails the project row survives, so the
    // user still has the link and can retry. The reverse would strand it.
    if (repo) {
      const token = getSettings().githubToken.trim();
      if (!token) {
        setError(t("del.noToken"));
        setBusy(false);
        return;
      }
      const res = await deleteRepo(token, repo.owner, repo.repo);
      if (!res.ok) {
        setError(
          res.reason === "scope"
            ? t("del.scope")
            : t("del.repoFailed", { detail: res.detail })
        );
        setBusy(false);
        return;
      }
    }
    try {
      await data.deleteProject(project.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="agent-card-backdrop" onClick={onClose}>
      <div className="agent-card del-card" onClick={(e) => e.stopPropagation()}>
        <div className="agent-card-head">
          <h2>{t("del.title")}</h2>
          <button className="agent-card-close" onClick={onClose} aria-label={t("card.close")}>
            ✕
          </button>
        </div>

        <p className="agent-desc">{t("del.body", { name: project.name })}</p>
        <ul className="del-list">
          <li>{t("del.item.convex")}</li>
          {repo ? (
            <li className="danger">
              {t("del.item.repo", { repo: `${repo.owner}/${repo.repo}` })}
            </li>
          ) : (
            <li className="muted">{t("del.item.noRepo")}</li>
          )}
          {project.liveUrl && <li className="danger">{t("del.item.pages")}</li>}
        </ul>
        <p className="del-note">{t("del.vercelNote")}</p>

        <label className="del-confirm-label">
          {t("del.typeName", { name: project.name })}
        </label>
        <input
          className="del-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={project.name}
          autoFocus
        />

        {error && <div className="test-fail">{error}</div>}

        <div className="pkg-actions">
          <button onClick={onClose} disabled={busy}>
            {t("del.cancel")}
          </button>
          <button
            className="del-go"
            onClick={() => void run()}
            disabled={!armed || busy}
          >
            {busy ? t("del.deleting") : t("del.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const { consumeProjectChat } = useWm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  // `open project <name>` in the shell lands here
  useEffect(() => {
    const id = consumeProjectChat();
    if (id) setOpenId(id);
  }, [consumeProjectChat]);

  const projects = [...data.projects].sort((a, b) => b.createdAt - a.createdAt);
  const open = projects.find((p) => p.id === openId) ?? null;
  if (open) return <ProjectChat project={open} onBack={() => setOpenId(null)} />;

  // Group by the shell folder: named folders first (from the folder list plus
  // any a project points at), then everything unfiled.
  const folderSet = new Set<string>(loadFolders());
  for (const p of projects) if (p.folder) folderSet.add(p.folder);
  const folders = [...folderSet].sort();
  const inFolder = (name: string) => projects.filter((p) => p.folder === name);
  const unfiled = projects.filter((p) => !p.folder);

  const card = (p: Project) => (
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
        <button
          className="project-del"
          title={t("del.title")}
          aria-label={t("del.title")}
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(p);
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );

  return (
    <div className="screen projects">
      <h2>
        {t("projects.title")}
        <span className="projects-count">{projects.length}</span>
      </h2>
      {projects.length === 0 && <div className="empty">{t("projects.empty")}</div>}
      {deleting && (
        <DeleteDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setOpenId(null);
          }}
        />
      )}
      <div className="project-list">
        {folders.map((name) => {
          const items = inFolder(name);
          return (
            <details key={name} className="proj-folder" open>
              <summary>
                <span className="folder-ico" aria-hidden>▸</span>
                {name}
                <span className="folder-count">{items.length}</span>
              </summary>
              {items.length ? (
                items.map(card)
              ) : (
                <div className="folder-empty">{t("projects.folderEmpty")}</div>
              )}
            </details>
          );
        })}
        {folders.length > 0 && unfiled.length > 0 && (
          <div className="proj-unfiled-label">{t("projects.unfiled")}</div>
        )}
        {unfiled.map(card)}
      </div>
    </div>
  );
}
