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
  | "core"
  | "interrogator"
  | "architect"
  | "designer"
  | "coder"
  | "qa"
  | "deployer";

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

export interface AgentRun {
  id: string;
  projectId: string;
  agent: Exclude<AgentId, "core">;
  input: string;
  output: string;
  status: "running" | "done" | "error";
  ts: number;
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
}

export interface SiteFile {
  path: string;
  content: string;
}
