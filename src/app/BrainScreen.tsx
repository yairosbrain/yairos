import { useMemo, useState } from "react";
import { AGENTS, PIPELINE, agentById } from "../agents/registry";
import { useData } from "../data/store";
import { useI18n } from "../i18n";
import { useOrchestrator } from "../core/orchestrator";
import { getSettings } from "../data/localSettings";
import AgentCard from "./AgentCard";
import type { AgentId } from "../types";

// The brain map: the same departments as the galaxy, but laid out anatomically
// instead of astronomically. Node brightness is real state — enabled, idle,
// running, or last-run-failed — so a glance tells you what the system is doing.

const VIEW_W = 400;
const VIEW_H = 300;

/** Stylised cortex outline, drawn once in viewBox units */
const CORTEX =
  "M188 26 C120 22 66 58 54 108 C30 122 26 158 44 178 C36 206 58 234 92 238 " +
  "C108 268 152 280 186 264 C210 276 244 272 262 252 C302 254 330 226 328 194 " +
  "C352 172 350 132 322 116 C318 68 268 32 214 30 Z";

/** The fold lines that make it read as a brain rather than a blob */
const FOLDS = [
  "M188 30 C186 90 190 170 186 262",
  "M96 96 C132 104 140 138 116 156 C142 166 140 200 108 206",
  "M262 78 C232 96 236 128 262 138 C238 154 244 188 274 192",
  "M60 140 C86 132 104 148 96 172",
  "M330 152 C306 146 288 162 296 186"
];

export default function BrainScreen() {
  const { t } = useI18n();
  const data = useData();
  const { activeAgent } = useOrchestrator();
  const [selected, setSelected] = useState<AgentId | null>(null);
  const crew = getSettings().crew ?? [];

  /** Most recent run per department — drives the node's colour and halo */
  const lastRuns = useMemo(() => {
    const map = new Map<string, { status: string; ts: number }>();
    for (const r of data.agentRuns) {
      const prev = map.get(r.agent);
      if (!prev || r.ts > prev.ts) map.set(r.agent, { status: r.status, ts: r.ts });
    }
    return map;
  }, [data.agentRuns]);

  const nodes = AGENTS.map((a) => {
    const run = lastRuns.get(a.id);
    const active = activeAgent === a.id;
    // An optional department the user hasn't enabled is dormant, not broken
    const dormant = !!a.optional && !crew.includes(a.id);
    return { def: a, run, active, dormant };
  });

  return (
    <div className="brain" dir="ltr">
      <svg
        className="brain-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t("app.brain")}
      >
        <defs>
          <radialGradient id="brainGlow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#0d2c4d" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="190" cy="145" rx="185" ry="140" fill="url(#brainGlow)" />

        <path
          className="brain-cortex"
          d={CORTEX}
          fill="rgba(10,35,64,0.32)"
          stroke="var(--blue-dim)"
          strokeWidth="1.6"
        />
        {FOLDS.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="var(--blue-dim)"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* Brain stem — where deployment leaves the system */}
        <path
          d="M150 240 C152 262 160 274 172 284"
          fill="none"
          stroke="var(--blue-dim)"
          strokeWidth="3"
          opacity="0.55"
        />

        {/* Signal paths along the build pipeline */}
        {PIPELINE.slice(0, -1).map((from, i) => {
          const a = agentById(from);
          const b = agentById(PIPELINE[i + 1]);
          const lit = activeAgent === from || activeAgent === PIPELINE[i + 1];
          return (
            <line
              key={from}
              x1={a.lobe[0]}
              y1={a.lobe[1]}
              x2={b.lobe[0]}
              y2={b.lobe[1]}
              stroke={lit ? "var(--blue)" : "var(--line)"}
              strokeWidth={lit ? 1.8 : 1}
              opacity={lit ? 0.95 : 0.45}
            />
          );
        })}

        {nodes.map(({ def, run, active, dormant }) => (
          <g
            key={def.id}
            className={`brain-node ${active ? "active" : ""} ${
              dormant ? "dormant" : ""
            }`}
            onClick={() => setSelected(def.id)}
            role="button"
            aria-label={t(`agent.${def.id}`)}
          >
            {active && (
              <circle cx={def.lobe[0]} cy={def.lobe[1]} r="16" fill={def.color} opacity="0.22">
                <animate
                  attributeName="r"
                  values="11;19;11"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            <circle
              cx={def.lobe[0]}
              cy={def.lobe[1]}
              r={def.id === "core" ? 10 : 7}
              fill={dormant ? "#0a1420" : def.color}
              stroke={dormant ? "var(--line)" : def.color}
              strokeWidth="1.5"
              opacity={dormant ? 0.85 : 1}
            />
            {run?.status === "error" && !dormant && (
              <circle
                cx={def.lobe[0] + 8}
                cy={def.lobe[1] - 8}
                r="3.4"
                fill="var(--error)"
              />
            )}
            <text
              className="brain-label"
              x={def.lobe[0]}
              y={def.lobe[1] + (def.id === "core" ? 24 : 20)}
              textAnchor="middle"
            >
              {def.id}
            </text>
          </g>
        ))}
      </svg>

      <div className="brain-legend">
        <span>
          <i className="lg-dot on" /> {t("brain.legend.active")}
        </span>
        <span>
          <i className="lg-dot idle" /> {t("brain.legend.idle")}
        </span>
        <span>
          <i className="lg-dot off" /> {t("brain.legend.dormant")}
        </span>
        <span className="brain-crew">
          {t("brain.crew", {
            n: String(crew.length),
            total: String(AGENTS.filter((a) => a.optional).length)
          })}
        </span>
      </div>

      {selected && <AgentCard agentId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
