import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { speak } from "../voice/tts";

// Written like a real init log: every line is a unit that came up.
const BOOT_LINES = [
  "[  OK  ] Started  yairos-core.service",
  "[  OK  ] Mounted  /brain  (provider uplink)",
  "[  OK  ] Reached  target  Knowledge Galaxy — 8 nodes / 13 links",
  "[  OK  ] Started  departments.target  (web factory)",
  "[  OK  ] Started  speech-synthesis.service",
  "[  OK  ] Listening on  audio-sensors.socket",
  "[  OK  ] Started  conversation-memory.service"
];

export default function BootScreen({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= BOOT_LINES.length) return;
    const id = setTimeout(() => setVisible((v) => v + 1), 260);
    return () => clearTimeout(id);
  }, [visible]);

  const ready = visible >= BOOT_LINES.length;

  return (
    <div className="boot" dir="ltr">
      <h1 className="boot-title">Y.A.I.R.O.S</h1>
      <div className="boot-lines">
        {BOOT_LINES.slice(0, visible).map((l) => (
          <div key={l} className="boot-line">
            <span className="boot-ok">{l.slice(0, 8)}</span>
            {l.slice(8)}
          </div>
        ))}
        {!ready && <div className="boot-line caret" />}
      </div>
      <button
        className={`boot-init ${ready ? "ready" : ""}`}
        disabled={!ready}
        onClick={() => {
          // A user gesture is required before speechSynthesis works — perfect spot
          speak(t("boot.greeting"), lang);
          onDone();
        }}
      >
        [ {t("initialize")} ]
      </button>
    </div>
  );
}
