import {
  HOME,
  baseName,
  getNode,
  isDir,
  isFile,
  makeDir,
  makeDirNode,
  makeFile,
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

// A POSIX-flavoured shell over the virtual filesystem: word splitting with
// quotes, $VAR expansion, aliases, pipes, and output redirection — so what is
// learned here is what a real shell actually does.
//
// Two privilege levels, like a real box: `yair` (normal) and `root`. Opening
// windows, touching /root, and wiping things are root-only. `su` / `sudo`
// cross over, gated by the master passphrase.

const PASS_KEY = "yairos.rootpass";
const ENV_KEY = "yairos.shellenv";

/**
 * The passphrase the app ships knowing the check for — so the lock works on
 * the very first launch with nothing configured. This is a PBKDF2-SHA256
 * verifier (600k iterations) for the intended master passphrase, NOT the
 * passphrase itself. `passwd` writes a per-device verifier that overrides it.
 *
 * The repo is public, so a determined attacker could mount an offline guess
 * against this. It is a login gate, not protection for anything that matters;
 * the real guarantee is the file encryption, which needs the actual
 * passphrase and cannot be derived from this.
 */
const LOGIN_VERIFIER: StoredPassphrase = {
  salt: "q53vJs6RV5SwM64AafUG1A==",
  hash: "5r0Xc6ayzpJuqZz1q9tvGBUlg+hZcz16FsB9jnKTHBU=",
  iterations: 600_000
};

export interface ShellEnv {
  cwd: string;
  root: boolean;
  tree: VDir;
  vars: Record<string, string>;
  aliases: Record<string, string>;
  /** Pending interactive prompt (su / sudo / passwd) */
  pending: PendingPrompt | null;
}

export interface PendingPrompt {
  kind: "su" | "sudo" | "passwd-new" | "passwd-confirm";
  masked: true;
  /** For `sudo <cmd>`: the command line to run once auth succeeds */
  run?: string;
  /** For `sudo su` / `sudo -i`: stay root afterwards */
  stay?: boolean;
  /** Carried between the two steps of setting a password */
  draft?: string;
}

export interface ShellProject {
  id: string;
  name: string;
  slug: string;
  folder?: string;
  status: string;
  live?: string;
  repo?: string;
}

export interface ShellHost {
  out(...lines: string[]): void;
  history(): string[];
  wm: {
    open(app: string): void;
    close(app: string): boolean;
    tile(): void;
    dash(): void;
    startx(): void;
    list(): { app: string; minimized: boolean }[];
    apps(): { command: string; ready: boolean }[];
  };
  projects: {
    list(): ShellProject[];
    folders(): string[];
    addFolder(name: string): void;
    removeFolder(name: string): boolean;
    move(id: string, folder: string | null): void;
    openChat(id: string): void;
  };
}

/** The master-passphrase verifier: the device override, or the shipped one */
export function loadRootPass(): StoredPassphrase {
  try {
    const raw = localStorage.getItem(PASS_KEY);
    if (raw) return JSON.parse(raw) as StoredPassphrase;
  } catch {
    /* fall through to the shipped verifier */
  }
  return LOGIN_VERIFIER;
}

/** True once the user has replaced the shipped verifier with their own */
export function hasCustomPass(): boolean {
  return !!localStorage.getItem(PASS_KEY);
}

function saveRootPass(p: StoredPassphrase): void {
  localStorage.setItem(PASS_KEY, JSON.stringify(p));
}

export async function checkMasterPass(input: string): Promise<boolean> {
  return verifyPassphrase(input, loadRootPass());
}

function loadEnvState(): { vars: Record<string, string>; aliases: Record<string, string> } {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { vars?: Record<string, string>; aliases?: Record<string, string> };
      return { vars: p.vars ?? {}, aliases: p.aliases ?? {} };
    }
  } catch {
    /* start clean */
  }
  return { vars: {}, aliases: {} };
}

function saveEnvState(env: ShellEnv): void {
  try {
    localStorage.setItem(ENV_KEY, JSON.stringify({ vars: env.vars, aliases: env.aliases }));
  } catch {
    /* non-fatal */
  }
}

export function newEnv(): ShellEnv {
  const { vars, aliases } = loadEnvState();
  return {
    cwd: HOME,
    root: false,
    tree: null as unknown as VDir,
    vars,
    aliases,
    pending: null
  };
}

/* ---------------- Parsing ---------------- */

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

