import { useCallback, useEffect, useRef, useState } from "react";
import { useWm } from "../os/WindowManager";
import { useData } from "../data/store";
import {
  applyCompletion,
  execute,
  hasCustomPass,
  newEnv,
  type ShellEnv,
  type ShellHost
} from "../os/shell";
import {
  addFolder,
  loadFolders,
  removeFolder,
  toShellProjects
} from "../os/projectFs";
import { loadVfs } from "../os/vfs";
import { appByCommand } from "../os/apps";
import { askBrain } from "../brain";

const HIST_KEY = "yairos.shellhistory";
const HIST_MAX = 500;

function loadHistory(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
    return Array.isArray(a) ? a.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// The interactive shell. Its own prompt, its own history, its own filesystem —
// separate from the chat bar at the bottom, which talks to the brain.

interface Line {
  id: number;
  text: string;
  kind: "in" | "out";
}

let lineId = 0;

const BANNER = [
  "ybash 2.0 — YAIROS shell (browser-sandboxed)",
  "type `help` for commands, `man bash` for how a shell works",
  ""
];

export default function ShellScreen() {
  const wm = useWm();
  const data = useData();
  const dataRef = useRef(data);
  dataRef.current = data;
  const [lines, setLines] = useState<Line[]>(
    BANNER.map((t) => ({ id: lineId++, text: t, kind: "out" as const }))
  );
  const [input, setInput] = useState("");
  // History persists across sessions, like ~/.bash_history
  const [history, setHistory] = useState<string[]>(loadHistory);
  const historyRef = useRef<string[]>([]);
  historyRef.current = history;
  const histIdx = useRef<number | null>(null);
  const envRef = useRef<ShellEnv>(null!);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, forceRender] = useState(0);

  if (!envRef.current) {
    const env = newEnv();
    env.tree = loadVfs();
    envRef.current = env;
  }

  const out = useCallback((...text: string[]) => {
    setLines((prev) => [
      ...prev.slice(-400),
      ...text.map((t) => ({ id: lineId++, text: t, kind: "out" as const }))
    ]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const host: ShellHost = {
    out,
    history: () => historyRef.current,
    ask: (question) => askBrain([{ role: "user", content: question }]),
    wm: {
      open: (app) => {
        const def = appByCommand(app);
        if (!def) return out(`open: no app called ${app}`);
        if (!def.ready) return out(`open: ${app} is not built yet`);
        wm.open(def.id);
      },
      close: (app) => {
        const def = appByCommand(app);
        return def ? wm.closeApp(def.id) : false;
      },
      tile: () => wm.tile(),
      dash: () => wm.dash(),
      startx: () => wm.startx(),
      list: () => wm.windows.map((w) => ({ app: w.app, minimized: w.minimized })),
      apps: () => wm.appList()
    },
    projects: {
      list: () => toShellProjects(dataRef.current.projects),
      folders: () => loadFolders(),
      addFolder: (name) => addFolder(name),
      removeFolder: (name) => {
        const used = dataRef.current.projects.some(
          (p) => (p as { folder?: string }).folder === name
        );
        return removeFolder(name, !used);
      },
      move: (id, folder) => {
        void dataRef.current.updateProject(id, { folder: folder ?? "" });
      },
      openChat: (id) => {
        wm.openProjectChat(id);
      }
    }
  };

  const submit = async () => {
    const env = envRef.current;
    const raw = input;
    setInput("");
    histIdx.current = null;

    // A masked prompt echoes asterisks, never the secret itself
    const echo = env.pending?.masked ? "*".repeat(raw.length) : raw;
    const prompt = env.pending
      ? ""
      : `${env.root ? "root" : "yair"}@yairos:${env.cwd}${env.root ? "#" : "$"} `;
    setLines((prev) => [
      ...prev.slice(-400),
      { id: lineId++, text: prompt + echo, kind: "in" as const }
    ]);

    // Record real commands to persistent history (skip masked input and
    // an immediate repeat, the way bash's HISTCONTROL=ignoredups does)
    if (!env.pending && raw.trim() && historyRef.current[historyRef.current.length - 1] !== raw) {
      setHistory((h) => {
        const next = [...h, raw].slice(-HIST_MAX);
        try {
          localStorage.setItem(HIST_KEY, JSON.stringify(next));
        } catch {
          /* quota — history stays in memory this session */
        }
        return next;
      });
    }
    if (!env.pending && raw.trim() === "clear") {
      setLines([]);
      return;
    }

    try {
      await execute(raw, env, host);
    } catch (e) {
      out(`ybash: ${e instanceof Error ? e.message : String(e)}`);
    }
    forceRender((n) => n + 1);
  };

  const recall = (dir: -1 | 1) => {
    if (!history.length) return;
    const cur = histIdx.current;
    let next: number | null;
    if (dir === -1) next = cur === null ? history.length - 1 : Math.max(0, cur - 1);
    else {
      if (cur === null) return;
      next = cur + 1 > history.length - 1 ? null : cur + 1;
    }
    histIdx.current = next;
    setInput(next === null ? "" : history[next]);
  };

  const env = envRef.current;
  const masked = !!env.pending?.masked;
  const shippedPass = !hasCustomPass();

  const promptStr = () =>
    `${env.root ? "root" : "yair"}@yairos:${env.cwd}${env.root ? "#" : "$"} `;

  const onTab = () => {
    if (masked) return;
    const { line, list } = applyCompletion(input, env, host);
    if (line !== undefined) {
      setInput(line);
    } else if (list) {
      // Bash prints the options and keeps your input
      setLines((prev) => [
        ...prev.slice(-400),
        { id: lineId++, text: promptStr() + input, kind: "in" as const },
        { id: lineId++, text: list.join("  "), kind: "out" as const }
      ]);
    }
  };

  return (
    <div
      className="shell-screen"
      dir="ltr"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="shell-lines">
        {lines.map((l) => (
          <div key={l.id} className={`sh-line ${l.kind}`}>
            {l.text || " "}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shell-prompt">
        {!masked && (
          <span className="sh-ps1">
            <span className={env.root ? "sh-root" : "sh-user"}>
              {env.root ? "root" : "yair"}
            </span>
            <span className="sh-dim">@yairos:</span>
            <span className="sh-path">{env.cwd}</span>
            <span className={env.root ? "sh-root" : "sh-user"}>
              {env.root ? "#" : "$"}
            </span>
          </span>
        )}
        {masked && <span className="sh-ps1 sh-dim">password:</span>}
        <input
          ref={inputRef}
          className="sh-input"
          type={masked ? "password" : "text"}
          value={input}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") return void submit();
            if (e.key === "Tab") {
              e.preventDefault();
              return onTab();
            }
            if ((e.key === "l" || e.key === "L") && e.ctrlKey) {
              e.preventDefault();
              return setLines([]);
            }
            if (e.key === "ArrowUp" && !masked) {
              e.preventDefault();
              return recall(-1);
            }
            if (e.key === "ArrowDown" && !masked) {
              e.preventDefault();
              return recall(1);
            }
          }}
        />
      </div>

      {shippedPass && (
        <div className="shell-tip">
          using the shipped master password · <code>su</code> for root ·{" "}
          <code>passwd</code> to set your own on this device
        </div>
      )}
    </div>
  );
}
