// A small in-browser filesystem, so the shell has something real to operate on.
// It lives in localStorage under this origin, which means it is genuinely
// isolated from the machine: nothing here can read or write a real file.

import { renderCommandsDoc } from "./commandHelp";

export interface VFile {
  type: "file";
  content: string;
  /** true once the contents have been sealed by `encrypt` */
  sealed?: boolean;
  /** root-only nodes are hidden from a normal user */
  root?: boolean;
  mtime: number;
}

export interface VDir {
  type: "dir";
  children: Record<string, VNode>;
  root?: boolean;
  mtime: number;
}

export type VNode = VFile | VDir;

const STORE_KEY = "yairos.vfs";

const file = (content: string, opts: Partial<VFile> = {}): VFile => ({
  type: "file",
  content,
  mtime: Date.now(),
  ...opts
});

const dir = (children: Record<string, VNode>, opts: Partial<VDir> = {}): VDir => ({
  type: "dir",
  children,
  mtime: Date.now(),
  ...opts
});

/** The tree a fresh install starts with */
export function seedTree(): VDir {
  return dir({
    home: dir({
      yair: dir({
        "README.txt": file(
          [
            "ברוך הבא ל-YAIROS SHELL.",
            "",
            "זו מערכת קבצים אמיתית שחיה בדפדפן שלך בלבד —",
            "שום פקודה כאן לא נוגעת בקבצים האמיתיים של המחשב.",
            "",
            "התחל מ:  help        — כל הפקודות",
            "         man bash    — איך עובד shell",
            "         ls /usr/share/lessons",
            ""
          ].join("\n")
        ),
        notes: dir({
          "ideas.md": file("# רעיונות\n\n- \n")
        })
      })
    }),
    etc: dir({
      "yairos.conf": file(
        [
          "# YAIROS system configuration",
          "hostname=yairos-core",
          "shell=/bin/ybash",
          "locale=he_IL.UTF-8",
          ""
        ].join("\n")
      ),
      hostname: file("yairos-core\n")
    }),
    root: dir(
      {
        "flag.txt": file(
          "אם אתה קורא את זה — עברת את שער ההרשאות.\nזכור: זה שער של האפליקציה, לא של מערכת ההפעלה.\n",
          { root: true }
        ),
        // The full command reference — only here, only for root.
        "commands.md": file(renderCommandsDoc(), { root: true }),
        "README": file(
          [
            "/root — your workspace.",
            "",
            "  cat commands.md      every command, grouped, one line each",
            "  ask <what you want>  describe a task, get the command back",
            "  ls /projects         your built sites (mkdir/mv to file them)",
            ""
          ].join("\n"),
          { root: true }
        )
      },
      { root: true }
    ),
    usr: dir({
      share: dir({
        lessons: dir({
          "01-bash-basics.md": file(
            [
              "# BASH — היסודות",
              "",
              "## איפה אני",
              "  pwd              מדפיס את התיקייה הנוכחית",
              "  ls               מה יש כאן    (ls -l מפורט, ls -a כולל מוסתרים)",
              "  cd <path>        מעבר תיקייה  (cd .. אחורה, cd ~ הביתה, cd - חזרה)",
              "",
              "## קבצים",
              "  cat <file>       הדפס תוכן",
              "  touch <file>     צור קובץ ריק",
              "  mkdir -p a/b/c   צור תיקיות כולל הורים",
              "  rm <file>        מחק      (rm -r לתיקייה)",
              "  cp / mv          העתק / העבר",
              "",
              "## נתיבים",
              "  /  שורש     .  כאן     ..  הורה     ~  הבית שלי",
              "  נתיב שמתחיל ב-/ הוא מוחלט. אחרת הוא יחסי לאיפה שאתה עומד.",
              ""
            ].join("\n")
          ),
          "02-pipes-redirect.md": file(
            [
              "# צינורות והפניה",
              "",
              "## הפניית פלט",
              "  echo hello > file.txt      כתוב לקובץ (דורס!)",
              "  echo more >> file.txt      הוסף בסוף",
              "",
              "## צינור",
              "  cat file.txt | grep error  הפלט של הראשון הוא הקלט של השני",
              "  ls -l | grep .md",
              "",
              "הרעיון המרכזי של יוניקס: כלים קטנים שעושים דבר אחד,",
              "ומתחברים זה לזה בצינור. זה הכל.",
              ""
            ].join("\n")
          ),
          "03-permissions.md": file(
            [
              "# הרשאות ומשתמשים",
              "",
              "  whoami           מי אני עכשיו",
              "  id               המשתמש והקבוצה",
              "  su               הפוך ל-root  (דורש את הסיסמה שהגדרת)",
              "  exit             חזור למשתמש רגיל",
              "  passwd           הגדר/שנה סיסמת root",
              "",
              "ב-Linux אמיתי root יכול הכל — לקרוא כל קובץ, להרוג כל תהליך,",
              "לשנות כל הגדרה. לכן עובדים כמשתמש רגיל ומעלים הרשאות רק כשצריך.",
              "",
              "כאן: /root נעול, ופקודות הרסניות דורשות root — כדי לתרגל את ההרגל.",
              "אבל קרא את `man root` לפני שאתה סומך על זה כהגנה.",
              ""
            ].join("\n")
          ),
          "04-crypto.md": file(
            [
              "# הצפנה",
              "",
              "  hash <text>                    טביעת אצבע SHA-256",
              "  encrypt <file> <passphrase>    אטום קובץ ב-AES-256-GCM",
              "  decrypt <file> <passphrase>    פתח אותו",
              "",
              "ההצפנה כאן אמיתית — Web Crypto של הדפדפן, לא הדמיה.",
              "",
              "## למה AES-GCM ולא סתם AES",
              "GCM הוא 'מאומת': הוא לא רק מצפין, הוא גם חותם.",
              "אם מישהו שינה בית אחד בטקסט המוצפן — הפענוח ייכשל,",
              "במקום להחזיר זבל שנראה כאילו הצליח.",
              "",
              "## למה PBKDF2",
              "סיסמה אנושית קצרה מדי בשביל מפתח. PBKDF2 מותח אותה",
              "210,000 סיבובים, כך שניחוש בכוח גס נעשה יקר.",
              "כל הצפנה מקבלת salt ו-IV אקראיים — לכן אותו טקסט",
              "עם אותה סיסמה ייתן פלט שונה בכל פעם. זה תקין ורצוי.",
              ""
            ].join("\n")
          )
        })
      })
    }),
    var: dir({
      log: dir({
        "boot.log": file("yairos-core: system initialised\n")
      })
    }),
    tmp: dir({})
  });
}

