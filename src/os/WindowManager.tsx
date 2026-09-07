import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { APPS, appById, DASH_APPS, type AppId } from "./apps";

// The window manager. Desktop gets real floating windows; phones get a
// single full-screen window at a time with the dock as the switcher —
// same state, two layouts, so every app is written once.

export interface WinState {
  id: string;
  app: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

export interface WmApi {
  windows: WinState[];
  focusedId: string | null;
  isMobile: boolean;
  /** Ephemeral shell output — local only, never sent to the brain or Convex */
  console: string[];
  open(app: AppId): void;
  close(id: string): void;
  closeApp(app: AppId): boolean;
  closeAll(): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, w: number, h: number): void;
  tile(): void;
  dash(): void;
  startx(): void;
  appList(): { command: string; ready: boolean }[];
  /** Open the Projects window and ask it to jump straight into one project's chat */
  openProjectChat(id: string): void;
  /** Projects window calls this once to read & clear a pending jump */
  consumeProjectChat(): string | null;
  echo(...lines: string[]): void;
  clearConsole(): void;
}

const Ctx = createContext<WmApi>(null!);
export function useWm() {
  return useContext(Ctx);
}

const MOBILE_MAX = 820;
const STORE_KEY = "yairos.windows";
/** Height of the top bar — windows are positioned inside the desktop below it */
const GAP = 10;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

