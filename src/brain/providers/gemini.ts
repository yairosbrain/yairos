import type { BrainMessage } from "../index";
import { getSettings } from "../../data/localSettings";

// Gemini API — direct REST from the browser with a free key
// from Google AI Studio (daily free-tier quota).
//
// The free tier gets pushed aside under load (HTTP 503 "high demand") and
// each model has its own daily quota (HTTP 429). So: retry with a short
// backoff, and when a model stays overloaded — fall through to the next
// model in the chain instead of failing the whole pipeline.

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
const ATTEMPTS_PER_MODEL = 2;
const BACKOFF_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RetriableError extends Error {}

export async function askGemini(messages: BrainMessage[]): Promise<string> {
  const key = getSettings().geminiKey.trim();
  if (!key) throw new Error("Missing Gemini key — add it in Settings");

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
  const body = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 60000 }
  });

  let lastError: Error = new Error("Gemini failed");
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await callModel(key, model, body);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (!(e instanceof RetriableError)) throw lastError;
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(BACKOFF_MS * attempt);
      }
    }
    // Model exhausted its attempts — fall through to the next one
  }
  throw lastError;
}

async function callModel(key: string, model: string, body: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body }
    );
  } catch (e) {
    // Network hiccup ("Load failed") — worth retrying
    throw new RetriableError(e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const msg = `Gemini HTTP ${res.status} (${model}): ${errBody.slice(0, 300)}`;
    // 503 = model overloaded, 429 = this model's daily quota — try again / next model
    if (res.status === 503 || res.status === 429 || res.status >= 500) {
      throw new RetriableError(msg);
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new RetriableError(`Gemini (${model}) returned an empty response`);
  return text;
}