/** $VAR and ${VAR} → their value ("" when unset), like a real shell */
function expandVars(line: string, env: ShellEnv): string {
  const table: Record<string, string> = {
    ...env.vars,
    USER: env.root ? "root" : "yair",
    HOME,
    PWD: env.cwd,
    SHELL: "/bin/ybash",
    HOSTNAME: "yairos-core"
  };
  return line.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, a, b) => {
    const k = a ?? b;
    return table[k] ?? "";
  });
}

/** One alias pass on the first word only, the way bash does it */
function applyAlias(line: string, env: ShellEnv): string {
  const sp = line.indexOf(" ");
  const head = sp === -1 ? line : line.slice(0, sp);
  const rest = sp === -1 ? "" : line.slice(sp);
  const target = env.aliases[head];
  return target ? target + rest : line;
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

/* ---------------- The /projects live view ---------------- */

const PROJ_ROOT = "/projects";

/** Exact slug, then slug prefix, then a substring of name / live URL / repo */
function findProject(host: ShellHost, query: string): ShellProject | undefined {
  const items = host.projects.list();
  const q = query.toLowerCase();
  const hay = (p: ShellProject) =>
    `${p.name} ${p.live ?? ""} ${p.repo ?? ""}`.toLowerCase();
  return (
    items.find((p) => p.slug === q) ||
    items.find((p) => p.slug.startsWith(q)) ||
    items.find((p) => hay(p).includes(q))
  );
}

/** Build /projects fresh from the live project list + the folder list */
function buildProjectsNode(host: ShellHost): VDir {
  const node = makeDirNode({});
  for (const name of host.projects.folders()) {
    node.children[name] = makeDirNode({});
  }
  for (const p of host.projects.list()) {
    const summary =
      `${p.name}\n` +
      `status: ${p.status}\n` +
      (p.live ? `live:   ${p.live}\n` : "") +
      (p.repo ? `repo:   ${p.repo}\n` : "") +
      `\nopen its chat:  open project ${p.slug}\n`;
    const leaf = makeFile(summary);
    if (p.folder && node.children[p.folder]?.type === "dir") {
      (node.children[p.folder] as VDir).children[p.slug] = leaf;
    } else {
      node.children[p.slug] = leaf;
    }
  }
  return node;
}

/** Attach the live view; call stripProjects before persisting */
function mountProjects(env: ShellEnv, host: ShellHost): void {
  env.tree.children.projects = buildProjectsNode(host);
}

function persist(env: ShellEnv): void {
  const live = env.tree.children.projects;
  delete env.tree.children.projects;
  saveVfs(env.tree);
  if (live) env.tree.children.projects = live;
}

/** mkdir/mv/rm that land inside /projects are translated to host calls */
function projectOp(
  cmd: string,
  rest: string[],
  env: ShellEnv,
  host: ShellHost
): StageResult | null {
  const first = rest[0] ? resolvePath(env.cwd, rest[0]) : "";
  const second = rest[1] ? resolvePath(env.cwd, rest[1]) : "";
  const inProj = (p: string) => p === PROJ_ROOT || p.startsWith(PROJ_ROOT + "/");
  if (!inProj(first) && !inProj(second)) return null;

  if (!env.root) {
    host.out("ybash: /projects is root-only — run: su");
    return { stdout: "", halt: true };
  }

  const rel = (p: string) => p.slice(PROJ_ROOT.length + 1); // "" | folder | folder/slug | slug

  if (cmd === "mkdir") {
    const name = rel(first);
    if (!name || name.includes("/")) {
      host.out("mkdir: name a single folder under /projects, e.g. mkdir /projects/clients");
      return { stdout: "", halt: true };
    }
    host.projects.addFolder(name);
    host.out(`created folder /projects/${name}`);
    return { stdout: "", halt: true };
  }

  if (cmd === "rm") {
    const name = rel(first);
    const folders = host.projects.folders();
    if (folders.includes(name)) {
      if (!host.projects.removeFolder(name)) {
        host.out(`rm: /projects/${name} not empty — move its projects out first`);
        return { stdout: "", halt: true };
      }
      host.out(`removed folder /projects/${name}`);
      return { stdout: "", halt: true };
    }
    host.out("rm: to delete a project use the Projects window (it also removes the repo)");
    return { stdout: "", halt: true };
  }

  if (cmd === "mv" || cmd === "cp") {
    if (cmd === "cp") {
      host.out("cp: projects can't be copied — use mv to file one under a folder");
      return { stdout: "", halt: true };
    }
    const fromRel = rel(first);
    const slug = fromRel.includes("/") ? fromRel.split("/").pop()! : fromRel;
    const proj = findProject(host, slug);
    if (!proj) {
      host.out(`mv: no project ${slug} — see: ls /projects`);
      return { stdout: "", halt: true };
    }
    // destination: /projects (un-file), /projects/<folder>, or /projects/<folder>/
    const toRel = rel(second).replace(/\/$/, "");
    if (!toRel) {
      host.projects.move(proj.id, null);
      host.out(`moved ${slug} out of any folder`);
      return { stdout: "", halt: true };
    }
    const folder = toRel.split("/")[0];
    if (!host.projects.folders().includes(folder)) {
      host.out(`mv: no folder /projects/${folder} — mkdir it first`);
      return { stdout: "", halt: true };
    }
    host.projects.move(proj.id, folder);
    host.out(`filed ${slug} under /projects/${folder}`);
    return { stdout: "", halt: true };
  }

  return null;
}

/* ---------------- Listing helpers ---------------- */

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

const BUILTINS = new Set([
  "pwd", "ls", "cd", "tree", "find", "cat", "grep", "head", "tail", "wc",
  "echo", "printf", "touch", "mkdir", "rm", "cp", "mv", "chmod", "chown",
  "ln", "basename", "dirname", "whoami", "id", "su", "sudo", "exit", "logout",
  "passwd", "hash", "encrypt", "decrypt", "uname", "hostname", "date", "cal",
  "env", "export", "unset", "alias", "unalias", "history", "which", "type",
  "sleep", "clear", "df", "free", "uptime", "reset-fs", "startx", "dash",
  "tile", "open", "close", "ps", "kill", "apps", "man", "help"
]);

const MANUALS: Record<string, string[]> = {
  bash: [
    "SHELL — how a command line actually works",
    "",
    "  A line is split into words. The first word is the command,",
    "  the rest are arguments. Quotes keep spaces together:",
    "      echo \"one word\"",
    "",
    "  $VAR         expands to a variable's value ('' if unset)",
    "  >  >>        write / append output to a file",
    "  |            feed one command's output into the next",
    "  alias x='..' make a shortcut  (persists like .bashrc)",
    "",
    "  Try:  ls -l /usr/share/lessons | grep crypto"
  ],
  root: [
    "ROOT — read this before you trust it",
    "",
    "  `su` (or `sudo su`) becomes root; `exit` drops back. Root is",
    "  required to open windows, touch /root or /projects, and to",
    "  wipe anything. It is gated by the master passphrase.",
    "",
    "  The passphrase is never stored. What is stored — or shipped —",
    "  is a PBKDF2-SHA256 verifier (600k iterations, random salt).",
    "",
    "  This is an APPLICATION gate, not an operating-system one. It",
    "  grants no privilege on your computer, and anyone with your",
    "  unlocked device and its developer tools can step around it.",
    "  Practise least privilege here; do not lean on it for secrets.",
    "",
    "  The one hard guarantee is `encrypt`: AES-256-GCM ciphertext",
    "  cannot be read without the actual passphrase, gate or no gate.",
    "",
    "  For real isolation and real root: Kali in a VM, or on a Pi."
  ],
  crypto: [
    "CRYPTO — not a simulation",
    "",
    "  encrypt <file> <passphrase>   seal with AES-256-GCM",
    "  decrypt <file> <passphrase>   open it",
    "  hash <text> [-1|-512]         digest, SHA-256 by default",
    "",
    "  Key = PBKDF2-SHA256(passphrase, random 16-byte salt, 600,000",
    "  iterations). Each seal gets a fresh 12-byte IV, so the same",
    "  text sealed twice looks different — correct, not a bug.",
    "",
    "  GCM is authenticated: alter one byte and decryption FAILS",
    "  instead of returning plausible garbage.",
    "",
    "  Same scheme as scripts/vault.mjs — a file sealed in the browser",
    "  opens with Node. Lose the passphrase and the content is gone.",
    "  No recovery, by design."
  ],
  projects: [
    "PROJECTS — file your sites like directories",
    "",
    "  ls /projects                  every site Yairos built",
    "  mkdir /projects/clients       make a folder (root)",
    "  mv /projects/lollipop /projects/clients/    file it under one",
    "  mv /projects/lollipop /projects/            take it back out",
    "  rm /projects/clients          delete an empty folder",
    "  cat /projects/lollipop        its status, live URL, repo",
    "  open project lollipop         open that project's chat window",
    "",
    "  Folders are yours; deleting a PROJECT is done from the",
    "  Projects window, since that also removes its GitHub repo."
  ]
};

/* ---------------- The interpreter ---------------- */

export async function execute(
  raw: string,
  env: ShellEnv,
  host: ShellHost
): Promise<void> {
  if (env.pending) return handlePending(raw, env, host);

  let line = raw.trim();
  if (!line) return;
  line = applyAlias(line, env);
  line = expandVars(line, env);

  mountProjects(env, host);

  const stages = parsePipeline(line);
  let piped = "";
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage.argv.length) continue;
    const result = await runStage(stage.argv, piped, env, host, i > 0);
    if (result.halt) return;
    piped = result.stdout;
    if (stage.redirect) {
      const path = resolvePath(env.cwd, stage.redirect.path);
      if (path === PROJ_ROOT || path.startsWith(PROJ_ROOT + "/")) {
        host.out("ybash: /projects is a live view — you can't write into it");
        return;
      }
      if (needsRoot(env.tree, path) && !env.root) {
        host.out(`ybash: ${path}: permission denied`);
        return;
      }
      const existing = getNode(env.tree, path);
      const prev = stage.redirect.append && isFile(existing) ? existing.content : "";
      const err = writeFile(env.tree, path, prev + piped + (piped.endsWith("\n") ? "" : "\n"));
      if (err) host.out(`ybash: ${err}`);
      persist(env);
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

  const denied = (p: string): StageResult => {
    host.out(`ybash: ${p}: permission denied${env.root ? "" : " — run: su"}`);
    return { stdout: "", halt: true };
  };
  const rootOnly = (): StageResult => {
    host.out(`ybash: ${cmd}: root only — run: su`);
    return { stdout: "", halt: true };
  };

  // /projects intercepts, before the generic filesystem handlers
  if (["mkdir", "rm", "mv", "cp"].includes(cmd)) {
    const handled = projectOp(cmd, rest, env, host);
    if (handled) return handled;
  }

  switch (cmd) {
    /* ---- navigation ---- */
    case "pwd":
      return { stdout: env.cwd };

    case "cd": {
      const target = rest[0] ? abs(rest[0]) : HOME;
      if (target.startsWith(PROJ_ROOT) && !env.root) return rootOnly();
      if (needsRoot(env.tree, target) && !env.root) return denied(target);
      const node = getNode(env.tree, target);
      if (!node) return void host.out(`cd: no such directory: ${target}`), { stdout: "", halt: true };
      if (!isDir(node)) return void host.out(`cd: not a directory: ${target}`), { stdout: "", halt: true };
      env.cwd = target;
      return { stdout: "" };
    }

    case "ls": {
      const target = rest[0] ? abs(rest[0]) : env.cwd;
      if (target.startsWith(PROJ_ROOT) && !env.root) return rootOnly();
      if (needsRoot(env.tree, target) && !env.root) return denied(target);
      const node = getNode(env.tree, target);
      if (!node) return void host.out(`ls: no such file or directory: ${target}`), { stdout: "", halt: true };
      if (isFile(node)) return { stdout: baseName(target) };
      return { stdout: listDir(node, has("l"), has("a"), env.root) };
    }

    case "tree": {
      const target = rest[0] ? abs(rest[0]) : env.cwd;
      const node = getNode(env.tree, target);
      if (!isDir(node)) return void host.out(`tree: not a directory: ${target}`), { stdout: "", halt: true };
      return { stdout: [target, ...tree(node, "", env.root)].join("\n") };
    }

    case "find": {
      const start = rest[0] ? abs(rest[0]) : env.cwd;
      const node = getNode(env.tree, start);
      if (!isDir(node)) return void host.out(`find: not a directory: ${start}`), { stdout: "", halt: true };
      return { stdout: walkFiles(node, start, env.root).join("\n") };
    }

    case "basename":
      return { stdout: rest[0] ? baseName(rest[0].replace(/\/$/, "")) : "" };

    case "dirname":
      return { stdout: rest[0] ? parentOf(abs(rest[0])) : "." };

    /* ---- reading ---- */
    case "cat": {
      const out: string[] = [];
      for (const p of rest) {
        const path = abs(p);
        if (path.startsWith(PROJ_ROOT) && !env.root) return rootOnly();
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        const node = getNode(env.tree, path);
        if (!node) return void host.out(`cat: no such file: ${path}`), { stdout: "", halt: true };
        if (!isFile(node)) return void host.out(`cat: is a directory: ${path}`), { stdout: "", halt: true };
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
      if (!pattern) return void host.out("usage: grep <pattern> [file...]"), { stdout: "", halt: true };
      let body = stdin;
      if (!piped && rest[1]) {
        const node = getNode(env.tree, abs(rest[1]));
        if (!isFile(node)) return void host.out(`grep: no such file: ${rest[1]}`), { stdout: "", halt: true };
        body = node.content;
      }
      let re: RegExp;
      try {
        re = new RegExp(pattern, has("i") ? "i" : "");
      } catch {
        host.out(`grep: bad pattern: ${pattern}`);
        return { stdout: "", halt: true };
      }
      return { stdout: body.split("\n").filter((l) => re.test(l)).join("\n") };
    }

    case "wc":
      return { stdout: String(stdin ? stdin.split("\n").length : 0) };

    case "head":
      return { stdout: stdin.split("\n").slice(0, has("n") ? Number(rest[0]) || 10 : 10).join("\n") };

    case "tail":
      return { stdout: stdin.split("\n").slice(-(has("n") ? Number(rest[0]) || 10 : 10)).join("\n") };

    /* ---- writing ---- */
    case "echo":
      return { stdout: rest.join(" ") };

    case "printf":
      return { stdout: (rest[0] ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t") };

    case "touch": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        if (!getNode(env.tree, path)) {
          const err = writeFile(env.tree, path, "");
          if (err) return void host.out(`touch: ${err}`), { stdout: "", halt: true };
        }
      }
      persist(env);
      return { stdout: "" };
    }

    case "mkdir": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        const err = makeDir(env.tree, path, has("p"));
        if (err) return void host.out(`mkdir: ${err}`), { stdout: "", halt: true };
      }
      persist(env);
      return { stdout: "" };
    }

    case "rm": {
      for (const p of rest) {
        const path = abs(p);
        if (needsRoot(env.tree, path) && !env.root) return denied(path);
        if ((path === "/" || path === "/home") && !env.root) return denied(path);
        const err = removeNode(env.tree, path, has("r") || has("R"));
        if (err) return void host.out(`rm: ${err}`), { stdout: "", halt: true };
      }
      persist(env);
      return { stdout: "" };
    }

    case "cp":
    case "mv": {
      const [from, to] = rest;
      if (!from || !to) return void host.out(`usage: ${cmd} <src> <dst>`), { stdout: "", halt: true };
      const src = abs(from);
      const dst = abs(to);
      if ((needsRoot(env.tree, src) || needsRoot(env.tree, dst)) && !env.root) return denied(src);
      const node = getNode(env.tree, src);
      if (!node) return void host.out(`${cmd}: no such file: ${src}`), { stdout: "", halt: true };
      const target = getNode(env.tree, dst);
      const finalPath = isDir(target) ? `${dst}/${baseName(src)}` : dst;
      const parent = getNode(env.tree, parentOf(finalPath));
      if (!isDir(parent)) return void host.out(`${cmd}: no such directory: ${parentOf(finalPath)}`), { stdout: "", halt: true };
      parent.children[baseName(finalPath)] = JSON.parse(JSON.stringify(node)) as VNode;
      if (cmd === "mv") removeNode(env.tree, src, true);
      persist(env);
      return { stdout: "" };
    }

    case "ln": {
      // No real symlinks in this fs — copy, and say so
      const [from, to] = rest;
      if (!from || !to) return void host.out("usage: ln -s <target> <name>"), { stdout: "", halt: true };
      const node = getNode(env.tree, abs(from));
      if (!node) return void host.out(`ln: no such file: ${from}`), { stdout: "", halt: true };
      const parent = getNode(env.tree, parentOf(abs(to)));
      if (!isDir(parent)) return void host.out(`ln: no such directory: ${parentOf(abs(to))}`), { stdout: "", halt: true };
      parent.children[baseName(abs(to))] = JSON.parse(JSON.stringify(node)) as VNode;
      persist(env);
      host.out("ln: this fs has no symlinks — made a copy instead");
      return { stdout: "" };
    }

    case "chmod": {
      // Model permissions as the one bit this fs has: root-only or not.
      // chmod 700 / u+rwx,go-rwx -> root-only ; chmod 644 / a+r -> open
      const mode = rest[0] ?? "";
      const path = rest[1] ? abs(rest[1]) : "";
      const node = path ? getNode(env.tree, path) : null;
      if (!node) return void host.out("usage: chmod <mode> <path>"), { stdout: "", halt: true };
      if (needsRoot(env.tree, path) && !env.root) return denied(path);
      const lock = /^7[0-7][0-7]$/.test(mode) || /go-/.test(mode);
      node.root = lock || undefined;
      persist(env);
      host.out(`${path} is now ${lock ? "root-only (rwx------)" : "open (rw-r--r--)"}`);
      return { stdout: "" };
    }

    case "chown": {
      const owner = rest[0] ?? "";
      const path = rest[1] ? abs(rest[1]) : "";
      const node = path ? getNode(env.tree, path) : null;
      if (!node) return void host.out("usage: chown <root|yair> <path>"), { stdout: "", halt: true };
      if (!env.root) return rootOnly();
      node.root = owner === "root" || undefined;
      persist(env);
      host.out(`${path} now owned by ${owner === "root" ? "root" : "yair"}`);
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
      if (env.root) return void host.out("already root"), { stdout: "", halt: true };
      env.pending = { kind: "su", masked: true, stay: true };
      host.out("Password:");
      return { stdout: "", halt: true };
    }

    case "sudo": {
      if (env.root) {
        // already root: run whatever followed sudo, or nothing
        return args.length ? runStage(args, stdin, env, host, piped) : { stdout: "" };
      }
      const asksShell = !args.length || ["su", "-i", "-s", "-"].includes(args[0]);
      if (asksShell) {
        env.pending = { kind: "sudo", masked: true, stay: true };
      } else {
        env.pending = { kind: "sudo", masked: true, run: args.join(" ") };
      }
      host.out(`[sudo] password for yair:`);
      return { stdout: "", halt: true };
    }

    case "exit":
    case "logout":
      if (!env.root) return void host.out("not root"), { stdout: "", halt: true };
      env.root = false;
      if (env.cwd.startsWith("/root") || env.cwd.startsWith(PROJ_ROOT)) env.cwd = HOME;
      host.out("dropped back to yair");
      return { stdout: "", halt: true };

    case "passwd": {
      if (hasCustomPass() && !env.root) {
        host.out("passwd: you must be root to change the master password");
        return { stdout: "", halt: true };
      }
      env.pending = { kind: "passwd-new", masked: true };
      host.out("New master password:");
      return { stdout: "", halt: true };
    }

    /* ---- crypto ---- */
    case "hash": {
      const text = piped ? stdin : rest.join(" ");
      if (!text) return void host.out("usage: hash <text>   (or pipe into it)"), { stdout: "", halt: true };
      const algo = has("512") ? "SHA-512" : has("1") ? "SHA-1" : "SHA-256";
      return { stdout: `${algo.toLowerCase()}  ${await digest(text, algo)}` };
    }

    case "encrypt": {
      const [p, pass] = rest;
      if (!p || !pass) return void host.out("usage: encrypt <file> <passphrase>"), { stdout: "", halt: true };
      const path = abs(p);
      const node = getNode(env.tree, path);
      if (!isFile(node)) return void host.out(`encrypt: no such file: ${path}`), { stdout: "", halt: true };
      if (node.sealed) return void host.out("already sealed"), { stdout: "", halt: true };
      node.content = await encryptText(node.content, pass);
      node.sealed = true;
      node.mtime = Date.now();
      persist(env);
      host.out(`sealed ${path} with AES-256-GCM`, "lose the passphrase and this content is unrecoverable");
      return { stdout: "", halt: true };
    }

    case "decrypt": {
      const [p, pass] = rest;
      if (!p || !pass) return void host.out("usage: decrypt <file> <passphrase>"), { stdout: "", halt: true };
      const path = abs(p);
      const node = getNode(env.tree, path);
      if (!isFile(node)) return void host.out(`decrypt: no such file: ${path}`), { stdout: "", halt: true };
      if (!isEncrypted(node.content)) return void host.out("decrypt: not sealed"), { stdout: "", halt: true };
      try {
        node.content = await decryptText(node.content, pass);
        node.sealed = false;
        node.mtime = Date.now();
        persist(env);
        host.out(`opened ${path}`);
      } catch {
        host.out("decrypt: authentication failed — wrong passphrase, or the data was altered");
      }
      return { stdout: "", halt: true };
    }

    /* ---- variables & aliases (persist like .bashrc) ---- */
    case "export": {
      for (const kv of rest) {
        const eq = kv.indexOf("=");
        if (eq === -1) continue;
        env.vars[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
      saveEnvState(env);
      return { stdout: "" };
    }

    case "unset": {
      for (const k of rest) delete env.vars[k];
      saveEnvState(env);
      return { stdout: "" };
    }

    case "alias": {
      if (!rest.length && !args.length) {
        return {
          stdout: Object.entries(env.aliases).map(([k, v]) => `alias ${k}='${v}'`).join("\n")
        };
      }
      const joined = args.join(" ");
      const eq = joined.indexOf("=");
      if (eq === -1) {
        const v = env.aliases[joined];
        return { stdout: v ? `alias ${joined}='${v}'` : `alias: ${joined}: not found` };
      }
      env.aliases[joined.slice(0, eq)] = joined.slice(eq + 1).replace(/^['"]|['"]$/g, "");
      saveEnvState(env);
      return { stdout: "" };
    }

    case "unalias": {
      for (const k of rest) delete env.aliases[k];
      saveEnvState(env);
      return { stdout: "" };
    }

    case "history":
      return {
        stdout: host.history().map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n")
      };

    case "which":
    case "type": {
      const name = rest[0];
      if (!name) return { stdout: "" };
      if (env.aliases[name]) return { stdout: `${name}: aliased to \`${env.aliases[name]}'` };
      return {
        stdout: BUILTINS.has(name)
          ? `${name}: shell builtin`
          : `${name}: not found`
      };
    }

    /* ---- system ---- */
    case "uname":
      return { stdout: has("a") ? "YAIROS yairos-core 2.0 browser-sandboxed ybash x86_64" : "YAIROS" };

    case "hostname":
      return { stdout: "yairos-core" };

    case "date":
      return { stdout: new Date().toString() };

    case "cal":
      return { stdout: new Date().toLocaleDateString([], { month: "long", year: "numeric" }) };

    case "uptime":
      return { stdout: `up since page load · load average: 0.00, 0.01, 0.05` };

    case "df":
      return {
        stdout: "Filesystem     Size  Used Avail Use%\nlocalStorage     5M   ~1M   ~4M  20%  /"
      };

    case "free":
      return { stdout: "              total        used        free\nmem:      (browser-managed)" };

    case "sleep": {
      const secs = Math.min(Number(rest[0]) || 0, 10);
      await new Promise((r) => setTimeout(r, secs * 1000));
      return { stdout: "" };
    }

    case "clear":
      return { stdout: "" }; // ShellScreen wipes the buffer before we get here

    case "env":
      return {
        stdout: [
          `USER=${env.root ? "root" : "yair"}`,
          `HOME=${HOME}`,
          `PWD=${env.cwd}`,
          "SHELL=/bin/ybash",
          "TERM=yairos-256color",
          ...Object.entries(env.vars).map(([k, v]) => `${k}=${v}`)
        ].join("\n")
      };

    case "reset-fs": {
      if (!env.root) return rootOnly();
      env.tree = resetVfs();
      env.cwd = HOME;
      host.out("filesystem reset to defaults");
      return { stdout: "", halt: true };
    }

    /* ---- windows (root only) ---- */
    case "startx":
      if (!env.root) return rootOnly();
      host.wm.startx();
      return { stdout: "", halt: true };

    case "dash":
      if (!env.root) return rootOnly();
      host.wm.dash();
      return { stdout: "", halt: true };

    case "tile":
      if (!env.root) return rootOnly();
      host.wm.tile();
      return { stdout: "", halt: true };

    case "open": {
      if (!env.root) return rootOnly();
      if (rest[0] === "project") {
        const slug = rest[1];
        const proj = slug ? findProject(host, slug) : undefined;
        if (!proj) return void host.out(`open: no project ${slug ?? "?"} — see: ls /projects`), { stdout: "", halt: true };
        host.projects.openChat(proj.id);
        return { stdout: "", halt: true };
      }
      if (!rest[0]) return void host.out("usage: open <app>  |  open project <name>"), { stdout: "", halt: true };
      host.wm.open(rest[0]);
      return { stdout: "", halt: true };
    }

    case "close": {
      if (!env.root) return rootOnly();
      if (!rest[0]) return void host.out("usage: close <app>"), { stdout: "", halt: true };
      if (!host.wm.close(rest[0])) host.out(`${rest[0]}: not open`);
      return { stdout: "", halt: true };
    }

    case "ps": {
      const list = host.wm.list();
      return {
        stdout: list.length
          ? "  PID  WINDOW      STATE\n" +
            list
              .map((w, i) => `${String(i + 1).padStart(5)}  ${w.app.padEnd(10)} ${w.minimized ? "stopped" : "running"}`)
              .join("\n")
          : "no windows"
      };
    }

    case "kill": {
      if (!env.root) return rootOnly();
      const name = rest[0];
      if (!name) return void host.out("usage: kill <window>"), { stdout: "", halt: true };
      if (!host.wm.close(name)) host.out(`kill: ${name}: no such window`);
      return { stdout: "", halt: true };
    }

    case "apps":
      return {
        stdout: host.wm.apps().map((a) => `  ${a.command.padEnd(10)}${a.ready ? "" : "(pending)"}`).join("\n")
      };

    /* ---- docs ---- */
    case "man": {
      const topic = rest[0];
      if (!topic || !MANUALS[topic]) return void host.out(`man: topics — ${Object.keys(MANUALS).join(", ")}`), { stdout: "", halt: true };
      return { stdout: MANUALS[topic].join("\n") };
    }

    case "help":
      return {
        stdout: [
          "navigation   pwd  ls [-la]  cd  tree  find  basename  dirname",
          "files        cat  touch  mkdir [-p]  rm [-r]  cp  mv  ln  echo  printf",
          "text         grep [-i]  head [-n N]  tail [-n N]  wc",
          "perms        chmod  chown  whoami  id",
          "privilege    su  sudo  exit  passwd            (windows need root)",
          "crypto       hash [-1|-512]  encrypt  decrypt",
          "shell        alias  unalias  export  unset  env  history  which  type",
          "system       uname [-a]  hostname  date  cal  df  free  uptime  sleep  reset-fs",
          "windows      startx  dash  tile  open [project <n>]  close  ps  kill  apps",
          "docs         man bash | man root | man crypto | man projects",
          "",
          "redirection  >  >>        pipe  |        vars  $NAME",
          "lessons      ls /usr/share/lessons          projects  ls /projects (root)"
        ].join("\n")
      };

    default:
      host.out(`ybash: command not found: ${cmd}`);
      return { stdout: "", halt: true };
  }
}

/* ---------------- Interactive prompts ---------------- */

async function handlePending(input: string, env: ShellEnv, host: ShellHost): Promise<void> {
  const pending = env.pending!;
  env.pending = null;

  if (pending.kind === "su" || pending.kind === "sudo") {
    if (await checkMasterPass(input)) {
      if (pending.run) {
        // sudo <cmd>: run once as root, then revert
        env.root = true;
        mountProjects(env, host);
        try {
          const stages = parsePipeline(expandVars(applyAlias(pending.run, env), env));
          let piped = "";
          for (let i = 0; i < stages.length; i++) {
            if (!stages[i].argv.length) continue;
            const r = await runStage(stages[i].argv, piped, env, host, i > 0);
            if (r.halt) break;
            piped = r.stdout;
          }
          if (piped) host.out(piped);
        } finally {
          env.root = false;
        }
      } else {
        env.root = true;
        host.out(
          "root granted",
          "windows, /root and /projects are now yours. `exit` drops back.",
          "reminder: an app gate, not OS root — see `man root`"
        );
      }
    } else {
      host.out(pending.kind === "sudo" ? "sudo: authentication failure" : "su: authentication failure");
    }
    return;
  }

  if (pending.kind === "passwd-new") {
    if (input.length < 6) {
      host.out("passwd: too short (6+ characters)");
      return;
    }
    env.pending = { kind: "passwd-confirm", masked: true, draft: input };
    host.out("Retype new master password:");
    return;
  }

  if (pending.kind === "passwd-confirm") {
    if (input !== pending.draft) {
      host.out("passwd: passwords do not match");
      return;
    }
    saveRootPass(await hashPassphrase(input));
    host.out(
      "passwd: master password updated for this device",
      "stored as a PBKDF2-SHA256 verifier — the password itself is not kept"
    );
  }
}
