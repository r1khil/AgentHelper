import { fmtDeckPct } from "./format";
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

/** Monday-close-to-Friday-close price return per holding; a holding missing a close at either end is listed, not scored. */
export function weeklyReturns(input: { holdings: PerformerHolding[]; closes: CloseLookup; start: string; end: string }): { scored: Performer[]; missing: string[] } {
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
  return { scored, missing: missing.sort((a, b) => a.localeCompare(b)) };
}

/** Best and worst `n`; ties break by ticker so a rebuild is stable. */
function topAndWorst(scored: Performer[], n: number) {
  return {
    top: [...scored].sort((a, b) => b.pct - a.pct || a.ticker.localeCompare(b.ticker)).slice(0, n),
    worst: [...scored].sort((a, b) => a.pct - b.pct || a.ticker.localeCompare(b.ticker)).slice(0, n),
  };
}

/**
 * Monday-close-to-Friday-close price return per active holding. No weights are involved, which matches the
 * deck's "Company (TICKER): 7.2%" lines. Holdings with a missing close at either end are reported
 * rather than silently ranked at zero.
 */
export function rankWeeklyMovers(
  input: { holdings: PerformerHolding[]; closes: CloseLookup; start: string; end: string },
  n = 3,
): WeeklyPerformers {
  const { scored, missing } = weeklyReturns(input);
  return { ...topAndWorst(scored, n), missing, window: { start: input.start, end: input.end } };
}

/** Within this many points, the sheet and the closes agree on a holding's week. */
export const AGREE_PTS = 0.15;
/** A holding the two put further apart than this is named in the Checks list. */
export const FLAG_PTS = 0.5;
/** Share of compared holdings that must agree before the sheet's column is taken as the deck's window. */
const AGREE_SHARE = 0.8;
/** Fewer holdings than this with both figures, and the comparison says nothing either way. */
const MIN_COMPARED = 5;

/**
 * Choose the top and worst performers. The sheet's "% 1 Week" is the execs' own number, so it wins when it measures the
 * deck's window; the proof is that it agrees with the app's Monday and Friday closes for most holdings. Read too late (after
 * Monday's open the sheet's window has moved on), it won't agree, and the closes are used instead. Names come from the app.
 */
export function chooseMovers(input: {
  sheet: { ticker: string; pct: number }[] | null;
  /** Holdings the sheet lists without a "% 1 Week"; their week comes from the closes. */
  sheetBlank?: string[];
  sheetProblem?: string | null;
  readAt?: string;
  closes: { scored: Performer[]; missing: string[] };
  names: Map<string, string>;
  window: { start: string; end: string };
  n?: number;
}): WeeklyPerformers {
  const n = input.n ?? 3;
  const byTicker = new Map(input.closes.scored.map((p) => [p.ticker, p]));
  const fromCloses = (checks: string[]): WeeklyPerformers => ({
    ...topAndWorst(input.closes.scored, n),
    missing: input.closes.missing,
    window: input.window,
    source: "closes",
    checks,
  });

  if (!input.sheet?.length) return fromCloses([`Top and worst 3 use the app's closes: the PT sheet's "% 1 Week" wasn't read${input.sheetProblem ? ` (${input.sheetProblem})` : ""}.`]);

  const compared = input.sheet.filter((s) => byTicker.has(s.ticker));
  const gaps = compared.map((s) => ({ ticker: s.ticker, sheet: s.pct, closes: byTicker.get(s.ticker)!.pct }));
  const agreeing = gaps.filter((g) => Math.abs(g.sheet - g.closes) <= AGREE_PTS).length;
  if (compared.length >= MIN_COMPARED && agreeing / compared.length < AGREE_SHARE) {
    return fromCloses([
      `Top and worst 3 use the app's Monday-to-Friday closes: the PT sheet's "% 1 Week" agreed for only ${agreeing} of ${compared.length} holdings, so it had moved past the deck's window when it was read.`,
    ]);
  }

  const checks: string[] = [];
  const filled = (input.sheetBlank ?? []).filter((t) => byTicker.has(t));
  const unranked = (input.sheetBlank ?? []).filter((t) => !byTicker.has(t));
  if (filled.length) checks.push(`${filled.join(", ")} ${filled.length === 1 ? "has" : "have"} no "% 1 Week" in the PT sheet, so ${filled.length === 1 ? "its week comes" : "their weeks come"} from the app's closes.`);
  if (unranked.length) checks.push(`${unranked.join(", ")} ${unranked.length === 1 ? "has" : "have"} no "% 1 Week" in the PT sheet and no closes in the app, so ${unranked.length === 1 ? "it's" : "they're"} left out of the top and worst 3.`);
  if (compared.length < MIN_COMPARED) checks.push(`Top and worst 3 are the PT sheet's "% 1 Week"; the app had closes for only ${compared.length} holding${compared.length === 1 ? "" : "s"}, so they weren't cross-checked.`);
  for (const g of gaps.filter((x) => Math.abs(x.sheet - x.closes) > FLAG_PTS).sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    checks.push(`${g.ticker}: the sheet says ${fmtDeckPct(g.sheet)} for the week, the app's closes say ${fmtDeckPct(g.closes)}.`);
  }
  const scored = [
    ...input.sheet.map((s) => ({ ticker: s.ticker, name: input.names.get(s.ticker) ?? byTicker.get(s.ticker)?.name ?? s.ticker, pct: s.pct })),
    ...filled.map((t) => byTicker.get(t)!),
  ];
  return { ...topAndWorst(scored, n), missing: [], window: input.window, source: "sheet", ...(input.readAt ? { readAt: input.readAt } : {}), checks };
}
