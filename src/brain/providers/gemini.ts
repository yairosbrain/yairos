import type { BrainMessage } from "../index";
import { getSettings } from "../../data/localSettings";

// Gemini API — direct REST from the browser with a free key
// from Google AI Studio (daily free-tier quota).
//
// Resilience rules learned the hard way:
// - 503 = model overloaded (free tier gets pushed aside) → retry w/ backoff
// - 429 = this model's daily quota is gone → try the next model
// - 404 = Google retired the model for this account → skip it, permanently
// Model names go stale (2.0-flash, 2.5-flash-lite…), so instead of trusting
// a hardcoded list we ask ListModels which text models this key can use,
// prefer the newest, and cache the answer for a day.

const PREFERRED = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];
const API = "https://generativelanguage.googleapis.com/v1beta";
const MODELS_CACHE_KEY = "yairos.geminiModels";
const MODELS_CACHE_TTL = 24 * 60 * 60 * 1000;
const ATTEMPTS_PER_MODEL = 2;
const BACKOFF_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RetriableError extends Error {}
class ModelGoneError extends Error {}

/** Models that 404'd this session — don't waste a request on them again */
const dead = new Set<string>();

async function modelChain(key: string): Promise<string[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) ?? "null") as {
      ts: number;
      models: string[];
    } | null;
    if (cached && Date.now() - cached.ts < MODELS_CACHE_TTL && cached.models.length) {
      return cached.models;
    }
  } catch {
    /* bad cache — refetch */
  }
  try {
    const res = await fetch(`${API}/models?key=${encodeURIComponent(key)}&pageSize=200`);
    if (res.ok) {
      const data = (await res.json()) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      const names = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter(
          (n) =>
            n.includes("flash") &&
            !/(image|live|tts|audio|video|omni|preview|exp|thinking|translate|8b)/.test(n)
        );
      const chain = [
        ...PREFERRED.filter((p) => names.includes(p)),
        ...names.filter((n) => !PREFERRED.includes(n)).sort().reverse()
      ];
      if (chain.length) {
        localStorage.setItem(
          MODELS_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), models: chain })
        );
        return chain;
      }
    }
  } catch {
    /* ListModels unreachable — fall back to the static preference list */
  }
  return PREFERRED;
}

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

  const models = (await modelChain(key)).filter((m) => !dead.has(m));
  if (!models.length) {
    localStorage.removeItem(MODELS_CACHE_KEY);
    throw new Error("No Gemini model is available for this key right now");
  }

  let lastError: Error = new Error("Gemini failed");
  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await callModel(key, model, body);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (e instanceof ModelGoneError) {
          dead.add(model);
          localStorage.removeItem(MODELS_CACHE_KEY);
          break; // straight to the next model
        }
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
      `${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body }
    );
  } catch (e) {
    // Network hiccup ("Load failed") — worth retrying
    throw new RetriableError(e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const msg = `Gemini HTTP ${res.status} (${model}): ${errBody.slice(0, 300)}`;
    if (res.status === 404) throw new ModelGoneError(msg);
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
