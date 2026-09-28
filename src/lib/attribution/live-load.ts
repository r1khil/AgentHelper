import "server-only";
import { db } from "@/db/client";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { marketPhase } from "@/lib/providers/calendar";
import { getIntradayBars, getQuotes } from "@/lib/providers/yahoo";
import { getTeamBySlug } from "@/lib/teams";
import { buildLiveSnapshot, DOW_SYMBOL, intradayPath, type LiveQuote, type LiveSnapshot, type PathPoint } from "./live";
import { loadTeamSectors } from "./load";
import { benchmarkSymbols, type GicsSector } from "./sectors";
import { readSeriesInputs } from "./store";

export type LiveScope = { team?: { id: string; name: string; slug: string; sectors: GicsSector[] } };

/** Who may see which book, the same rule as Attribution: execs and admins the Fund, a team's lead and fund-wide roles the team. Null when not allowed. */
export async function liveScopeFor(user: CurrentUser, teamSlug: string | null): Promise<LiveScope | null> {
  if (!teamSlug) return isFundWide(user) ? {} : null;
  const team = await getTeamBySlug(teamSlug);
  if (!team || !canManageTeam(user, team.id)) return null;
  const sectors = (await loadTeamSectors()).get(team.id) ?? [];
  return { team: { id: team.id, name: team.name, slug: team.slug, sectors } };
}

export async function loadLiveSnapshot(scope: LiveScope, now = new Date()): Promise<LiveSnapshot | null> {
  const raw = await readSeriesInputs(db);
  const market = marketPhase(now);
  const symbols = [...new Set([...raw.trades.map((t) => t.ticker), ...benchmarkSymbols(), DOW_SYMBOL])];
  let quotes: Record<string, LiveQuote> = {};
  let quotesFailed = false;
  try {
    quotes = await getQuotes(symbols);
  } catch (e) {
    quotesFailed = true;
    console.error("[daily] quotes failed", e);
  }
  const snapshot = buildLiveSnapshot({ raw, quotes, market, now, team: scope.team });
  if (snapshot && quotesFailed) snapshot.notes.unshift("Live quotes are unavailable right now; showing the last stored closes.");
  return snapshot;
}

/** The session so far in five-minute steps, ending on the snapshot's own figures while it is still moving. */
export async function loadLivePath(snapshot: LiveSnapshot): Promise<PathPoint[]> {
  const over = snapshot.status === "final" || snapshot.phase !== "open";
  const symbols = [...new Set([...snapshot.legs.portfolio, ...snapshot.legs.benchmark].map((l) => l.symbol))];
  const bars = Object.fromEntries(
    await Promise.all(
      symbols.map(async (s) => {
        try {
          return [s, await getIntradayBars(s, snapshot.session, over)] as const;
        } catch {
          return [s, []] as const;
        }
      }),
    ),
  );
  const end = snapshot.status !== "final" && snapshot.asOf ? { t: snapshot.asOf, ...snapshot.pathEnd } : undefined;
  return intradayPath(snapshot.legs, bars, end);
}

