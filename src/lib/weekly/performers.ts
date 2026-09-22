import type { Performer, WeeklyPerformers } from "./types";

export type PerformerHolding = { ticker: string; name: string };
/** `${ticker}|${sessionDate}` -> close. */
export type CloseLookup = Map<string, number>;

export function closeKey(ticker: string, sessionDate: string): string {
  return `${ticker}|${sessionDate}`;
}

export function buildCloseLookup(rows: { ticker: string; sessionDate: string; close: string | number }[]): CloseLookup {
  const out: CloseLookup = new Map();
  for (const r of rows) {
    const n = Number(r.close);
    if (Number.isFinite(n)) out.set(closeKey(r.ticker, r.sessionDate), n);
  }
  return out;
}

/**
 * Monday-close-to-Friday-close price return per active holding. No weights are involved, which matches the
 * deck's "Company (TICKER): 7.2%" lines. Holdings with a missing close at either end are reported
 * rather than silently ranked at zero, and ties break by ticker so a rebuild is stable.
 */
export function rankWeeklyMovers(
  input: { holdings: PerformerHolding[]; closes: CloseLookup; start: string; end: string },
  n = 3,
): WeeklyPerformers {
  const { holdings, closes, start, end } = input;
  const scored: Performer[] = [];
  const missing: string[] = [];
  for (const h of holdings) {
    const from = closes.get(closeKey(h.ticker, start));
    const to = closes.get(closeKey(h.ticker, end));
    if (from === undefined || to === undefined || from === 0) {
      missing.push(h.ticker);
      continue;
    }
    scored.push({ ticker: h.ticker, name: h.name, pct: Math.round(((to / from - 1) * 100) * 1e6) / 1e6 });
  }
  const byBest = [...scored].sort((a, b) => b.pct - a.pct || a.ticker.localeCompare(b.ticker));
  const byWorst = [...scored].sort((a, b) => a.pct - b.pct || a.ticker.localeCompare(b.ticker));
  return {
    top: byBest.slice(0, n),
    worst: byWorst.slice(0, n),
    missing: missing.sort((a, b) => a.localeCompare(b)),
    window: { start, end },
  };
}
