import type { DeviceSettings } from "../types";

// Device-local settings. Keys and tokens live ONLY here (localStorage),
// never in code, never in git, never in Convex.
const KEY = "yairos.settings";

const defaults: DeviceSettings = {
  language: "he",
  brainProvider: "puter",
  voiceOutput: true,
  geminiKey: "",
  claudeKey: "",
  githubToken: "",
  githubOwner: "yairosbrain",
  puterModel: "claude-sonnet-4"
};

export function getSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...(JSON.parse(raw) as Partial<DeviceSettings>) };
  } catch {
    return { ...defaults };
  }
}

export function patchSettings(patch: Partial<DeviceSettings>): DeviceSettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("yairos:settings"));
  return next;
}

export function onSettingsChange(fn: () => void): () => void {
  window.addEventListener("yairos:settings", fn);
  return () => window.removeEventListener("yairos:settings", fn);
}
