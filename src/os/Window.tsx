import { useCallback, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { appById } from "./apps";
import { useWm, type WinState } from "./WindowManager";

// A single window frame. The title bar is a drag handle on desktop;
// on mobile the frame is chrome-only (the window fills the desktop area).

const MIN_W = 280;
const MIN_H = 180;

export default function Window({
  win,
  children
}: {
  win: WinState;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { focusedId, isMobile, focus, close, minimize, toggleMax, move, resize } =
    useWm();
  const def = appById(win.app);
  const focused = focusedId === win.id;
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const sizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null
  );

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      focus(win.id);
      if (isMobile || win.maximized) return;
      // Ignore drags that start on the control buttons
      if ((e.target as HTMLElement).closest(".win-btn")) return;
      const host = (e.currentTarget as HTMLElement).closest(".window")!
        .parentElement as HTMLElement;
      const hostBox = host.getBoundingClientRect();
      dragRef.current = {
        dx: e.clientX - hostBox.left - win.x,
        dy: e.clientY - hostBox.top - win.y
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [focus, isMobile, win.id, win.maximized, win.x, win.y]
  );

  const onTitlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const host = (e.currentTarget as HTMLElement).closest(".window")!
        .parentElement as HTMLElement;
      const hostBox = host.getBoundingClientRect();
      const x = e.clientX - hostBox.left - d.dx;
      const y = e.clientY - hostBox.top - d.dy;
      // Keep at least a strip of the title bar reachable
      move(
        win.id,
        Math.min(Math.max(x, -win.w + 90), hostBox.width - 60),
        Math.min(Math.max(y, 0), hostBox.height - 34)
      );
    },
    [move, win.id, win.w]
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      focus(win.id);
      sizeRef.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [focus, win.id, win.w, win.h]
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = sizeRef.current;
      if (!s) return;
      resize(
        win.id,
        Math.max(MIN_W, s.w + (e.clientX - s.x)),
        Math.max(MIN_H, s.h + (e.clientY - s.y))
      );
    },
    [resize, win.id]
  );

  const endResize = useCallback((e: React.PointerEvent) => {
    sizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  const style =
    isMobile || win.maximized
      ? undefined
      : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      className={`window ${focused ? "focused" : ""} ${
        win.maximized ? "maximized" : ""
      }`}
      style={style}
      onPointerDown={() => focus(win.id)}
      role="dialog"
      aria-label={t(def.titleKey)}
    >
      <div
        className="win-title"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => !isMobile && toggleMax(win.id)}
      >
        <span className="win-ico" aria-hidden>
          {def.icon}
        </span>
        <span className="win-name">{t(def.titleKey)}</span>
        <span className="win-cmd" aria-hidden>
          {def.command}
        </span>
        <span className="win-controls">
          <button
            className="win-btn"
            onClick={() => minimize(win.id)}
            title={t("win.minimize")}
            aria-label={t("win.minimize")}
          >
            _
          </button>
          {!isMobile && (
            <button
              className="win-btn"
              onClick={() => toggleMax(win.id)}
              title={t("win.maximize")}
              aria-label={t("win.maximize")}
            >
              □
            </button>
          )}
          <button
            className="win-btn danger"
            onClick={() => close(win.id)}
            title={t("win.close")}
            aria-label={t("win.close")}
          >
            ×
          </button>
        </span>
      </div>

      <div className="win-body">{children}</div>

      {!isMobile && !win.maximized && (
        <div
          className="win-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-hidden
        />
      )}
    </div>
  );
}
