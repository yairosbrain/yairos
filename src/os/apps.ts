// The registry of everything that can live in a window.
// Adding a new department screen = one entry here + one case in <WindowBody>.

export type AppId =
  | "term"
  | "galaxy"
  | "projects"
  | "settings"
  | "ops"
  | "brain"
  | "globe"
  | "net";

export interface AppDef {
  id: AppId;
  /** What you type at the prompt to open it */
  command: string;
  /** i18n key for the window title */
  titleKey: string;
  icon: string;
  /** Opening size on desktop, in px */
  size: { w: number; h: number };
  /** false = registered and listed, but not implemented yet */
  ready: boolean;
}

export const APPS: AppDef[] = [
  {
    id: "term",
    command: "term",
    titleKey: "app.term",
    icon: "▮",
    size: { w: 620, h: 460 },
    ready: true
  },
  {
    id: "galaxy",
    command: "galaxy",
    titleKey: "app.galaxy",
    icon: "✦",
    size: { w: 640, h: 520 },
    ready: true
  },
  {
    id: "ops",
    command: "ops",
    titleKey: "app.ops",
    icon: "▤",
    size: { w: 720, h: 440 },
    ready: true
  },
  {
    id: "projects",
    command: "projects",
    titleKey: "app.projects",
    icon: "◰",
    size: { w: 560, h: 460 },
    ready: true
  },
  {
    id: "settings",
    command: "settings",
    titleKey: "app.settings",
    icon: "⚙",
    size: { w: 560, h: 520 },
    ready: true
  },
  {
    id: "brain",
    command: "brain",
    titleKey: "app.brain",
    icon: "◉",
    size: { w: 640, h: 520 },
    ready: false
  },
  {
    id: "globe",
    command: "globe",
    titleKey: "app.globe",
    icon: "◍",
    size: { w: 680, h: 520 },
    ready: false
  },
  {
    id: "net",
    command: "net",
    titleKey: "app.net",
    icon: "⇅",
    size: { w: 600, h: 440 },
    ready: false
  }
];

export function appById(id: AppId): AppDef {
  return APPS.find((a) => a.id === id)!;
}

export function appByCommand(cmd: string): AppDef | undefined {
  const c = cmd.trim().toLowerCase();
  return APPS.find((a) => a.command === c || a.id === c);
}

/** Windows opened by `dash` — the "several screens at once" layout */
export const DASH_APPS: AppId[] = ["term", "ops", "galaxy"];