/* ---------------- Persistence ---------------- */

export function loadVfs(): VDir {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedTree();
    const parsed = JSON.parse(raw) as VDir;
    if (parsed && parsed.type === "dir") return parsed;
  } catch {
    /* corrupt store — fall through to a clean tree */
  }
  return seedTree();
}

export function saveVfs(root: VDir): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(root));
  } catch {
    /* quota exceeded — the tree stays in memory for this session */
  }
}

export function resetVfs(): VDir {
  const fresh = seedTree();
  saveVfs(fresh);
  return fresh;
}

/* ---------------- Path handling ---------------- */

export const HOME = "/home/yair";

/** Resolve a possibly-relative path into a normalised absolute one */
export function resolvePath(cwd: string, input: string): string {
  let path = input.trim();
  if (!path) return cwd;
  if (path === "~" || path.startsWith("~/")) path = HOME + path.slice(1);
  const segments = (path.startsWith("/") ? path : `${cwd}/${path}`).split("/");
  const out: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || "/";
}

/** Walk to a node. Returns null when any segment is missing. */
export function getNode(root: VDir, path: string): VNode | null {
  if (path === "/") return root;
  let node: VNode = root;
  for (const seg of path.split("/").filter(Boolean)) {
    if (node.type !== "dir") return null;
    const next: VNode | undefined = node.children[seg];
    if (!next) return null;
    node = next;
  }
  return node;
}

export function isDir(n: VNode | null): n is VDir {
  return !!n && n.type === "dir";
}

export function isFile(n: VNode | null): n is VFile {
  return !!n && n.type === "file";
}

/**
 * True when the node — or anything above it — is root-only.
 * Checked on every read and write, so `/root` stays shut for a normal user.
 */
export function needsRoot(root: VDir, path: string): boolean {
  let node: VNode = root;
  if (node.root) return true;
  for (const seg of path.split("/").filter(Boolean)) {
    if (node.type !== "dir") break;
    const next: VNode | undefined = node.children[seg];
    if (!next) break;
    if (next.root) return true;
    node = next;
  }
  return false;
}

/** Create a directory, optionally creating missing parents (`mkdir -p`) */
export function makeDir(root: VDir, path: string, parents: boolean): string | null {
  const segs = path.split("/").filter(Boolean);
  let node: VDir = root;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const existing: VNode | undefined = node.children[seg];
    const last = i === segs.length - 1;
    if (existing) {
      if (existing.type !== "dir") return `not a directory: ${seg}`;
      if (last && !parents) return `already exists: ${path}`;
      node = existing;
      continue;
    }
    if (!last && !parents) return `no such directory: ${seg}`;
    const created = dir({});
    node.children[seg] = created;
    node = created;
  }
  return null;
}

export function writeFile(root: VDir, path: string, content: string): string | null {
  const parent = getNode(root, parentOf(path));
  if (!isDir(parent)) return `no such directory: ${parentOf(path)}`;
  const name = baseName(path);
  const existing = parent.children[name];
  if (existing && existing.type === "dir") return `is a directory: ${path}`;
  parent.children[name] = file(content, {
    root: (existing as VFile | undefined)?.root
  });
  return null;
}

export function removeNode(
  root: VDir,
  path: string,
  recursive: boolean
): string | null {
  if (path === "/") return "refusing to remove /";
  const parent = getNode(root, parentOf(path));
  if (!isDir(parent)) return `no such path: ${path}`;
  const name = baseName(path);
  const target = parent.children[name];
  if (!target) return `no such file or directory: ${path}`;
  if (target.type === "dir" && Object.keys(target.children).length && !recursive) {
    return `directory not empty: ${path} (use -r)`;
  }
  delete parent.children[name];
  return null;
}

export { file as makeFile, dir as makeDirNode };
