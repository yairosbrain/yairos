import type { AgentId } from "../types";

// The department registry. Three views are built from this one list:
// the 3D galaxy (position), the brain map (lobe), and the crew picker
// in settings (optional). Adding a department = one entry + one prompt.

export interface AgentDef {
  id: AgentId;
  color: string;
  /** Position of the star in the 3D galaxy */
  position: [number, number, number];
  /** Where the node sits on the brain map, in viewBox units (0-400 x 0-300) */
  lobe: [number, number];
  /** Optional specialists only run when enabled for this device */
  optional?: boolean;
}

export const AGENTS: AgentDef[] = [
  // ---- core pipeline ----
  { id: "core", color: "#3b82f6", position: [0, 0, 0], lobe: [196, 150] },
  {
    id: "interrogator",
    color: "#facc15",
    position: [3.1, 0.7, -0.4],
    lobe: [286, 96]
  },
  {
    id: "architect",
    color: "#fb923c",
    position: [1.7, -0.5, 2.8],
    lobe: [248, 68]
  },
  {
    id: "designer",
    color: "#a855f7",
    position: [-1.6, 0.9, 2.9],
    lobe: [172, 62]
  },
  {
    id: "connector",
    color: "#ec4899",
    position: [0.1, -1.3, 3.3],
    lobe: [286, 178]
  },
  { id: "coder", color: "#22c55e", position: [-3.2, -0.4, 0.2], lobe: [110, 96] },
  { id: "qa", color: "#ef4444", position: [-1.7, 0.6, -2.9], lobe: [96, 168] },
  {
    id: "deployer",
    color: "#2dd4bf",
    position: [1.8, -0.8, -2.7],
    lobe: [150, 222]
  },

  // ---- optional specialists ----
  {
    id: "researcher",
    color: "#38bdf8",
    position: [3.6, 1.4, 1.9],
    lobe: [232, 118],
    optional: true
  },
  {
    id: "copywriter",
    color: "#c084fc",
    position: [-0.4, 1.9, 3.4],
    lobe: [210, 96],
    optional: true
  },
  {
    id: "seo",
    color: "#f472b6",
    position: [-3.4, 1.3, -1.6],
    lobe: [140, 140],
    optional: true
  },
  {
    id: "a11y",
    color: "#34d399",
    position: [-2.6, -1.5, -1.9],
    lobe: [104, 208],
    optional: true
  },
  {
    id: "perf",
    color: "#fbbf24",
    position: [0.6, 1.8, -3.3],
    lobe: [196, 206],
    optional: true
  },
  {
    id: "security",
    color: "#f87171",
    position: [3.2, -1.6, -1.8],
    lobe: [252, 216],
    optional: true
  }
];

/** Build-pipeline order — consecutive stars light up along these links */
export const PIPELINE: AgentId[] = [
  "interrogator",
  "architect",
  "designer",
  "connector",
  "coder",
  "qa",
  "deployer"
];

export const agentById = (id: AgentId): AgentDef =>
  AGENTS.find((a) => a.id === id)!;

export const OPTIONAL_AGENTS = AGENTS.filter((a) => a.optional);
