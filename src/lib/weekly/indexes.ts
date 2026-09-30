import "server-only";
import { DateTime } from "luxon";
import { NY, isTradingDay } from "@/lib/providers/calendar";
import { getCnbcDailyBars } from "@/lib/providers/cnbc";
import { getBarsRange } from "@/lib/providers/yahoo";
import { INDEX_SERIES, assembleIndexCloses, type Bar, type IndexBars, type WeekIndexCloses } from "./index-closes";
import { reviewWeek } from "./weeks";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * SPXTR, SVX and SGX closes for each trading day of the week that ended on `weekEnding`. SPXTR comes from Yahoo with
 * CNBC filling any gap (CNBC skips the odd SPXTR day); Yahoo has no daily history for Value and Growth, so those are
 * CNBC only. Never throws: a source that fails becomes a note in `problems`.
 */
export async function loadWeekIndexCloses(weekEnding: string): Promise<WeekIndexCloses> {
  const { from, to } = reviewWeek(weekEnding);
  const days: string[] = [];
  for (let d = DateTime.fromISO(from, { zone: NY }); d.toISODate()! <= to; d = d.plus({ days: 1 })) {
    if (isTradingDay(d.toISODate()!)) days.push(d.toISODate()!);
  }
  const attempt = (p: Promise<Bar[]>) => p.catch((e: unknown) => message(e));
  const bars = {} as IndexBars;
  await Promise.all(
    INDEX_SERIES.map(async (s) => {
      bars[s.label] = await Promise.all([
        ...("yahoo" in s ? [attempt(getBarsRange(s.yahoo, from, to).then((r) => r.bars))] : []),
        attempt(getCnbcDailyBars(s.cnbc)),
      ]);
    }),
  );
  return assembleIndexCloses(days, bars);
}
