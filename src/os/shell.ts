import {
  HOME,
  baseName,
  getNode,
  isDir,
  isFile,
  makeDir,
  needsRoot,
  parentOf,
  removeNode,
  resetVfs,
  resolvePath,
  saveVfs,
  writeFile,
  type VDir,
  type VNode
} from "./vfs";
import {
  decryptText,
  digest,
  encryptText,
  hashPassphrase,
  isEncrypted,
  verifyPassphrase,
  type StoredPassphrase
} from "./crypto";

// A small POSIX-flavoured shell over the virtual filesystem: word splitting
// with quotes, pipes, and output redirection, so what you learn here is what
// a real shell actually does.

const PASS_KEY = "yairos.rootpass";

export interface ShellEnv {
  cwd: string;
  root: boolean;
  tree: VDir;
  /** Pending interactive prompt, e.g. the password `su` is waiting for */
  pending: PendingPrompt | null;
}

export interface PendingPrompt {
  kind: "su" | "passwd-new" | "passwd-confirm";
  masked: true;
  /** Carried between the two steps of setting a password */
  draft?: string;
}

export interface ShellHost {
  /** Print lines to the terminal */
  out(...lines: string[]): void;
  /** Ask the window manager to do something */
  wm: {
    open(app: string): void;
    close(app: string): boolean;
    tile(): void;
    dash(): void;
    startx(): void;
    list(): { app: string; minimized: boolean }[];
    apps(): { command: string; ready: boolean }[];
  };
}

export function loadRootPass(): StoredPassphrase | null {
  try {
    const raw = localStorage.getItem(PASS_KEY);
    return raw ? (JSON.parse(raw) as StoredPassphrase) : null;
  } catch {
    return null;
  }
}

function saveRootPass(p: StoredPassphrase): void {
  localStorage.setItem(PASS_KEY, JSON.stringify(p));
}

export function newEnv(): ShellEnv {
  return { cwd: HOME, root: false, tree: null as unknown as VDir, pending: null };
}

/* ---------------- Parsing ---------------- */

/** Split a line into words, honouring single and double quotes */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

interface Stage {
  argv: string[];
  redirect?: { path: string; append: boolean };
}

function parsePipeline(line: string): Stage[] {
  return line.split("|").map((segment) => {
    const words = tokenize(segment);
    const argv: string[] = [];
    let redirect: Stage["redirect"];
    for (let i = 0; i < words.length; i++) {
      if (words[i] === ">" || words[i] === ">>") {
        const target = words[i + 1];
        if (target) redirect = { path: target, append: words[i] === ">>" };
        i++;
        continue;
      }
      argv.push(words[i]);
    }
    return { argv, redirect };
  });
}

/* ---------------- Helpers ---------------- */

function fmtSize(n: number): string {
  return String(n).padStart(6);
}

function listDir(node: VDir, long: boolean, all: boolean, showRoot: boolean): string {
  const names = Object.keys(node.children)
    .filter((n) => all || !n.startsWith("."))
    .filter((n) => showRoot || !node.children[n].root)
    .sort();
  if (!names.length) return "";
  if (!long) return names.map((n) => (node.children[n].type === "dir" ? `${n}/` : n)).join("  ");
  return names
    .map((n) => {
      const c = node.children[n];
      const type = c.type === "dir" ? "d" : "-";
      const perms = c.root ? "rwx------" : "rw-r--r--";
      const owner = c.root ? "root" : "yair";
      const size = c.type === "file" ? c.content.length : Object.keys(c.children).length;
      const seal = c.type === "file" && c.sealed ? " [sealed]" : "";
      const date = new Date(c.mtime).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      return `${type}${perms} ${owner.padEnd(5)} ${fmtSize(size)} ${date} ${n}${
        c.type === "dir" ? "/" : ""
      }${seal}`;
    })
    .join("\n");
}

function tree(node: VNode, prefix: string, showRoot: boolean): string[] {
  if (node.type !== "dir") return [];
  const names = Object.keys(node.children)
    .filter((n) => showRoot || !node.children[n].root)
    .sort();
  const lines: string[] = [];
  names.forEach((n, i) => {
    const last = i === names.length - 1;
    const child = node.children[n];
    lines.push(`${prefix}${last ? "└── " : "├── "}${n}${child.type === "dir" ? "/" : ""}`);
    if (child.type === "dir") {
      lines.push(...tree(child, `${prefix}${last ? "    " : "│   "}`, showRoot));
    }
  });
  return lines;
}

