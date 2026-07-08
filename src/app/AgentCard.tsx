import { agentById } from "../agents/registry";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import type { AgentId } from "../types";

// The "ARCHIVE RECORD" style department card that opens when tapping a star.

export default function AgentCard({
  agentId,
  onClose
}: {
  agentId: AgentId;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const data = useData();
  const def = agentById(agentId);

  const lastRun = [...data.agentRuns]
    .filter((r) => r.agent === agentId)
    .sort((a, b) => b.ts - a.ts)[0];

  return (
    <div className="agent-card-backdrop" onClick={onClose}>
      <div className="agent-card" onClick={(e) => e.stopPropagation()}>
        <div className="agent-card-head">
          <span className="agent-dot" style={{ background: def.color, boxShadow: `0 0 12px ${def.color}` }} />
          <h2>{t(`agent.${agentId}`)}</h2>
          <button className="agent-card-close" onClick={onClose} aria-label={t("card.close")}>
            ✕
          </button>
        </div>
        <p className="agent-desc">{t(`agent.${agentId}.desc`)}</p>
        <div className="agent-meta">
          <div>
            <span className="meta-label">{t("card.lastRun")}</span>
            <span>
              {lastRun
                ? new Date(lastRun.ts).toLocaleString(lang === "he" ? "he-IL" : "en-US")
                : t("card.never")}
            </span>
          </div>
          {lastRun && (
            <div>
              <span className="meta-label">{t("card.status")}</span>
              <span className={`run-status ${lastRun.status}`}>{lastRun.status}</span>
            </div>
          )}
        </div>
        {lastRun?.output && (
          <pre className="agent-output">{lastRun.output.slice(0, 600)}</pre>
        )}
      </div>
    </div>
  );
}
