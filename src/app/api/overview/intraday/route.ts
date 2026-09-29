import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, holdings } from "@/db/schema";
import { getCurrentUser, isFundWide, listAccessibleTeams } from "@/lib/auth";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { BENCHMARK_REFERENCE } from "@/lib/attribution/sectors";
import { marketPhase } from "@/lib/providers/calendar";
import { getIntradayBars } from "@/lib/providers/yahoo";

export const dynamic = "force-dynamic";
// The day's first fetch pulls five-minute bars for every holding, spaced for Yahoo (the Daily page's path does the same).
export const maxDuration = 60;

/** Bars kept per holding: a 64px line needs no more, and it keeps the answer small. */
const POINTS = 26;

const thin = (xs: number[]) => (xs.length <= POINTS ? xs : Array.from({ length: POINTS }, (_, i) => xs[Math.round((i / (POINTS - 1)) * (xs.length - 1))]));

/** Whether the session's closes are stored, which settles its bars for good. */
async function sessionOver(session: string) {
  const [row] = await db.select({ t: dailyCloses.ticker }).from(dailyCloses).where(and(eq(dailyCloses.ticker, BENCHMARK_REFERENCE), eq(dailyCloses.sessionDate, session))).limit(1);
  return !!row;
}

/**
 * The session so far, loaded after the page. Without a query: every held ticker, thinned for the Overview's intraday
 * sparklines (execs and admins). With `?ticker=`: that holding's five-minute bars for its page's 1D range (anyone
 * who can open the holding).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { session } = marketPhase();
  const headers = { "cache-control": "private, no-store" };

  const ticker = new URL(req.url).searchParams.get("ticker");
  if (ticker) {
    if (!/^[A-Z0-9.^-]{1,12}$/i.test(ticker)) return new Response("Bad ticker", { status: 400 });
    const teams = await listAccessibleTeams(user);
    const [row] = teams.length ? await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.ticker, ticker.toUpperCase()), inArray(holdings.teamId, teams.map((t) => t.id)))).limit(1) : [];
    if (!row) return new Response("Not found", { status: 404 });
    try {
      return Response.json({ session, bars: await getIntradayBars(ticker.toUpperCase(), session, await sessionOver(session)) }, { headers });
    } catch {
      return Response.json({ session, bars: [] }, { headers });
    }
  }

  if (!isFundWide(user)) return new Response("Not found", { status: 404 });
  const loaded = await loadAttributionSeries();
  const over = loaded.inputs.prices.get(BENCHMARK_REFERENCE)?.has(session) ?? false;
  const tickers = latestPositions(loaded.series.portfolio).map((p) => p.ticker);
  const entries = await Promise.all(
    tickers.map(async (t) => {
      try {
        return [t, thin((await getIntradayBars(t, session, over)).map((b) => b.close))] as const;
      } catch {
        return [t, []] as const;
      }
    }),
  );
  return Response.json({ session, sparks: Object.fromEntries(entries) }, { headers });
}