function loadWindows(): WinState[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WinState[];
    return Array.isArray(parsed) ? parsed.filter((w) => w && w.app) : [];
  } catch {
    return [];
  }
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [windows, setWindows] = useState<WinState[]>(() => {
    const saved = loadWindows();
    return saved.length ? saved : [];
  });
  const [focusedId, setFocusedId] = useState<string | null>(
    () => loadWindows().slice(-1)[0]?.id ?? null
  );
  const [consoleLines, setConsoleLines] = useState<string[]>([]);

  // Focus has to be decided OUTSIDE the setWindows updater. Updaters must stay
  // pure: React invokes them twice in StrictMode, so an id minted inside one
  // would differ from the id that actually landed in state, and focusedId would
  // point at a window that never existed.
  const windowsRef = useRef<WinState[]>(windows);
  windowsRef.current = windows;

  // Remember the session's layout, so a reload lands you back where you were
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(windows));
    } catch {
      /* storage full — layout just won't persist */
    }
  }, [windows]);

  const topZ = useCallback(
    (list: WinState[]) => list.reduce((m, w) => Math.max(m, w.z), 0),
    []
  );

  const focus = useCallback((id: string) => {
    setFocusedId(id);
    setWindows((prev) => {
      const max = prev.reduce((m, w) => Math.max(m, w.z), 0);
      const target = prev.find((w) => w.id === id);
      if (!target || target.z === max) {
        return target?.minimized
          ? prev.map((w) => (w.id === id ? { ...w, minimized: false } : w))
          : prev;
      }
      return prev.map((w) =>
        w.id === id ? { ...w, z: max + 1, minimized: false } : w
      );
    });
  }, []);

  const open = useCallback(
    (app: AppId) => {
      const prev = windowsRef.current;
      const max = topZ(prev);

      // One instance per app — reopening just focuses and unminimises it
      const existing = prev.find((w) => w.app === app);
      if (existing) {
        setWindows((list) =>
          list.map((w) =>
            w.id === existing.id ? { ...w, z: max + 1, minimized: false } : w
          )
        );
        setFocusedId(existing.id);
        return;
      }

      const def = appById(app);
      const id = uid();
      // Cascade new windows so they never land exactly on top of each other
      const step = prev.length % 6;
      const win: WinState = {
        id,
        app,
        x: 40 + step * 26,
        y: 30 + step * 22,
        w: def.size.w,
        h: def.size.h,
        z: max + 1,
        minimized: false,
        maximized: false
      };
      // Append against the freshest list, so rapid opens (startx) don't drop one
      setWindows((list) =>
        list.some((w) => w.app === app) ? list : [...list, win]
      );
      setFocusedId(id);
    },
    [topZ]
  );

  const close = useCallback((id: string) => {
    const next = windowsRef.current.filter((w) => w.id !== id);
    setWindows(next);
    setFocusedId((cur) =>
      cur === id ? (next.length ? next[next.length - 1].id : null) : cur
    );
  }, []);

  const closeApp = useCallback((app: AppId) => {
    const target = windowsRef.current.find((w) => w.app === app);
    if (!target) return false;
    close(target.id);
    return true;
  }, [close]);

  const closeAll = useCallback(() => {
    setWindows([]);
    setFocusedId(null);
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, minimized: true } : w))
    );
    setFocusedId((cur) => (cur === id ? null : cur));
  }, []);

  const toggleMax = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w))
    );
  }, []);

  const move = useCallback((id: string, x: number, y: number) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  }, []);

  const resize = useCallback((id: string, w: number, h: number) => {
    setWindows((prev) =>
      prev.map((win) => (win.id === id ? { ...win, w, h } : win))
    );
  }, []);

  /** Arrange every open window in a grid that fills the desktop */
  const tile = useCallback(() => {
    setWindows((prev) => {
      const live = prev.filter((w) => !w.minimized);
      if (!live.length) return prev;
      const host = document.querySelector(".desktop");
      const W = (host?.clientWidth ?? window.innerWidth) - GAP;
      const H = (host?.clientHeight ?? window.innerHeight) - GAP;
      const cols = Math.ceil(Math.sqrt(live.length));
      const rows = Math.ceil(live.length / cols);
      const cw = Math.floor(W / cols) - GAP;
      const ch = Math.floor(H / rows) - GAP;
      const placed = new Map<string, Partial<WinState>>();
      live.forEach((w, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        placed.set(w.id, {
          x: GAP + c * (cw + GAP),
          y: GAP + r * (ch + GAP),
          w: cw,
          h: ch,
          maximized: false
        });
      });
      return prev.map((w) => ({ ...w, ...(placed.get(w.id) ?? {}) }));
    });
  }, []);

  const pendingChatRef = useRef<string | null>(null);
  const openProjectChat = useCallback(
    (id: string) => {
      pendingChatRef.current = id;
      open("projects");
    },
    [open]
  );
  const consumeProjectChat = useCallback(() => {
    const id = pendingChatRef.current;
    pendingChatRef.current = null;
    return id;
  }, []);

  const echo = useCallback((...lines: string[]) => {
    setConsoleLines((prev) => [...prev.slice(-60), ...lines]);
  }, []);

  const clearConsole = useCallback(() => setConsoleLines([]), []);

  /**
   * The standard multi-window layout. A phone shows one window at a time, so
   * opening a wall of them there just buries the dock — it gets the terminal
   * and nothing else.
   */
  const dash = useCallback(() => {
    if (isMobile) {
      open("term");
      return;
    }
    DASH_APPS.forEach((a) => open(a));
    // Let the opens commit before measuring the desktop for the grid
    setTimeout(() => tile(), 0);
  }, [open, tile, isMobile]);

  /**
   * The full cold start: every built app comes up one after another, then the
   * whole desktop tiles. Staggered so it reads as a machine booting rather
   * than everything blinking into place at once.
   */
  const startx = useCallback(() => {
    // Same reasoning as dash: on a phone a full cold start is nine windows
    // you cannot see at once, so bring up the shell and stop there.
    if (isMobile) {
      open("shell");
      return;
    }
    const ready = APPS.filter((a) => a.ready);
    ready.forEach((a, i) => {
      setTimeout(() => {
        open(a.id);
        if (i === ready.length - 1) setTimeout(() => tile(), 160);
      }, i * 260);
    });
  }, [open, tile, isMobile]);

  const appList = useCallback(
    () => APPS.map((a) => ({ command: a.command, ready: a.ready })),
    []
  );

  const value = useMemo<WmApi>(
    () => ({
      windows,
      focusedId,
      isMobile,
      console: consoleLines,
      open,
      close,
      closeApp,
      closeAll,
      focus,
      minimize,
      toggleMax,
      move,
      resize,
      tile,
      dash,
      startx,
      appList,
      openProjectChat,
      consumeProjectChat,
      echo,
      clearConsole
    }),
    [
      windows,
      focusedId,
      isMobile,
      consoleLines,
      open,
      close,
      closeApp,
      closeAll,
      focus,
      minimize,
      toggleMax,
      move,
      resize,
      tile,
      dash,
      startx,
      appList,
      openProjectChat,
      consumeProjectChat,
      echo,
      clearConsole
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
