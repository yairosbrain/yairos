import { useEffect, useState } from "react";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import { useOrchestrator } from "../core/orchestrator";
import { agentById } from "../agents/registry";
import { getSettings, onSettingsChange } from "../data/localSettings";
import type { AgentId, AgentRun } from "../types";

// The process monitor. Everything here is measured, not decorative:
// each row is one real department run against the brain provider.

function fmtDuration(run: AgentRun, now: number): string {
  const end = run.status === "running" ? now : run.endTs;
  if (!end) return "—";
  const ms = end - run.ts;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}K`;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export default function OpsScreen() {
  const { t } = useI18n();
  const data = useData();
  const { busy, activeAgent } = useOrchestrator();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settings, setSettings] = useState(() => getSettings());

  // Tick only while something is actually running — an idle monitor is silent
  const anyRunning = data.agentRuns.some((r) => r.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [anyRunning]);

  useEffect(() => onSettingsChange(() => setSettings(getSettings())), []);

  const runs = [...data.agentRuns].sort((a, b) => b.ts - a.ts).slice(0, 120);
  const done = data.agentRuns.filter((r) => r.status === "done").length;
  const failed = data.agentRuns.filter((r) => r.status === "error").length;
  const running = data.agentRuns.filter((r) => r.status === "running").length;

  const provider =
    settings.brainProvider === "puter"
      ? `puter (${settings.puterModel})`
      : settings.brainProvider;

  return (
    <div className="ops" dir="ltr">
      <div className="ops-head">
        <div className="ops-stat">
          <span className="ops-k">brain</span>
          <span className="ops-v">{provider}</span>
        </div>
        <div className="ops-stat">
          <span className="ops-k">store</span>
          <span className={`ops-v ${data.mode}`}>{data.mode}</span>
        </div>
        <div className="ops-stat">
          <span className="ops-k">state</span>
          <span className={`ops-v ${busy ? "warn" : "ok"}`}>
            {busy ? `busy:${activeAgent ?? "core"}` : "idle"}
          </span>
        </div>
        <div className="ops-stat">
          <span className="ops-k">runs</span>
          <span className="ops-v">
            <span className="ok">{done}</span>
            {" / "}
            <span className="warn">{running}</span>
            {" / "}
            <span className="bad">{failed}</span>
          </span>
        </div>
        <div className="ops-stat">
          <span className="ops-k">projects</span>
          <span className="ops-v">{data.projects.length}</span>
        </div>
        <div className="ops-stat">
          <span className="ops-k">memory</span>
          <span className="ops-v">
            {data.memories.length
              ? `${data.memories.length} threads / ${data.memories.reduce(
                  (n, m) => n + m.foldedCount,
                  0
                )} folded`
              : "—"}
          </span>
        </div>
      </div>

      <div className="ops-table" role="table">
        <div className="ops-row ops-th" role="row">
          <span className="c-pid">PID</span>
          <span className="c-dept">DEPT</span>
          <span className="c-stat">STAT</span>
          <span className="c-time">TIME</span>
          <span className="c-io">IN</span>
          <span className="c-io">OUT</span>
          <span className="c-when">START</span>
        </div>

        {!runs.length && <div className="ops-empty">{t("ops.empty")}</div>}

        {runs.map((r) => {
          const def = agentById(r.agent as AgentId);
          const isOpen = expanded === r.id;
          return (
            <div key={r.id}>
              <div
                className={`ops-row s-${r.status} ${isOpen ? "open" : ""}`}
                role="row"
                onClick={() => setExpanded(isOpen ? null : r.id)}
              >
                <span className="c-pid">{r.id.slice(-6)}</span>
                <span className="c-dept">
                  <i className="ops-dot" style={{ background: def?.color }} />
                  {r.agent}
                </span>
                <span className={`c-stat s-${r.status}`}>
                  {r.status === "running"
                    ? "RUN"
                    : r.status === "done"
                      ? "OK"
                      : "ERR"}
                </span>
                <span className="c-time">{fmtDuration(r, now)}</span>
                <span className="c-io">{fmtBytes(r.input.length)}</span>
                <span className="c-io">{fmtBytes(r.output.length)}</span>
                <span className="c-when">{fmtClock(r.ts)}</span>
              </div>
              {isOpen && (
                <div className="ops-detail">
                  <div className="ops-detail-k">stdin</div>
                  <pre>{r.input || "—"}</pre>
                  <div className="ops-detail-k">stdout</div>
                  <pre>{r.output || "—"}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
