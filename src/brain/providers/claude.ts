import type { BrainMessage } from "../index";
import { getSettings } from "../../data/localSettings";

// Claude API — direct from the browser with a personal (paid) Anthropic key.
// Requires the anthropic-dangerous-direct-browser-access header.

const MODEL = "claude-sonnet-4-5";

export async function askClaude(messages: BrainMessage[]): Promise<string> {
  const key = getSettings().claudeKey.trim();
  if (!key) throw new Error("Missing Claude key — add it in Settings");

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      ...(system ? { system } : {}),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }))
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";
  if (!text) throw new Error("Claude returned an empty response");
  return text;
}
