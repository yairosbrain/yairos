// One source of truth for what every ybash command does. `help` renders from
// it, /root/commands.md is seeded from it, and `ask` feeds it to the brain and
// falls back to matching against it offline.

export interface CmdEntry {
  name: string;
  usage: string;
  desc: string;
  root?: boolean;
}

export interface CmdGroup {
  title: string;
  items: CmdEntry[];
}

export const COMMAND_GROUPS: CmdGroup[] = [
  {
    title: "Navigation",
    items: [
      { name: "pwd", usage: "pwd", desc: "print the directory you're in" },
      { name: "ls", usage: "ls [-l] [-a] [path]", desc: "list a directory — -l detail, -a hidden" },
      { name: "cd", usage: "cd [path]", desc: "change directory — cd .. up, cd ~ home, cd - back" },
      { name: "tree", usage: "tree [path]", desc: "show a directory as a branching tree" },
      { name: "find", usage: "find [path]", desc: "list every path under one" },
      { name: "basename", usage: "basename <path>", desc: "just the last part of a path" },
      { name: "dirname", usage: "dirname <path>", desc: "just the folder part of a path" }
    ]
  },
  {
    title: "Reading",
    items: [
      { name: "cat", usage: "cat <file...>", desc: "print a file (sealed files show a hint)" },
      { name: "grep", usage: "grep [-i] <pattern> [file]", desc: "keep only lines that match — also reads a pipe" },
      { name: "head", usage: "head [-n N]", desc: "first 10 lines of a pipe (or N)" },
      { name: "tail", usage: "tail [-n N]", desc: "last 10 lines of a pipe (or N)" },
      { name: "wc", usage: "wc", desc: "count the lines coming through a pipe" }
    ]
  },
  {
    title: "Writing",
    items: [
      { name: "echo", usage: "echo <text>", desc: "print text (use > to send it to a file)" },
      { name: "printf", usage: 'printf "a\\nb"', desc: "print text, understands \\n and \\t" },
      { name: "touch", usage: "touch <file>", desc: "create an empty file" },
      { name: "mkdir", usage: "mkdir [-p] <dir>", desc: "make a directory — -p makes parents too" },
      { name: "rm", usage: "rm [-r] <path>", desc: "delete — -r for a non-empty directory" },
      { name: "cp", usage: "cp <src> <dst>", desc: "copy a file" },
      { name: "mv", usage: "mv <src> <dst>", desc: "move or rename" },
      { name: "ln", usage: "ln -s <target> <name>", desc: "link (this fs has no symlinks — it copies)" }
    ]
  },
  {
    title: "Permissions & identity",
    items: [
      { name: "chmod", usage: "chmod 700|644 <path>", desc: "700 makes it root-only, 644 opens it" },
      { name: "chown", usage: "chown root|yair <path>", desc: "change the owner", root: true },
      { name: "whoami", usage: "whoami", desc: "which user you are right now" },
      { name: "id", usage: "id", desc: "your user and group ids" }
    ]
  },
  {
    title: "Privilege",
    items: [
      { name: "su", usage: "su", desc: "become root (asks the master passphrase)" },
      { name: "sudo", usage: "sudo <cmd> | sudo su", desc: "run one command as root, or `sudo su` to stay root" },
      { name: "exit", usage: "exit", desc: "drop back down to yair" },
      { name: "passwd", usage: "passwd", desc: "set this device's master password" }
    ]
  },
  {
    title: "Crypto (real — Web Crypto)",
    items: [
      { name: "hash", usage: "hash <text> [-1|-512]", desc: "digest of text — SHA-256 by default" },
      { name: "encrypt", usage: "encrypt <file> <passphrase>", desc: "seal a file with AES-256-GCM" },
      { name: "decrypt", usage: "decrypt <file> <passphrase>", desc: "open a sealed file" }
    ]
  },
  {
    title: "Shell state (persists like .bashrc)",
    items: [
      { name: "alias", usage: "alias name='...'", desc: "make a command shortcut" },
      { name: "unalias", usage: "unalias name", desc: "remove a shortcut" },
      { name: "export", usage: "export NAME=value", desc: "set a variable — $NAME expands on the next line" },
      { name: "unset", usage: "unset NAME", desc: "remove a variable" },
      { name: "env", usage: "env", desc: "show the whole environment" },
      { name: "history", usage: "history", desc: "every command you've run this session" },
      { name: "which", usage: "which <name>", desc: "is this name a builtin or an alias?" },
      { name: "type", usage: "type <name>", desc: "same as which" }
    ]
  },
  {
    title: "System",
    items: [
      { name: "uname", usage: "uname [-a]", desc: "system name — -a for the full line" },
      { name: "hostname", usage: "hostname", desc: "the host name (yairos-core)" },
      { name: "date", usage: "date", desc: "current date and time" },
      { name: "cal", usage: "cal", desc: "the current month" },
      { name: "df", usage: "df", desc: "disk usage (mock — it's localStorage)" },
      { name: "free", usage: "free", desc: "memory (browser-managed)" },
      { name: "uptime", usage: "uptime", desc: "how long since the page loaded" },
      { name: "sleep", usage: "sleep <sec>", desc: "pause a few seconds (max 10)" },
      { name: "clear", usage: "clear", desc: "wipe the terminal" },
      { name: "reset-fs", usage: "reset-fs", desc: "restore the filesystem to its seed", root: true }
    ]
  },
  {
    title: "Windows (root only)",
    items: [
      { name: "startx", usage: "startx", desc: "open every window and tile them", root: true },
      { name: "dash", usage: "dash", desc: "open the standard set of windows", root: true },
      { name: "tile", usage: "tile", desc: "re-grid the open windows", root: true },
      { name: "open", usage: "open <app> | open project <name>", desc: "open a window, or a project's chat", root: true },
      { name: "close", usage: "close <app>", desc: "close a window", root: true },
      { name: "kill", usage: "kill <app>", desc: "same as close", root: true },
      { name: "ps", usage: "ps", desc: "list the open windows" },
      { name: "apps", usage: "apps", desc: "every window that can be opened" }
    ]
  },
  {
    title: "Projects (/projects is root only)",
    items: [
      { name: "ls /projects", usage: "ls /projects", desc: "every site Yairos has built", root: true },
      { name: "mkdir /projects/x", usage: "mkdir /projects/<folder>", desc: "make a folder to file projects under", root: true },
      { name: "mv (project)", usage: "mv /projects/<name> /projects/<folder>/", desc: "file a project under a folder", root: true },
      { name: "cat (project)", usage: "cat /projects/<name>", desc: "its status, live URL and repo", root: true }
    ]
  },
  {
    title: "Help",
    items: [
      { name: "man", usage: "man bash|root|crypto|projects", desc: "read a short manual" },
      { name: "help", usage: "help", desc: "the grouped command list" },
      { name: "ask", usage: "ask <what you want to do>", desc: "describe a task, get the command back", root: true }
    ]
  }
];