function walkFiles(node: VDir, path: string, showRoot: boolean): string[] {
  const out: string[] = [];
  for (const [name, child] of Object.entries(node.children)) {
    if (!showRoot && child.root) continue;
    const full = path === "/" ? `/${name}` : `${path}/${name}`;
    out.push(full);
    if (child.type === "dir") out.push(...walkFiles(child, full, showRoot));
  }
  return out;
}

const MANUALS: Record<string, string[]> = {
  bash: [
    "SHELL — how a command line actually works",
    "",
    "  A line is split into words. The first word is the command,",
    "  the rest are its arguments. Quotes keep spaces together:",
    "      echo \"one word\"",
    "",
    "  >  writes output to a file (overwrites)",
    "  >> appends instead",
    "  |  feeds one command's output into the next",
    "",
    "  Try:  ls -l /usr/share/lessons | grep crypto"
  ],
  root: [
    "ROOT — read this before you trust it",
    "",
    "  In this shell `su` unlocks /root and the destructive commands,",
    "  gated by a passphrase you set with `passwd`.",
    "",
    "  The passphrase is NOT stored. What is stored is a PBKDF2-SHA256",
    "  verifier with a random salt, at 210,000 iterations — the same",
    "  shape a real system uses.",
    "",
    "  BUT: this is an application gate, not an operating-system one.",
    "  It grants no privilege on your computer, and anyone with access",
    "  to this device's developer tools can bypass it by editing local",
    "  storage. Treat it as a place to practise the habit of least",
    "  privilege — never as protection for anything that matters.",
    "",
    "  For real isolation and real root: Kali in a VM, or on a Pi."
  ],
  crypto: [
    "CRYPTO — this part is not a simulation",
    "",
    "  encrypt <file> <passphrase>   seal with AES-256-GCM",
    "  decrypt <file> <passphrase>   open it again",
    "  hash <text> [sha-1|sha-512]   digest, SHA-256 by default",
    "",
    "  The key is derived from your passphrase with PBKDF2-SHA256,",
    "  210,000 iterations, over a random 16-byte salt. Each seal gets",
    "  a fresh 12-byte IV, so encrypting the same text twice gives",
    "  different output — that is correct, not a bug.",
    "",
    "  GCM is authenticated: flip one byte of the ciphertext and",
    "  decryption FAILS rather than returning plausible garbage.",
    "",
    "  Lose the passphrase and the content is gone. There is no",
    "  recovery path, by design."
  ]
};

/* ---------------- The interpreter ---------------- */

export async function execute(
  line: string,
  env: ShellEnv,
  host: ShellHost
): Promise<void> {
  // An interactive prompt (su / passwd) swallows the whole line
  if (env.pending) return handlePending(line, env, host);

  const trimmed = line.trim();
  if (!trimmed) return;

  const stages = parsePipeline(trimmed);
  let piped = "";
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage.argv.length) continue;
    const result = await runStage(stage.argv, piped, env, host, i > 0);
    if (result.halt) return;
    piped = result.stdout;
    if (stage.redirect) {
      const path = resolvePath(env.cwd, stage.redirect.path);
      if (needsRoot(env.tree, path) && !env.root) {
        host.out(`ybash: ${path}: permission denied`);
        return;
      }
      const existing = getNode(env.tree, path);
      const prev = stage.redirect.append && isFile(existing) ? existing.content : "";
      const err = writeFile(env.tree, path, prev + piped + (piped.endsWith("\n") ? "" : "\n"));
      if (err) host.out(`ybash: ${err}`);
      saveVfs(env.tree);
      piped = "";
    }
  }
  if (piped) host.out(piped);
}

interface StageResult {
  stdout: string;
  halt?: boolean;
}

