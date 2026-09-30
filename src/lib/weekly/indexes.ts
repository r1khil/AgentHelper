import "server-only";
import { marketPhase, previousTradingDay } from "@/lib/providers/calendar";
import { getCnbcDailyBars } from "@/lib/providers/cnbc";
import { getBarsRange } from "@/lib/providers/yahoo";
import { INDEX_SERIES, assembleIndexCloses, closedSessions, type Bar, type IndexBars, type WeekIndexCloses } from "./index-closes";
import { reviewWeek } from "./weeks";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * SPXTR, SVX and SGX closes for each trading day of the week that ended on `weekEnding`. SPXTR comes from Yahoo with
 * CNBC filling any gap (CNBC skips the odd SPXTR day); Yahoo has no daily history for Value and Growth, so those are
 * CNBC only. Never throws: a source that fails becomes a note in `problems`.
 */
export async function loadWeekIndexCloses(weekEnding: string): Promise<WeekIndexCloses> {
  const { from, to } = reviewWeek(weekEnding);
  // A preview mid-week lists only the sessions that have closed, not the rest of the week as missing.
  const market = marketPhase();
  const days = closedSessions(weekEnding, market.phase === "open" ? previousTradingDay(market.today) : market.session);
  const attempt = (source: string, p: Promise<Bar[]>) => p.catch((e: unknown) => `${source}: ${message(e)}`);
  const bars = {} as IndexBars;
  await Promise.all(
    INDEX_SERIES.map(async (s) => {
      bars[s.label] = await Promise.all([
        ...("yahoo" in s ? [attempt("Yahoo", getBarsRange(s.yahoo, from, to).then((r) => r.bars))] : []),
        attempt("CNBC", getCnbcDailyBars(s.cnbc)),
      ]);
    }),
  );
  return assembleIndexCloses(days, bars);
}