const EXTRA = [
  "Combine commands:",
  "  cmd1 | cmd2      send cmd1's output into cmd2",
  "  cmd > file       write output to a file (overwrites)",
  "  cmd >> file      append instead",
  "  $NAME            expands to a variable's value"
];

/** Flat lookup: name → entry */
export const COMMAND_INDEX: Record<string, CmdEntry> = Object.fromEntries(
  COMMAND_GROUPS.flatMap((g) => g.items).map((e) => [e.name, e])
);

/** The full /root/commands.md text */
export function renderCommandsDoc(): string {
  const lines = [
    "# YAIROS SHELL — every command",
    "",
    "This file lives in /root, so it's here only when you are root.",
    "Short version: `help`. Ask in words: `ask <what you want>`.",
    ""
  ];
  for (const g of COMMAND_GROUPS) {
    lines.push(`## ${g.title}`, "");
    for (const e of g.items) {
      const tag = e.root ? "  [root]" : "";
      lines.push(`  ${e.usage.padEnd(34)} ${e.desc}${tag}`);
    }
    lines.push("");
  }
  lines.push("## " + "Putting them together", "", ...EXTRA.map((l) => "  " + l), "");
  return lines.join("\n");
}

/** Compact form fed to the brain by `ask` */
export function commandListForPrompt(): string {
  return COMMAND_GROUPS.flatMap((g) =>
    g.items.map((e) => `${e.usage}  —  ${e.desc}${e.root ? " [root]" : ""}`)
  ).join("\n");
}

/** Offline fallback for `ask`: score entries by word overlap with the query */
export function matchCommands(query: string, limit = 4): CmdEntry[] {
  const words = query.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return COMMAND_GROUPS.flatMap((g) => g.items)
    .map((e) => {
      const hay = `${e.name} ${e.usage} ${e.desc}`.toLowerCase();
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
