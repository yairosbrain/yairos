import { useI18n } from "../i18n";
import { APPS, type AppId } from "./apps";
import { useWm } from "./WindowManager";

// The dock doubles as a launcher and a task switcher: closed apps launch,
// open ones focus, and the focused one minimises back. On phones this is
// the only way to move between windows, so open apps sort first.

export default function Dock() {
  const { t } = useI18n();
  const { windows, focusedId, isMobile, open, focus, minimize } = useWm();

  const openApps = windows.map((w) => w.app);
  const listed = isMobile
    ? [...APPS].sort((a, b) => {
        const ao = openApps.includes(a.id) ? 0 : 1;
        const bo = openApps.includes(b.id) ? 0 : 1;
        return ao - bo;
      })
    : APPS;

  return (
    <nav className="dock" aria-label={t("dock.label")}>
      {listed.map((app) => {
        const win = windows.find((w) => w.app === app.id);
        const isFocused = !!win && win.id === focusedId && !win.minimized;
        return (
          <button
            key={app.id}
            className={`dock-btn ${win ? "running" : ""} ${
              isFocused ? "on" : ""
            } ${app.ready ? "" : "pending"}`}
            title={
              app.ready
                ? t(app.titleKey)
                : `${t(app.titleKey)} — ${t("cmd.notReady")}`
            }
            onClick={() => {
              if (!app.ready) return;
              if (!win) return open(app.id);
              if (isFocused) return minimize(win.id);
              focus(win.id);
            }}
            disabled={!app.ready}
          >
            <span className="dock-ico" aria-hidden>
              {app.icon}
            </span>
            <span className="dock-name">{t(app.titleKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Shown on the empty desktop — the first thing a new user reads */
export function DesktopHint() {
  const { t } = useI18n();
  const { open } = useWm();
  return (
    <div className="desktop-hint">
      {/* Deliberately backslash-free — escapes inside a template literal eat them */}
      <pre className="hint-art" dir="ltr">{`Y   Y   AAA   III  RRRR    OOO    SSSS
 Y Y   A   A   I   R   R  O   O  S
  Y    AAAAA   I   RRRR   O   O   SSS
  Y    A   A   I   R  R   O   O      S
  Y    A   A  III  R   R   OOO   SSSS`}</pre>
      <p className="hint-line">{t("desktop.hint")}</p>
      <div className="hint-cmds">
        {(["term", "ops", "galaxy"] as AppId[]).map((c) => (
          <button key={c} className="hint-cmd" onClick={() => open(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
