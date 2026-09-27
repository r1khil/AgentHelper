/**
 * Which reports go on the deck's Earnings line. Holdings and tracked bellwethers always do. Beyond them the decks name the
 * week's largest reporters: for the week of 2026-09-21 their COST, CTAS, AZO, PAYX and DRI were exactly the five biggest
 * companies Finnhub listed that week, and within a day they are written largest first ("CTAS, PAYX, GIS, UEC (Wednesday)").
 */

export type Reporter = {
  ticker: string;
  /** ISO date of the report. */
  date: string;
  /** Market cap in dollars, when known. */
  cap: number | null;
  /** A holding or bellwether: listed whatever its size. */
  always?: boolean;
};

/** Reporters at least this large make the line. */
export const BIG_CAP = 10e9;
/** At most this many of them, largest first, so a heavy week doesn't swamp the slide. */
export const MAX_BIG = 8;

/** Finnhub also lists foreign lines and units ("BRK.A", "RY.TO"); the deck only names plain US tickers. */
export const US_TICKER = /^[A-Z]{1,5}$/;

export function pickEarnings(reporters: Reporter[], opts: { minCap?: number; max?: number } = {}): Reporter[] {
  const minCap = opts.minCap ?? BIG_CAP;
  const max = opts.max ?? MAX_BIG;
  const always = reporters.filter((r) => r.always);
  const taken = new Set(always.map((r) => r.ticker));
  const big = reporters
    .filter((r) => !taken.has(r.ticker) && r.cap !== null && r.cap >= minCap)
    .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || a.ticker.localeCompare(b.ticker))
    .slice(0, max);
  return [...always, ...big].sort((a, b) => a.date.localeCompare(b.date) || (b.cap ?? -1) - (a.cap ?? -1) || a.ticker.localeCompare(b.ticker));
}
