import type { Lang } from "../types";

// Web Speech API — SpeechRecognition. Push-to-talk only:
// we listen exactly while the mic button is held. Zero background listening.

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as new () => RecognitionLike) ||
    (w.webkitSpeechRecognition as new () => RecognitionLike) ||
    null
  );
}

export function sttSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface PushToTalk {
  start(): void;
  stop(): void;
  cancel(): void;
}

export function createPushToTalk(
  lang: Lang,
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onStateChange: (listening: boolean) => void
): PushToTalk | null {
  const CtorMaybe = getRecognitionCtor();
  if (!CtorMaybe) return null;
  const Ctor = CtorMaybe;

  let rec: RecognitionLike | null = null;
  let finalText = "";
  let wantResult = true;

  function start() {
    finalText = "";
    wantResult = true;
    rec = new Ctor();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim((finalText + " " + interim).trim());
    };
    rec.onerror = () => {
      /* aborted / no-speech — handled by onend */
    };
    rec.onend = () => {
      onStateChange(false);
      const text = finalText.trim();
      if (wantResult && text) onFinal(text);
      rec = null;
    };
    try {
      rec.start();
      onStateChange(true);
    } catch {
      onStateChange(false);
    }
  }

  function stop() {
    rec?.stop();
  }

  function cancel() {
    wantResult = false;
    rec?.abort();
  }

  return { start, stop, cancel };
}
