import { getSettings } from "../data/localSettings";
import type { BrainProviderId } from "../types";
import { askPuter } from "./providers/puter";
import { askGemini } from "./providers/gemini";
import { askClaude } from "./providers/claude";

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class BrainError extends Error {
  provider: BrainProviderId;
  constructor(provider: BrainProviderId, message: string) {
    super(message);
    this.provider = provider;
  }
}

const providers: Record<
  BrainProviderId,
  (messages: BrainMessage[]) => Promise<string>
> = {
  puter: askPuter,
  gemini: askGemini,
  claude: askClaude
};

/** The single unified interface the whole system talks to. */
export async function askBrain(messages: BrainMessage[]): Promise<string> {
  const provider = getSettings().brainProvider;
  try {
    const answer = await providers[provider](messages);
    if (!answer || !answer.trim()) {
      throw new Error("empty response");
    }
    return answer.trim();
  } catch (e) {
    throw new BrainError(provider, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Ask the brain for JSON. Strips markdown fences and leading prose,
 * retries once with a stern reminder if parsing fails.
 */
export async function askBrainJson<T>(messages: BrainMessage[]): Promise<T> {
  const first = await askBrain(messages);
  const parsed = tryParseJson<T>(first);
  if (parsed !== undefined) return parsed;
  const retry = await askBrain([
    ...messages,
    { role: "assistant", content: first },
    {
      role: "user",
      content:
        "Your previous reply was not valid JSON. Reply again with ONLY the valid JSON, no markdown fences, no explanation."
    }
  ]);
  const parsed2 = tryParseJson<T>(retry);
  if (parsed2 !== undefined) return parsed2;
  throw new Error("Brain did not return valid JSON");
}

export function tryParseJson<T>(text: string): T | undefined {
  const cleaned = text
    .replace(/^[\s\S]*?```(?:json)?\s*\n?/, (m) => (m.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/, "")
    .trim();
  for (const candidate of [text.trim(), cleaned, sliceJson(text), sliceJson(cleaned)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function sliceJson(text: string): string {
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return "";
  const start = Math.min(...starts);
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  const end = text.lastIndexOf(close);
  if (end <= start) return "";
  return text.slice(start, end + 1);
}
