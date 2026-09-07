import type { Project } from "../types";
import type { ShellProject } from "./shell";

// Bridges the real project list to the shell's /projects tree. Folder names
// live on this device (empty folders have no project to hang a name on);
// which folder a project sits in is a field on the project itself, so it
// syncs across devices through Convex.

const FOLDERS_KEY = "yairos.projectFolders";

export function loadFolders(): string[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveFolders(list: string[]): void {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([...new Set(list)].sort()));
  } catch {
    /* non-fatal */
  }
}

export function addFolder(name: string): void {
  saveFolders([...loadFolders(), name.replace(/[^A-Za-z0-9._-]/g, "-")]);
}

export function removeFolder(name: string, isEmpty: boolean): boolean {
  if (!isEmpty) return false;
  saveFolders(loadFolders().filter((f) => f !== name));
  return true;
}

/** A short, greppable handle for a project — friendly when it can be */
export function projectSlug(p: Project): string {
  const fromName = p.name
    .toLowerCase()
    .replace(/[֐-׿]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (fromName.length >= 3) return fromName;
  // Hebrew name → fall back to the live URL's first label (usually the
  // friendly project name), then the repo name, then the id tail.
  const host = p.liveUrl?.replace(/^https?:\/\//, "").split(/[./]/)[0];
  if (host && host.length >= 3) return host;
  const m = p.repoUrl?.match(/github\.com\/[^/]+\/([^/]+)/);
  if (m) return m[1];
  return p.id.slice(-6);
}

export function toShellProjects(projects: Project[]): ShellProject[] {
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: projectSlug(p),
    folder: (p as Project & { folder?: string }).folder || undefined,
    status: p.status,
    live: p.liveUrl,
    repo: p.repoUrl
  }));
}

/** Accept an exact slug, a slug prefix, or a substring of the name */
export function matchProject(
  items: ShellProject[],
  query: string
): ShellProject | undefined {
  const q = query.toLowerCase();
  return (
    items.find((p) => p.slug === q) ||
    items.find((p) => p.slug.startsWith(q)) ||
    items.find((p) => p.name.toLowerCase().includes(q))
  );
}
