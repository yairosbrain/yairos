import type { AgentId } from "../types";

// The department registry — the galaxy is built from this list.
// Adding a new department in the future = one entry here + a system prompt.

export interface AgentDef {
  id: AgentId;
  color: string;
  /** Position of the star in the 3D galaxy */
  position: [number, number, number];
}

export const AGENTS: AgentDef[] = [
  { id: "core", color: "#3b82f6", position: [0, 0, 0] },
  { id: "interrogator", color: "#facc15", position: [3.1, 0.7, -0.4] },
  { id: "architect", color: "#fb923c", position: [1.7, -0.5, 2.8] },
  { id: "designer", color: "#a855f7", position: [-1.6, 0.9, 2.9] },
  { id: "coder", color: "#22c55e", position: [-3.2, -0.4, 0.2] },
  { id: "qa", color: "#ef4444", position: [-1.7, 0.6, -2.9] },
  { id: "deployer", color: "#2dd4bf", position: [1.8, -0.8, -2.7] }
];

/** Build-pipeline order — consecutive stars light up along these links */
export const PIPELINE: AgentId[] = [
  "interrogator",
  "architect",
  "designer",
  "coder",
  "qa",
  "deployer"
];

export const agentById = (id: AgentId): AgentDef =>
  AGENTS.find((a) => a.id === id)!;
