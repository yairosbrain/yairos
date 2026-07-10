import { useMemo, useState } from "react";
import { getSettings, patchSettings } from "../data/localSettings";
import { useI18n } from "../i18n";
import { useData } from "../data/store";
import { askBrain } from "../brain";
import { downloadLogo, logoDataUrl } from "./logo";
import type { BrainProviderId, DeviceSettings } from "../types";

export default function SettingsScreen() {
  const { t, setLang, lang } = useI18n();
  const data = useData();
  const [s, setS] = useState<DeviceSettings>(getSettings());
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | string>("idle");
  const logoPreview = useMemo(() => logoDataUrl(512), []);

  const update = (patch: Partial<DeviceSettings>) => {
    setS(patchSettings(patch));
  };

  const testBrain = async () => {
    setTestState("testing");
    try {
      await askBrain([
        { role: "user", content: "Reply with the single word: OK" }
      ]);
      setTestState("ok");
    } catch (e) {
      setTestState(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="screen settings">
      <h2>{t("settings.title")}</h2>

      <section>
        <label className="field-label">{t("settings.language")}</label>
        <div className="seg">
          <button
            className={lang === "he" ? "on" : ""}
            onClick={() => {
              update({ language: "he" });
              setLang("he");
            }}
          >
            עברית
          </button>
          <button
            className={lang === "en" ? "on" : ""}
            onClick={() => {
              update({ language: "en" });
              setLang("en");
            }}
          >
            English
          </button>
        </div>
      </section>

      <section>
        <label className="field-label">{t("settings.voice")}</label>
        <div className="seg">
          <button className={s.voiceOutput ? "on" : ""} onClick={() => update({ voiceOutput: true })}>
            ON
          </button>
          <button className={!s.voiceOutput ? "on" : ""} onClick={() => update({ voiceOutput: false })}>
            OFF
          </button>
        </div>
      </section>

      <section>
        <label className="field-label">{t("settings.brain")}</label>
        {(["puter", "gemini", "claude"] as BrainProviderId[]).map((p) => (
          <label key={p} className="radio-row">
            <input
              type="radio"
              name="brain"
              checked={s.brainProvider === p}
              onChange={() => update({ brainProvider: p })}
            />
            <span>{t(`settings.brain.${p}`)}</span>
          </label>
        ))}
        {s.brainProvider === "puter" && (
          <div className="field">
            <label>{t("settings.puterModel")}</label>
            <input
              value={s.puterModel}
              onChange={(e) => update({ puterModel: e.target.value })}
              dir="ltr"
            />
          </div>
        )}
        {s.brainProvider === "gemini" && (
          <div className="field">
            <label>{t("settings.geminiKey")}</label>
            <input
              type="password"
              value={s.geminiKey}
              onChange={(e) => update({ geminiKey: e.target.value })}
              dir="ltr"
              autoComplete="off"
            />
          </div>
        )}
        {s.brainProvider === "claude" && (
          <div className="field">
            <label>{t("settings.claudeKey")}</label>
            <input
              type="password"
              value={s.claudeKey}
              onChange={(e) => update({ claudeKey: e.target.value })}
              dir="ltr"
              autoComplete="off"
            />
          </div>
        )}
        <button className="test-btn" onClick={() => void testBrain()} disabled={testState === "testing"}>
          {testState === "testing" ? t("settings.testing") : t("settings.testBrain")}
        </button>
        {testState === "ok" && <div className="test-ok">{t("settings.brainOk")}</div>}
        {testState !== "idle" && testState !== "testing" && testState !== "ok" && (
          <div className="test-fail">
            {t("settings.brainFail")}
            {testState}
          </div>
        )}
      </section>

      <section>
        <label className="field-label">{t("settings.githubToken")}</label>
        <div className="field">
          <input
            type="password"
            value={s.githubToken}
            onChange={(e) => update({ githubToken: e.target.value })}
            dir="ltr"
            autoComplete="off"
            placeholder="github_pat_… / ghp_…"
          />
        </div>
        <p className="help">{t("settings.githubToken.help")}</p>
        <div className="field">
          <label>{t("settings.githubOwner")}</label>
          <input
            value={s.githubOwner}
            onChange={(e) => update({ githubOwner: e.target.value })}
            dir="ltr"
          />
        </div>
      </section>

      <section>
        <label className="field-label">{t("settings.logo")}</label>
        <img className="logo-preview" src={logoPreview} alt="Y.A.I.R.O.S" />
        <button className="test-btn" onClick={() => downloadLogo(1024)}>
          {t("settings.logoDownload")}
        </button>
        <p className="help">{t("settings.logo.help")}</p>
      </section>

      <section>
        <label className="field-label">{t("settings.convex")}</label>
        <p className={`convex-status ${data.mode}`}>
          {data.mode === "convex" ? t("settings.convex.on") : t("settings.convex.off")}
        </p>
      </section>

      <p className="help security-note">🔒 {t("settings.keysLocal")}</p>
    </div>
  );
}
