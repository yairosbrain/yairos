import { useCallback, useEffect, useRef, useState } from "react";
import { useWm } from "../os/WindowManager";
import { execute, loadRootPass, newEnv, type ShellEnv, type ShellHost } from "../os/shell";
import { loadVfs } from "../os/vfs";
import { appByCommand } from "../os/apps";

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
  const [lines, setLines] = useState<Line[]>(
    BANNER.map((t) => ({ id: lineId++, text: t, kind: "out" as const }))
  );
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
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

    if (!env.pending && raw.trim()) {
      setHistory((h) => [...h.slice(-99), raw]);
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
  const hasPass = !!loadRootPass();

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

      {!hasPass && (
        <div className="shell-tip">
          no root password set — run <code>passwd</code> to choose one, then{" "}
          <code>su</code>
        </div>
      )}
    </div>
  );
}
