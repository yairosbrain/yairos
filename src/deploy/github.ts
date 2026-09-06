import type { SiteFile } from "../types";

// DEPLOYER Track A — talks to the GitHub REST API directly from the browser.
// Creates a public repo, uploads the files, enables GitHub Pages.
// Token comes from device localStorage only.

const API = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

async function gh(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[֐-׿]/g, "") // Hebrew letters can't live in a repo URL
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `yairos-site-${Date.now().toString(36)}`;
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function putFile(
  token: string,
  owner: string,
  repo: string,
  file: SiteFile,
  message: string
): Promise<void> {
  // If the file already exists we must send its sha
  let sha: string | undefined;
  const existing = await gh(
    token,
    "GET",
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`
  );
  if (existing.ok) {
    const data = (await existing.json()) as { sha?: string };
    sha = data.sha;
  }
  const res = await gh(
    token,
    "PUT",
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`,
    {
      message,
      content: toBase64Utf8(file.content),
      ...(sha ? { sha } : {})
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upload failed for ${file.path}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

async function waitForBranch(
  token: string,
  owner: string,
  repo: string
): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const res = await gh(token, "GET", `/repos/${owner}/${repo}/branches/main`);
    if (res.ok) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("main branch did not initialize in time");
}

export interface DeployResult {
  repoUrl: string;
  liveUrl: string;
  repoName: string;
}

export async function createRepoAndDeploy(
  token: string,
  owner: string,
  name: string,
  description: string,
  files: SiteFile[],
  onProgress: (step: string) => void
): Promise<DeployResult> {
  let repoName = slugify(name);

  onProgress("repo");
  const create = await gh(token, "POST", "/user/repos", {
    name: repoName,
    description: description.slice(0, 300),
    auto_init: true,
    has_wiki: false,
    has_projects: false
  });
  if (create.status === 422) {
    // Name taken — make it unique
    repoName = `${repoName}-${Date.now().toString(36).slice(-4)}`;
    const retry = await gh(token, "POST", "/user/repos", {
      name: repoName,
      description: description.slice(0, 300),
      auto_init: true
    });
    if (!retry.ok) {
      const body = await retry.text().catch(() => "");
      throw new Error(`Repo creation failed: HTTP ${retry.status} ${body.slice(0, 200)}`);
    }
  } else if (!create.ok) {
    const body = await create.text().catch(() => "");
    throw new Error(`Repo creation failed: HTTP ${create.status} ${body.slice(0, 200)}`);
  }

  await waitForBranch(token, owner, repoName);

  onProgress("upload");
  for (const file of files) {
    await putFile(token, owner, repoName, file, `YAIROS: add ${file.path}`);
  }

  onProgress("pages");
  const pages = await gh(token, "POST", `/repos/${owner}/${repoName}/pages`, {
    source: { branch: "main", path: "/" }
  });
  if (!pages.ok && pages.status !== 409) {
    // 409 = Pages already enabled
    const body = await pages.text().catch(() => "");
    throw new Error(`Enabling Pages failed: HTTP ${pages.status} ${body.slice(0, 200)}`);
  }

  return {
    repoName,
    repoUrl: `https://github.com/${owner}/${repoName}`,
    liveUrl: `https://${owner}.github.io/${repoName}/`
  };
}

export async function updateRepoFiles(
  token: string,
  owner: string,
  repo: string,
  files: SiteFile[]
): Promise<void> {
  for (const file of files) {
    await putFile(token, owner, repo, file, `YAIROS: update ${file.path}`);
  }
}

const TEXT_EXT = /\.(html?|css|js|mjs|json|svg|txt|md|xml|webmanifest)$/i;

export async function getRepoTextFiles(
  token: string,
  owner: string,
  repo: string
): Promise<SiteFile[]> {
  const tree = await gh(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/trees/main?recursive=1`
  );
  if (!tree.ok) throw new Error(`Could not read repo tree: HTTP ${tree.status}`);
  const data = (await tree.json()) as {
    tree: { path: string; type: string; size?: number }[];
  };
  const paths = data.tree
    .filter(
      (n) =>
        n.type === "blob" &&
        TEXT_EXT.test(n.path) &&
        (n.size ?? 0) < 400_000 &&
        n.path !== "README.md"
    )
    .slice(0, 30);

  const files: SiteFile[] = [];
  for (const n of paths) {
    const res = await gh(
      token,
      "GET",
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(n.path)}`
    );
    if (!res.ok) continue;
    const body = (await res.json()) as { content?: string; encoding?: string };
    if (body.content && body.encoding === "base64") {
      files.push({ path: n.path, content: fromBase64Utf8(body.content) });
    }
  }
  return files;
}

export function parseRepoUrl(
  repoUrl: string
): { owner: string; repo: string } | null {
  const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export interface TokenCheck {
  ok: boolean;
  /** GitHub login the token actually belongs to */
  login?: string;
  /** Scopes present on a classic token; empty for fine-grained ones */
  scopes: string[];
  missing: string[];
  error?: string;
}

/**
 * Verify the stored token before a build depends on it. A 401 here is the
 * whole failure, surfaced in one second instead of halfway through a deploy.
 *
 * Classic tokens report their scopes in x-oauth-scopes, so missing ones can be
 * named exactly. Fine-grained tokens send no such header — absence of scopes is
 * therefore not treated as missing permission, only as unknown.
 */
export async function verifyToken(token: string): Promise<TokenCheck> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, scopes: [], missing: [], error: "empty" };

  let res: Response;
  try {
    res = await gh(trimmed, "GET", "/user");
  } catch (e) {
    return {
      ok: false,
      scopes: [],
      missing: [],
      error: e instanceof Error ? e.message : String(e)
    };
  }

  if (res.status === 401) {
    return { ok: false, scopes: [], missing: [], error: "bad-credentials" };
  }
  if (!res.ok) {
    return { ok: false, scopes: [], missing: [], error: `HTTP ${res.status}` };
  }

  const login = ((await res.json()) as { login?: string }).login;
  const header = res.headers.get("x-oauth-scopes") ?? "";
  const scopes = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // No header at all means a fine-grained token: its permissions live
  // server-side and cannot be introspected, so don't guess they're absent.
  const fineGrained = !res.headers.has("x-oauth-scopes");
  const missing = fineGrained
    ? []
    : ["repo", "delete_repo"].filter((s) => !scopes.includes(s));

  return { ok: true, login, scopes, missing };
}

