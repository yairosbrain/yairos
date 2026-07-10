import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { speak } from "../voice/tts";

const BOOT_LINES = [
  "> YAIROS CORE ............... ONLINE",
  "> NEURAL LATTICE ............ CALIBRATED",
  "> KNOWLEDGE GALAXY .......... 7 NODES / 12 LINKS",
  "> DOMAINS ................... WEB FACTORY",
  "> SPEECH SYNTHESIS .......... READY",
  "> AUDIO SENSORS ............. STANDING BY",
  "> UPLINK — BRAIN ............ SECURE"
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
            {l}
          </div>
        ))}
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
