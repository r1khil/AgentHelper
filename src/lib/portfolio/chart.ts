import { DateTime } from "luxon";

// Pure: the Overview chart's history. Before the ledger opened there is no fund value, so the line is today's weights
// replayed over the prices of those days, drawn dashed; from the opening on it is the ledger's real value.

export type ChartPoint = { date: string; value: number; /** Today's weights replayed, not the ledger. */ replay: boolean };

export const OVERVIEW_RANGES = ["1D", "1W", "1M", "3M", "1Y", "All"] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
export type DailyRange = Exclude<OverviewRange, "1D">;
export const DEFAULT_RANGE: OverviewRange = "3M";

/**
 * Cumulative growth of a fixed-weight mix. `returns[i][t]` is holding i's return on day t; a missing one (NaN) takes
 * `fallback[i][t]` (its sector ETF), else zero. Cash and anything unweighted earns nothing. Returns the level after each
 * day, starting from 1 before the first.
 */
export function replayLevels(weights: number[], returns: number[][], fallback: (number[] | undefined)[], days: number): number[] {
  const out: number[] = [];
  let level = 1;
  for (let t = 0; t < days; t++) {
    let r = 0;
    for (let i = 0; i < weights.length; i++) {
      const own = returns[i]?.[t] ?? NaN;
      const alt = fallback[i]?.[t] ?? NaN;
      const x = Number.isFinite(own) ? own : Number.isFinite(alt) ? alt : 0;
      r += weights[i] * x;
    }
    level *= 1 + r;
    out.push(level);
  }
  return out;
}

/**
 * Joins the replay to the ledger. The replay is scaled so that it meets the ledger's first value on the ledger's first
 * day (or the last replay day before it), then every ledger day follows. Replay days from the first ledger day on are
 * dropped: the ledger has them.
 */
export function joinHistory(replay: { dates: string[]; levels: number[] }, ledger: { date: string; value: number }[]): ChartPoint[] {
  if (!ledger.length) return [];
  const first = ledger[0];
  let join = -1;
  replay.dates.forEach((d, i) => {
    if (d <= first.date) join = i;
  });
  const before: ChartPoint[] = [];
  if (join >= 0 && replay.levels[join] > 0) {
    const k = first.value / replay.levels[join];
    for (let i = 0; i <= join; i++) if (replay.dates[i] < first.date) before.push({ date: replay.dates[i], value: replay.levels[i] * k, replay: true });
  }
  return [...before, ...ledger.map((p) => ({ date: p.date, value: p.value, replay: false }))];
}

/** The first date a range shows, counted back from the last point; null for "All". */
export function rangeStart(range: DailyRange, last: string): string | null {
  const d = DateTime.fromISO(last, { zone: "utc" });
  switch (range) {
    case "1W":
      return d.minus({ days: 7 }).toISODate();
    case "1M":
      return d.minus({ months: 1 }).toISODate();
    case "3M":
      return d.minus({ months: 3 }).toISODate();
    case "1Y":
      return d.minus({ years: 1 }).toISODate();
    default:
      return null;
  }
}

export function sliceRange(points: ChartPoint[], range: DailyRange): ChartPoint[] {
  const last = points.at(-1);
  if (!last) return [];
  const from = rangeStart(range, last.date);
  return from ? points.filter((p) => p.date >= from) : points;
}

/** Whether the history reaches back far enough (within a week) to fill a range; "All" always does. */
export function rangeReach(points: ChartPoint[]): Record<DailyRange, boolean> {
  const first = points[0];
  const last = points.at(-1);
  const ok = (r: DailyRange) => {
    if (!first || !last) return false;
    const from = rangeStart(r, last.date);
    return from === null || first.date <= DateTime.fromISO(from, { zone: "utc" }).plus({ days: 7 }).toISODate()!;
  };
  return { "1W": ok("1W"), "1M": ok("1M"), "3M": ok("3M"), "1Y": ok("1Y"), All: true };
}
