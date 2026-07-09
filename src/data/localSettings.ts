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
  puterModel: "claude-sonnet-5"
};

// Old defaults that upstream providers have since retired → auto-upgrade
const RETIRED_PUTER_MODELS = ["claude-sonnet-4", "claude-sonnet-4-5"];

export function getSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const s = { ...defaults, ...(JSON.parse(raw) as Partial<DeviceSettings>) };
    if (RETIRED_PUTER_MODELS.includes(s.puterModel)) {
      s.puterModel = defaults.puterModel;
    }
    return s;
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