export type RepoDeleteOutcome =
  | { ok: true; alreadyGone?: boolean }
  | { ok: false; reason: "scope" | "auth" | "other"; detail: string };

/**
 * Permanently delete a repository — this also takes its GitHub Pages site
 * offline, since Pages is served from the repo. There is no undo.
 *
 * Needs a token carrying `delete_repo` (classic) or Administration:write
 * (fine-grained). GitHub answers 403 when the scope is missing, which is worth
 * distinguishing: the fix is a new token, not a retry.
 */
export async function deleteRepo(
  token: string,
  owner: string,
  repo: string
): Promise<RepoDeleteOutcome> {
  let res: Response;
  try {
    res = await gh(token, "DELETE", `/repos/${owner}/${repo}`);
  } catch (e) {
    return { ok: false, reason: "other", detail: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === 204) return { ok: true };
  // Already deleted elsewhere — the end state the caller wanted is satisfied
  if (res.status === 404) return { ok: true, alreadyGone: true };
  if (res.status === 403) {
    return {
      ok: false,
      reason: "scope",
      detail: "token lacks delete_repo / Administration:write"
    };
  }
  if (res.status === 401) return { ok: false, reason: "auth", detail: "bad token" };

  let detail = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) detail = body.message;
  } catch {
    /* non-JSON error body — the status is enough */
  }
  return { ok: false, reason: "other", detail };
}
