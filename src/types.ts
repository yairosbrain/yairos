export type Lang = "he" | "en";
export type BrainProviderId = "puter" | "gemini" | "claude";

export type ProjectStatus =
  | "interrogating"
  | "spec"
  | "awaiting_choice"
  | "building"
  | "qa"
  | "deploying"
  | "live"
  | "delivered"
  | "error";

export type AgentId =
  // Core pipeline — always runs
  | "core"
  | "interrogator"
  | "architect"
  | "designer"
  | "connector"
  | "coder"
  | "qa"
  | "deployer"
  // Optional specialists — opt in per device via settings / the `crew` command
  | "researcher"
  | "copywriter"
  | "seo"
  | "a11y"
  | "perf"
  | "security";

/** Specialists that feed text into the coder, before any code is written */
export const PRE_CODE_CREW = ["researcher", "copywriter"] as const;
/** Specialists that receive the finished files and hand back a corrected set */
export const POST_CODE_CREW = ["seo", "a11y", "perf", "security"] as const;

export interface Project {
  id: string;
  name: string;
  request: string;
  status: ProjectStatus;
  questions: string[];
  answers: string[];
  spec: string;
  deployMode: "auto" | "manual" | null;
  repoUrl?: string;
  liveUrl?: string;
  packageText?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  projectId?: string;
  role: "user" | "yairos" | "agent";
  agentId?: AgentId;
  text: string;
  lang: Lang;
  kind?: "text" | "spec" | "package" | "link" | "error";
  ts: number;
}

/**
 * Rolling memory of one conversation thread. `summary` covers every message
 * up to `coveredUpToTs`; everything newer is still sent to the brain verbatim.
 */
export interface ConversationMemory {
  id: string;
  threadId: string;
  summary: string;
  coveredUpToTs: number;
  foldedCount: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  projectId: string;
  agent: Exclude<AgentId, "core">;
  input: string;
  output: string;
  status: "running" | "done" | "error";
  ts: number;
  /** Set when the run finishes; absent while it is still running */
  endTs?: number;
}

export interface DeviceSettings {
  language: Lang;
  brainProvider: BrainProviderId;
  voiceOutput: boolean;
  geminiKey: string;
  claudeKey: string;
  githubToken: string;
  githubOwner: string;
  puterModel: string;
  /** Optional specialist departments enabled on this device */
  crew: AgentId[];
}

export interface SiteFile {
  path: string;
  content: string;
}
