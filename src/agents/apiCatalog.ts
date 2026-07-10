// Live index of the world's public APIs, powered by the famous GitHub
// "public-apis" project (thousands of categorized APIs, maintained fork
// with a JSON DB served from raw.githubusercontent.com — CORS-open).
// The CONNECTOR department searches it by topic keywords at build time,
// keeping only keyless CORS-enabled APIs a static site can call.

export interface CatalogApi {
  name: string;
  description: string;
  category: string;
  link: string;
}

interface RawEntry {
  API: string;
  Description: string;
  Auth: string;
  HTTPS: boolean;
  Cors: string;
  Link: string;
  Category: string;
}

const SOURCE =
  "https://raw.githubusercontent.com/marcelscruz/public-apis/main/db/resources.json";
const CACHE_KEY = "yairos.apiCatalog";
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function loadCatalog(): Promise<CatalogApi[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as {
      ts: number;
      apis: CatalogApi[];
    } | null;
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.apis.length) {
      return cached.apis;
    }
  } catch {
    /* bad cache — refetch */
  }
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: RawEntry[] };
    // A static browser site can only use keyless APIs that allow CORS
    const apis = (data.entries ?? [])
      .filter((e) => !e.Auth && e.Cors === "yes" && e.HTTPS)
      .map((e) => ({
        name: e.API,
        description: e.Description,
        category: e.Category,
        link: e.Link
      }));
    if (apis.length) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), apis }));
      } catch {
        /* storage full — still return the fresh list */
      }
      return apis;
    }
  } catch {
    /* directory unreachable — connector falls back to its built-in knowledge */
  }
  return [];
}

/** Score every catalog API against the project's topic keywords */
export async function findCandidateApis(
  keywords: string[],
  limit = 40
): Promise<CatalogApi[]> {
  const catalog = await loadCatalog();
  const kws = keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length > 2);
  if (!catalog.length || !kws.length) return [];
  return catalog
    .map((api) => {
      const hay =
        `${api.name} ${api.description} ${api.category}`.toLowerCase();
      const score = kws.reduce((s, k) => s + (hay.includes(k) ? 1 : 0), 0);
      return { api, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.api);
}

export function apisToPromptBlock(apis: CatalogApi[]): string {
  return apis
    .map((a) => `- ${a.name} [${a.category}]: ${a.description} — docs: ${a.link}`)
    .join("\n");
}
