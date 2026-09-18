/**
 * Pure helpers that turn a flat Drive listing into paths and map folders to teams and holdings.
 * Expected layout under the root folder: `<Sector or team> / <Company (TICKER)> / files`.
 */
export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

export type DriveDocKind = "initiating_coverage" | "earnings_update" | "model" | "other";

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string | number;
  modifiedTime?: string;
  webViewLink?: string;
  md5Checksum?: string;
};

export type PathedItem = DriveItem & { parentId: string | null; path: string; depth: number; ancestors: string[]; isFolder: boolean };

export type HoldingRef = { id: string; ticker: string; companyName: string; teamId: string };
export type TeamRef = { id: string; name: string };

export type ClassifiedItem = PathedItem & { teamId: string | null; ticker: string | null; holdingId: string | null; kind: DriveDocKind | null };

/** Attach path/depth/ancestors to every item reachable from the root. Items outside the root's subtree are dropped. */
export function buildPaths(rootId: string, items: DriveItem[]): PathedItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: PathedItem[] = [];
  for (const item of items) {
    const chain: DriveItem[] = [];
    let cur: DriveItem | undefined = item;
    let reached = false;
    const seen = new Set<string>();
    while (cur) {
      const parent: string | undefined = cur.parents?.[0];
      if (parent === rootId) {
        reached = true;
        break;
      }
      if (!parent || seen.has(parent)) break;
      seen.add(parent);
      const p = byId.get(parent);
      if (!p) break;
      chain.unshift(p);
      cur = p;
    }
    if (!reached) continue;
    out.push({
      ...item,
      parentId: item.parents?.[0] ?? null,
      path: [...chain.map((c) => c.name), item.name].join("/"),
      depth: chain.length + 1,
      ancestors: chain.map((c) => c.id),
      isFolder: item.mimeType === FOLDER_MIME,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const ARCHIVE_FOLDER = /(^|\/)(old|past|former|archive[sd]?|exited|closed)\b[^/]*(\/|$)/i;

const NOISE = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings|holding|group|the|sa|nv|ag)\b/g;

export function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)]\s*/, "") // "1. Consumer…" / "2) Energy" numbering
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\bcoverage\b/g, " ")
    .replace(/\b([a-z]{4,})s\b/g, "$1") // communications → communication
    .replace(/\s+/g, " ")
    .trim();
}

export function matchTeam(folderName: string, teams: TeamRef[]): TeamRef | null {
  const n = normalizeName(folderName);
  if (!n) return null;
  return teams.find((t) => {
    const tn = normalizeName(t.name);
    return tn === n || tn.includes(n) || n.includes(tn);
  }) ?? null;
}

/** A ticker-looking token in the last parentheses of a name, e.g. "American Express (AXP)" → "AXP". */
export function parenthesizedTicker(name: string): string | null {
  const m = name.match(/\(([A-Za-z][A-Za-z0-9.\-]{0,9})\)\s*$/) ?? name.match(/\(([A-Za-z][A-Za-z0-9.\-]{0,9})\)/g)?.slice(-1)[0]?.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

function tickerMatches(token: string, ticker: string) {
  if (ticker.length <= 2) return token === ticker; // "F" must be written as F, not f
  return token.toUpperCase() === ticker.toUpperCase();
}

/**
 * Resolve a company folder name to a holding. Order: (TICKER) in parentheses, an all-caps token equal to a ticker,
 * then a company-name prefix match. When the same ticker exists on several teams, prefer `preferTeamId`; if it is
 * still ambiguous, return null so the sync can report it instead of guessing.
 */
export function matchHolding(folderName: string, holdings: HoldingRef[], preferTeamId?: string | null): HoldingRef | null {
  let candidates: HoldingRef[] = [];
  const paren = parenthesizedTicker(folderName);
  if (paren) candidates = holdings.filter((h) => tickerMatches(paren, h.ticker));
  if (!candidates.length) {
    const tokens = folderName.split(/[^A-Za-z0-9.]+/).filter(Boolean);
    candidates = holdings.filter((h) => tokens.some((t) => /^[A-Z0-9.\-]+$/.test(t) && tickerMatches(t, h.ticker)));
  }
  if (!candidates.length) {
    const n = normalizeName(folderName);
    if (n.length >= 4) {
      candidates = holdings.filter((h) => {
        const c = normalizeName(h.companyName);
        return c.length >= 4 && (c.startsWith(n) || n.startsWith(c));
      });
    }
  }
  if (candidates.length > 1 && preferTeamId) {
    const preferred = candidates.filter((h) => h.teamId === preferTeamId);
    if (preferred.length) candidates = preferred;
  }
  const ids = new Set(candidates.map((c) => c.id));
  return ids.size === 1 ? candidates[0] : null;
}

const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-excel",
  "application/vnd.google-apps.spreadsheet",
]);