async function runStage(
  argv: string[],
  stdin: string,
  env: ShellEnv,
  host: ShellHost,
  piped: boolean
): Promise<StageResult> {
  const [cmd, ...args] = argv;
  const flags = args.filter((a) => a.startsWith("-"));
  const rest = args.filter((a) => !a.startsWith("-"));
  const has = (f: string) => flags.some((x) => x.includes(f.replace("-", "")));
  const abs = (p: string) => resolvePath(env.cwd, p);

  const denied = (p: string) => {
    host.out(`ybash: ${p}: permission denied`);
    return { stdout: "", halt: true };
  };

  switch (cmd) {
    /* ---- navigation ---- */
    case "pwd":
      return { stdout: env.cwd };

    case "cd": {
      const target = rest[0] ? abs(rest[0]) : HOME;
      if (needsRoot(env.tree, target) && !env.root) return denied(target);
      const node = getNode(env.tree, target);
      if (!node) {
        host.out(`cd: no such directory: ${target}`);
        return { stdout: "", halt: true };
      }
      if (!isDir(node)) {
        host.out(`cd: not a directory: ${target}`);
        return { stdout: "", halt: true };
      }
      env.cwd = target;
      return { stdout: "" };
    }

    case "ls": {
      const target = rest[0] ? abs(rest[0]) : env.cwd;
      if (needsRoot(env.tree, target) && !env.root) return denied(target);
      const node = getNode(env.tree, target);
      if (!node) {
        host.out(`ls: no such file or directory: ${target}`);
        return { stdout: "", halt: true };
      }
      if (isFile(node)) return { stdout: baseName(target) };
      return { stdout: listDir(node, has("l"), has("a"), env.root) };
    }

    case "tree": {
      const target = rest[0] ? abs(rest[0]) : env.cwd;
      const node = getNode(env.tree, target);
      if (!isDir(node)) {
        host.out(`tree: not a directory: ${target}`);
        return { stdout: "", halt: true };
      }
      return { stdout: [target, ...tree(node, "", env.root)].join("\n") };
    }

    /* ---- reading ---- */
    case "cat": {
      const out: string[] = [];
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        const node = getNode(env.tree, path);
        if (!node) {
          host.out(`cat: no such file: ${path}`);
          return { stdout: "", halt: true };
        }
        if (!isFile(node)) {
          host.out(`cat: is a directory: ${path}`);
          return { stdout: "", halt: true };
        }
        out.push(
          node.sealed
            ? `[sealed with AES-256-GCM — run: decrypt ${p} <passphrase>]`
            : node.content
        );
      }
      return { stdout: out.join("\n") };
    }

    case "grep": {
      const pattern = rest[0];
      if (!pattern) {
        host.out("usage: grep <pattern> [file...]");
        return { stdout: "", halt: true };
      }
      let body = stdin;
      if (!piped && rest[1]) {
        const path = abs(rest[1]);
        const node = getNode(env.tree, path);
        if (!isFile(node)) {
          host.out(`grep: no such file: ${path}`);
          return { stdout: "", halt: true };
        }
        body = node.content;
      }
      let re: RegExp;
      try {
        re = new RegExp(pattern, has("i") ? "i" : "");
      } catch {
        host.out(`grep: bad pattern: ${pattern}`);
        return { stdout: "", halt: true };
      }
      return {
        stdout: body.split("\n").filter((l) => re.test(l)).join("\n")
      };
    }

    case "find": {
      const start = rest[0] ? abs(rest[0]) : env.cwd;
      const node = getNode(env.tree, start);
      if (!isDir(node)) {
        host.out(`find: not a directory: ${start}`);
        return { stdout: "", halt: true };
      }
      return { stdout: walkFiles(node, start, env.root).join("\n") };
    }

    case "wc":
      return {
        stdout: String(stdin ? stdin.split("\n").length : 0)
      };

    case "head":
      return { stdout: stdin.split("\n").slice(0, 10).join("\n") };

    case "tail":
      return { stdout: stdin.split("\n").slice(-10).join("\n") };

    /* ---- writing ---- */
    case "echo":
      return { stdout: rest.join(" ") };

    case "touch": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        if (!getNode(env.tree, path)) {
          const err = writeFile(env.tree, path, "");
          if (err) {
            host.out(`touch: ${err}`);
            return { stdout: "", halt: true };
          }
        }
      }
      saveVfs(env.tree);
      return { stdout: "" };
    }

    case "mkdir": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        const err = makeDir(env.tree, path, has("p"));
        if (err) {
          host.out(`mkdir: ${err}`);
          return { stdout: "", halt: true };
        }
      }
      saveVfs(env.tree);
      return { stdout: "" };
    }

    case "rm": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        // Wiping the whole tree is a root-only act, as it would be on a real box
        if ((path === "/" || path === "/home") && !env.root) return denied(path);
        const err = removeNode(env.tree, path, has("r"));
        if (err) {
          host.out(`rm: ${err}`);
          return { stdout: "", halt: true };
        }
      }
      saveVfs(env.tree);
      return { stdout: "" };
    }

    case "cp":
    case "mv": {
      const [from, to] = rest;
      if (!from || !to) {
        host.out(`usage: ${cmd} <src> <dst>`);
        return { stdout: "", halt: true };
      }
      const src = abs(from);
      const dst = abs(to);
      if ((needsRoot(env.tree, src) || needsRoot(env.tree, dst)) && !env.root) {
        return denied(src);
      }
      const node = getNode(env.tree, src);
      if (!node) {
        host.out(`${cmd}: no such file: ${src}`);
        return { stdout: "", halt: true };
      }
      const target = getNode(env.tree, dst);
      const finalPath = isDir(target) ? `${dst}/${baseName(src)}` : dst;
      const parent = getNode(env.tree, parentOf(finalPath));
      if (!isDir(parent)) {
        host.out(`${cmd}: no such directory: ${parentOf(finalPath)}`);
        return { stdout: "", halt: true };
      }
      parent.children[baseName(finalPath)] = JSON.parse(
        JSON.stringify(node)
      ) as VNode;
      if (cmd === "mv") removeNode(env.tree, src, true);
      saveVfs(env.tree);
      return { stdout: "" };
    }

    /* ---- identity and privilege ---- */
    case "whoami":
      return { stdout: env.root ? "root" : "yair" };

    case "id":
      return {
        stdout: env.root
          ? "uid=0(root) gid=0(root) groups=0(root)"
          : "uid=1000(yair) gid=1000(yair) groups=1000(yair)"
      };

    case "su": {
      if (env.root) {
        host.out("already root");
        return { stdout: "", halt: true };
      }
      if (!loadRootPass()) {
        host.out("no root password set yet — run: passwd");
        return { stdout: "", halt: true };
      }
      env.pending = { kind: "su", masked: true };
      host.out("Password:");
      return { stdout: "", halt: true };
    }

    case "exit":
      if (!env.root) {
        host.out("not root");
        return { stdout: "", halt: true };
      }
      env.root = false;
      if (env.cwd.startsWith("/root")) env.cwd = HOME;
      host.out("dropped back to yair");
      return { stdout: "", halt: true };

    case "passwd": {
      if (loadRootPass() && !env.root) {
        host.out("passwd: you must be root to change the root password");
        return { stdout: "", halt: true };
      }
      env.pending = { kind: "passwd-new", masked: true };
      host.out("New root password:");
      return { stdout: "", halt: true };
    }

    /* ---- crypto ---- */
    case "hash": {
      const text = piped ? stdin : rest.join(" ");
      if (!text) {
        host.out("usage: hash <text>   (or pipe into it)");
        return { stdout: "", halt: true };
      }
      const algo = has("512") ? "SHA-512" : has("1") ? "SHA-1" : "SHA-256";
      return { stdout: `${algo.toLowerCase()}  ${await digest(text, algo)}` };
    }

    case "encrypt": {
      const [p, pass] = rest;
      if (!p || !pass) {
        host.out("usage: encrypt <file> <passphrase>");
        return { stdout: "", halt: true };
      }
      const path = abs(p);
      const node = getNode(env.tree, path);
      if (!isFile(node)) {
        host.out(`encrypt: no such file: ${path}`);
        return { stdout: "", halt: true };
      }
      if (node.sealed) {
        host.out("already sealed");
        return { stdout: "", halt: true };
      }
      node.content = await encryptText(node.content, pass);
      node.sealed = true;
      node.mtime = Date.now();
      saveVfs(env.tree);
      host.out(`sealed ${path} with AES-256-GCM`);
      host.out("lose the passphrase and this content is unrecoverable");
      return { stdout: "", halt: true };
    }

    case "decrypt": {
      const [p, pass] = rest;
      if (!p || !pass) {
        host.out("usage: decrypt <file> <passphrase>");
        return { stdout: "", halt: true };
      }
      const path = abs(p);
      const node = getNode(env.tree, path);
      if (!isFile(node)) {
        host.out(`decrypt: no such file: ${path}`);
        return { stdout: "", halt: true };
      }
      if (!isEncrypted(node.content)) {
        host.out("decrypt: not sealed");
        return { stdout: "", halt: true };
      }
      try {
        node.content = await decryptText(node.content, pass);
        node.sealed = false;
        node.mtime = Date.now();
        saveVfs(env.tree);
        host.out(`opened ${path}`);
      } catch {
        // GCM authenticated the blob and rejected it — wrong key or tampering
        host.out("decrypt: authentication failed — wrong passphrase, or the data was altered");
      }
      return { stdout: "", halt: true };
    }

    /* ---- system ---- */
    case "uname":
      return {
        stdout: has("a")
          ? "YAIROS yairos-core 2.0 browser-sandboxed ybash"
          : "YAIROS"
      };

    case "hostname":
      return { stdout: "yairos-core" };

    case "date":
      return { stdout: new Date().toString() };

    case "env":
      return {
        stdout: [
          `USER=${env.root ? "root" : "yair"}`,
          `HOME=${HOME}`,
          `PWD=${env.cwd}`,
          "SHELL=/bin/ybash",
          "TERM=yairos-256color"
        ].join("\n")
      };

    case "reset-fs": {
      if (!env.root) return denied("reset-fs");
      env.tree = resetVfs();
      env.cwd = HOME;
      host.out("filesystem reset to defaults");
      return { stdout: "", halt: true };
    }

    /* ---- windows ---- */
    case "startx":
      host.wm.startx();
      return { stdout: "", halt: true };

    case "dash":
      host.wm.dash();
      return { stdout: "", halt: true };

    case "tile":
      host.wm.tile();
      return { stdout: "", halt: true };

    case "open": {
      if (!rest[0]) {
        host.out("usage: open <app>");
        return { stdout: "", halt: true };
      }
      host.wm.open(rest[0]);
      return { stdout: "", halt: true };
    }

    case "close": {
      if (!rest[0]) {
        host.out("usage: close <app>");
        return { stdout: "", halt: true };
      }
      if (!host.wm.close(rest[0])) host.out(`${rest[0]}: not open`);
      return { stdout: "", halt: true };
    }

    case "ps": {
      const list = host.wm.list();
      return {
        stdout: list.length
          ? list
              .map((w, i) => `${String(i + 1).padStart(4)}  ${w.app.padEnd(10)} ${w.minimized ? "stopped" : "running"}`)
              .join("\n")
          : "no windows"
      };
    }

    case "apps":
      return {
        stdout: host.wm
          .apps()
          .map((a) => `  ${a.command.padEnd(10)}${a.ready ? "" : "(pending)"}`)
          .join("\n")
      };

    /* ---- docs ---- */
    case "man": {
      const topic = rest[0];
      if (!topic || !MANUALS[topic]) {
        host.out(`man: topics — ${Object.keys(MANUALS).join(", ")}`);
        return { stdout: "", halt: true };
      }
      return { stdout: MANUALS[topic].join("\n") };
    }

    case "help":
      return {
        stdout: [
          "navigation   pwd  ls [-la]  cd  tree  find",
          "files        cat  touch  mkdir [-p]  rm [-r]  cp  mv  echo",
          "text         grep [-i]  head  tail  wc",
          "privilege    whoami  id  su  exit  passwd",
          "crypto       hash  encrypt  decrypt",
          "system       uname [-a]  hostname  date  env  reset-fs",
          "windows      startx  dash  tile  open  close  ps  apps",
          "docs         man bash | man root | man crypto",
          "",
          "redirection  >  >>        pipes  |",
          "lessons      ls /usr/share/lessons"
        ].join("\n")
      };

    default:
      host.out(`ybash: command not found: ${cmd}`);
      return { stdout: "", halt: true };
  }
}

/* ---------------- Interactive prompts ---------------- */

async function handlePending(
  input: string,
  env: ShellEnv,
  host: ShellHost
): Promise<void> {
  const pending = env.pending!;
  env.pending = null;

  if (pending.kind === "su") {
    const stored = loadRootPass();
    if (stored && (await verifyPassphrase(input, stored))) {
      env.root = true;
      host.out("root granted — /root is now readable");
      host.out("reminder: this is an app gate, not OS root. see `man root`");
    } else {
      host.out("su: authentication failure");
    }
    return;
  }

  if (pending.kind === "passwd-new") {
    if (input.length < 4) {
      host.out("passwd: too short (4+ characters)");
      return;
    }
    env.pending = { kind: "passwd-confirm", masked: true, draft: input };
    host.out("Retype new root password:");
    return;
  }

  if (pending.kind === "passwd-confirm") {
    if (input !== pending.draft) {
      host.out("passwd: passwords do not match");
      return;
    }
    saveRootPass(await hashPassphrase(input));
    host.out("passwd: password updated");
    host.out("stored as a PBKDF2-SHA256 verifier — the password itself is not kept");
  }
}
