import type { BrainMessage } from "../index";
import { getSettings } from "../../data/localSettings";

// Puter.js — free access to Claude and 400+ models, no API key.
// The script is injected on first use; on first call Puter pops its own
// sign-in window (log in once with the yairosbrain account).

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          messages: { role: string; content: string }[],
          options?: { model?: string; stream?: boolean }
        ) => Promise<unknown>;
      };
    };
  }
}

let loading: Promise<void> | null = null;

function ensurePuter(): Promise<void> {
  if (window.puter) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://js.puter.com/v2/";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("Failed to load Puter.js — check your connection"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.text === "string") return r.text;
    const msg = r.message as Record<string, unknown> | undefined;
    if (msg) {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .map((b: unknown) =>
            b && typeof b === "object" && "text" in (b as object)
              ? String((b as { text: unknown }).text)
              : ""
          )
          .join("");
      }
    }
    if (typeof r.toString === "function") {
      const s = String(result);
      if (s && s !== "[object Object]") return s;
    }
  }
  return "";
}

export async function askPuter(messages: BrainMessage[]): Promise<string> {
  await ensurePuter();
  if (!window.puter) throw new Error("Puter.js unavailable");
  const model = getSettings().puterModel || "claude-sonnet-4";
  const result = await window.puter.ai.chat(
    messages.map((m) => ({ role: m.role, content: m.content })),
    { model }
  );
  const text = extractText(result);
  if (!text) throw new Error("Puter returned an empty response");
  return text;
}