export function inferKind(name: string, mimeType: string): DriveDocKind {
  if (XLSX_MIMES.has(mimeType) || /\.xls[xm]?$/i.test(name)) return "model";
  if (/initiat|coverage|\bIC\b|pitch/i.test(name)) return "initiating_coverage";
  if (/earnings|\bQ[1-4]\b|\bFY\d{2,4}\b|update|results/i.test(name)) return "earnings_update";
  return "other";
}

/**
 * Walk each item's ancestor chain from the root down. The depth-1 folder names the team (sector); the first folder at
 * any depth that resolves to a holding assigns the ticker to everything beneath it. Folders that carry a "(TICKER)"
 * but match no active holding keep the ticker so the files surface as soon as the holding is added, and are reported
 * as unmatched. Structural folders (sub-sectors, "Current Holdings", semesters) are simply passed through.
 */
export function classifyTree(rootId: string, items: DriveItem[], holdings: HoldingRef[], teams: TeamRef[]): { items: ClassifiedItem[]; unmatched: string[] } {
  const pathed = buildPaths(rootId, items);
  const byId = new Map(pathed.map((p) => [p.id, p]));
  const folderInfo = new Map<string, { teamId: string | null; ticker: string | null; holdingId: string | null }>();
  const unmatched = new Set<string>();

  for (const p of pathed) {
    if (!p.isFolder) continue;
    const parentInfo = p.parentId && p.parentId !== rootId ? folderInfo.get(p.parentId) : undefined;
    const inheritedTeam = parentInfo?.teamId ?? null;
    let teamId = inheritedTeam;
    let ticker = parentInfo?.ticker ?? null;
    let holdingId = parentInfo?.holdingId ?? null;

    if (!holdingId) {
      const team = p.depth === 1 ? matchTeam(p.name, teams) : null;
      if (team) teamId = team.id;
      else {
        const h = matchHolding(p.name, holdings, teamId);
        if (h) {
          holdingId = h.id;
          ticker = h.ticker;
          teamId = teamId ?? h.teamId;
        } else {
          const paren = parenthesizedTicker(p.name);
          if (paren) {
            // Looks like a company folder but matches no active holding: worth showing the admin, unless it sits
            // under an archive folder (Old Holdings, Past Pitches) where that is expected.
            ticker = paren.toUpperCase();
            if (!ARCHIVE_FOLDER.test(p.path.split("/").slice(0, -1).join("/"))) unmatched.add(p.path);
          }
        }
      }
    }
    folderInfo.set(p.id, { teamId, ticker, holdingId });
  }

  const out: ClassifiedItem[] = pathed.map((p) => {
    const info = p.isFolder ? folderInfo.get(p.id) : p.parentId && p.parentId !== rootId ? folderInfo.get(p.parentId) : undefined;
    return {
      ...p,
      teamId: info?.teamId ?? null,
      ticker: info?.ticker ?? null,
      holdingId: info?.holdingId ?? null,
      kind: p.isFolder ? null : inferKind(p.name, p.mimeType),
    };
  });
  void byId;
  return { items: out, unmatched: [...unmatched].sort() };
}
