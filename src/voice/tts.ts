import type { Lang } from "../types";
import { getSettings } from "../data/localSettings";

// speechSynthesis — built-in TTS. Hebrew voice on-device
// (Carmit on iPhone, Google Hebrew on Android, Microsoft voices on Windows).

let voices: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  voices = window.speechSynthesis?.getVoices() ?? [];
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const prefix = lang === "he" ? "he" : "en";
  if (!voices.length) refreshVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  );
}

export function speak(text: string, lang: Lang): void {
  if (!getSettings().voiceOutput) return;
  if (!("speechSynthesis" in window) || !text.trim()) return;
  // Keep spoken output short — never read whole documents aloud.
  const short = text.length > 320 ? text.slice(0, 320) + "…" : text;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(short);
  u.lang = lang === "he" ? "he-IL" : "en-US";
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
