import "server-only";
import type { Team } from "@/db/schema";
import { canManageTeam, isFundWide, listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { calibrate } from "@/lib/screener/calibration";
import { coveredNames, listFilingChanges, queueLength } from "@/lib/screener/filing-changes/store";
import { listPitches } from "@/lib/screener/pitches";
import { currentRun, latestScreen, screenForwardReturns } from "@/lib/screener/runs";
import { latestTearSheets } from "@/lib/screener/tear-sheets";
import { listWatchlist } from "@/lib/screener/watchlist";
import type { ScreenerQuery } from "./types";

/** How many hits a team sees each month (the spec's open question; five until the leads say fewer). */
export const TEAM_HITS = 5;

export type ScreenerScope = {
  teams: Team[];
  /** The team in view, or null for every team. */
  team: Team | null;
  teamIds: string[];
  fundWide: boolean;
  /** Teams this member can add to, record pitches for and mark flags on. */
  manageable: Team[];
};

/** Members start on their own team and execs and admins on the whole fund; `?team=all` or a slug changes it. */
export async function screenerScope(user: CurrentUser, q: Pick<ScreenerQuery, "team">): Promise<ScreenerScope> {
  const fundWide = isFundWide(user);
  const teams = await listAccessibleTeams(user);
  const all = teams.length ? teams : [];
  const named = q.team && q.team !== "all" ? all.find((t) => t.slug === q.team) : undefined;
  const team = named ?? (q.team === "all" || fundWide ? null : (user.team ?? null));
  return { teams: all, team, teamIds: team ? [team.id] : all.map((t) => t.id), fundWide, manageable: all.filter((t) => canManageTeam(user, t.id)) };
}

export async function loadLook(scope: ScreenerScope, track: ScreenerQuery["track"]) {
  const [screen, running] = await Promise.all([latestScreen(), currentRun()]);
  if (!screen) return { screen: null, running, hits: [], sheets: new Map(), returns: null };
  // Not awaited: the rail's Paper portfolio card streams in (a day-cached Yahoo read per hit).
  const returns = screenForwardReturns(screen.run.id).catch(() => null);
  const inScope = new Set(scope.teamIds);
  const hits = screen.hits
    .filter((h) => h.teamId && inScope.has(h.teamId) && h.teamRank !== null && h.teamRank <= TEAM_HITS)
    .filter((h) => track === "all" || h.track === track)
    .sort((a, b) => (a.teamId === b.teamId ? a.teamRank! - b.teamRank! : a.rank - b.rank));
  const sheets = await latestTearSheets(hits.map((h) => h.ticker));
  return { screen, running, hits, sheets, returns };
}

export async function loadChanges(scope: ScreenerScope, showAll: boolean) {
  const covered = (await coveredNames()).filter((c) => scope.teamIds.includes(c.teamId));
  const tickers = [...new Set(covered.map((c) => c.ticker))];
  const [changes, queued] = await Promise.all([tickers.length ? listFilingChanges({ tickers, limit: 200 }) : Promise.resolve([]), queueLength().catch(() => 0)]);
  const marked = changes.filter((c) => c.verdict);
  const shown = showAll ? changes : changes.filter((c) => !c.verdict && !c.dismissedBy);
  return { covered, changes: shown, total: changes.length, toMark: changes.filter((c) => !c.verdict && !c.dismissedBy).length, real: marked.filter((c) => c.verdict === "real").length, marked: marked.length, queued };
}

export async function loadPitches(scope: ScreenerScope) {
  const pitches = await listPitches({ teamIds: scope.teamIds });
  // Calibration is for execs and admins: every team, by team and cohort, never by person.
  const calibration = scope.fundWide ? calibrate((scope.team ? await listPitches({}) : pitches).map((p) => ({ teamId: p.teamId, cohort: p.cohort, confidence: p.confidence, intrinsicValue: p.intrinsicValue, outcome: p.outcome }))) : null;
  return { pitches, calibration };
}

export async function loadWatchlist(scope: ScreenerScope) {
  const rows = await listWatchlist(scope.teamIds);
  const changes = rows.length ? await listFilingChanges({ tickers: rows.map((r) => r.ticker), limit: 300 }).catch(() => []) : [];
  const open = new Map<string, number>();
  for (const c of changes) if (!c.verdict && !c.dismissedBy) open.set(c.ticker, (open.get(c.ticker) ?? 0) + 1);
  return { rows, open };
}
