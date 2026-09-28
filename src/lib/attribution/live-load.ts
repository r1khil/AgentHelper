import "server-only";
import { db } from "@/db/client";
import type { CurrentUser } from "@/lib/auth";
import { canManageTeam, isFundWide } from "@/lib/roles";
import { marketPhase } from "@/lib/providers/calendar";
import { getIntradayBars, getQuotes } from "@/lib/providers/yahoo";
import { etfsAmong } from "@/lib/lookthrough/store";
import { eq } from "drizzle-orm";
import { teams } from "@/db/schema";
import { buildLiveSnapshot, DOW_SYMBOL, intradayPath, type LiveQuote, type LiveSnapshot, type PathPoint } from "./live";
import { loadTeamSectors } from "./load";
import { benchmarkSymbols, type GicsSector } from "./sectors";
import { readSeriesInputs } from "./store";

export type LiveScope = { team?: { id: string; name: string; slug: string; sectors: GicsSector[] } };

/** Who may see which book, the same rule as Attribution: execs and admins the Fund, a team's lead and fund-wide roles the team. Null when not allowed. */
export async function liveScopeFor(user: CurrentUser, teamSlug: string | null): Promise<LiveScope | null> {
  if (!teamSlug) return isFundWide(user) ? {} : null;
  // A direct query rather than lib/teams, which pulls in next/navigation (Hoot's tools load this module in scripts too).
  const [team] = await db.select().from(teams).where(eq(teams.slug, teamSlug)).limit(1);
  if (!team || !canManageTeam(user, team.id)) return null;
  const sectors = (await loadTeamSectors()).get(team.id) ?? [];
  return { team: { id: team.id, name: team.name, slug: team.slug, sectors } };
}

export async function loadLiveSnapshot(scope: LiveScope, now = new Date()): Promise<LiveSnapshot | null> {
  const raw = await readSeriesInputs(db);
  const market = marketPhase(now);
  const symbols = [...new Set([...raw.trades.map((t) => t.ticker), ...benchmarkSymbols(), DOW_SYMBOL])];
  let quotesFailed = false;
  const [quotes, etfs] = await Promise.all([
    getQuotes(symbols).catch((e): Record<string, LiveQuote> => {
      quotesFailed = true;
      console.error("[daily] quotes failed", e);
      return {};
    }),
    etfsAmong([...new Set(raw.trades.map((t) => t.ticker))]),
  ]);
  const snapshot = buildLiveSnapshot({ raw, quotes, market, now, team: scope.team, etfs });
  if (snapshot && quotesFailed) snapshot.notes.unshift("Live quotes are unavailable right now; showing the last stored closes.");
  return snapshot;
}

/** The session so far in five-minute steps, ending on the snapshot's own figures while it is still moving. */
export async function loadLivePath(snapshot: LiveSnapshot): Promise<PathPoint[]> {
  // Only stored closes mean the day's bars are settled; until then they are cached five minutes.
  const over = snapshot.status === "final";
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

