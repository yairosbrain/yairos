import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { createPushToTalk, sttSupported, type PushToTalk } from "../voice/stt";
import { stopSpeaking } from "../voice/tts";
import { useOrchestrator } from "../core/orchestrator";
import { useWm } from "../os/WindowManager";
import { runCommand } from "../os/commands";

// The system prompt line. It is a shell first and a chat second: input that
// parses as a command runs locally and for free; everything else goes to the
// brain. Voice always goes to the brain — you don't dictate `ls`.

export default function AskBar({ projectId }: { projectId?: string }) {
  const { t, lang } = useI18n();
  const { ask, busy } = useOrchestrator();
  const wm = useWm();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  /** Where Up/Down currently sit in `history`; null = at the live prompt */
  const histIdx = useRef<number | null>(null);
  const pttRef = useRef<PushToTalk | null>(null);
  const supported = sttSupported();
  const opts = projectId ? { projectId } : undefined;

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText("");
    setHistory((prev) => [...prev.slice(-49), v]);
    histIdx.current = null;
    // Shell first — a handled command never reaches (or costs) the brain
    if (runCommand(v, wm, t).handled) return;
    void ask(v, opts);
  };

  /** Up/Down walk the command history, the way a real shell does */
  const recall = (dir: -1 | 1) => {
    if (!history.length) return;
    const cur = histIdx.current;
    let next: number | null;
    if (dir === -1) {
      next = cur === null ? history.length - 1 : Math.max(0, cur - 1);
    } else {
      if (cur === null) return;
      // Walking past the newest entry returns to an empty prompt
      next = cur + 1 > history.length - 1 ? null : cur + 1;
    }
    histIdx.current = next;
    setText(next === null ? "" : history[next]);
  };

  const startMic = () => {
    if (!supported || listening) return;
    stopSpeaking();
    pttRef.current = createPushToTalk(
      lang,
      (interim) => setText(interim),
      (finalText) => {
        setText("");
        void ask(finalText, opts);
      },
      setListening
    );
    pttRef.current?.start();
  };

  const stopMic = () => pttRef.current?.stop();

  const cancelMic = () => {
    pttRef.current?.cancel();
    setText("");
  };

  // Tap toggles the mic on/off (mobile-friendly); Space is still hold-to-talk
  const toggleMic = () => {
    if (listening) stopMic();
    else startMic();
  };

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
        title={
          !supported
            ? t("mic.unsupported")
            : listening
              ? t("ask.stopMic")
              : t("ask.holdMic")
        }
        onClick={toggleMic}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!supported}
        aria-label={listening ? t("ask.stopMic") : t("ask.holdMic")}
      >
        {listening ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M5 11a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5Z" />
            <path d="M11 18h2v3h-2z" />
          </svg>
        )}
      </button>
      {listening && (
        <button
          type="button"
          className="mic-cancel"
          onClick={cancelMic}
          title={t("ask.cancelMic")}
          aria-label={t("ask.cancelMic")}
        >
          ✕
        </button>
      )}
      <div className="ask-shell">
        <span className="ask-prompt" aria-hidden>
          {listening ? "◉" : "$"}
        </span>
        <input
          className="ask-input"
          value={listening ? text || t("ask.listening") : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") return submit(text);
            if (e.key === "ArrowUp") {
              e.preventDefault();
              return recall(-1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              return recall(1);
            }
          }}
          placeholder={busy ? t("status.thinking") : t("ask.placeholder")}
          readOnly={listening}
        />
      </div>
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
