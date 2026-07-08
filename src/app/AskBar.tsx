import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { createPushToTalk, sttSupported, type PushToTalk } from "../voice/stt";
import { stopSpeaking } from "../voice/tts";
import { useOrchestrator } from "../core/orchestrator";

// The "Ask Yairos…" bar: text input + push-to-talk mic + ASK button.
// The mic listens ONLY while held (button or Space on desktop).

export default function AskBar() {
  const { t, lang } = useI18n();
  const { ask, busy } = useOrchestrator();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const pttRef = useRef<PushToTalk | null>(null);
  const supported = sttSupported();

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText("");
    void ask(v);
  };

  const startMic = () => {
    if (!supported || listening) return;
    stopSpeaking();
    pttRef.current = createPushToTalk(
      lang,
      (interim) => setText(interim),
      (finalText) => {
        setText("");
        void ask(finalText);
      },
      setListening
    );
    pttRef.current?.start();
  };

  const stopMic = () => pttRef.current?.stop();

  // Hold Space to talk on desktop (only when not typing in a field)
  useEffect(() => {
    if (!supported) return;
    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping()) {
        e.preventDefault();
        startMic();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault();
        stopMic();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, lang, listening]);

  return (
    <div className="askbar">
      <button
        type="button"
        className={`mic ${listening ? "listening" : ""} ${!supported ? "disabled" : ""}`}
        title={supported ? t("ask.holdMic") : t("mic.unsupported")}
        onPointerDown={(e) => {
          e.preventDefault();
          startMic();
        }}
        onPointerUp={stopMic}
        onPointerLeave={stopMic}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!supported}
        aria-label={t("ask.holdMic")}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
          <path d="M5 11a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5Z" />
          <path d="M11 18h2v3h-2z" />
        </svg>
      </button>
      <input
        className="ask-input"
        value={listening ? text || t("ask.listening") : text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(text);
        }}
        placeholder={busy ? t("status.thinking") : t("ask.placeholder")}
        readOnly={listening}
      />
      <button
        type="button"
        className="ask-btn"
        onClick={() => submit(text)}
        disabled={busy || !text.trim()}
      >
        {t("ask.button")}
      </button>
    </div>
  );
}
