import type { PtCell, PtTab } from "./parse";
import { TICKER, sheetQuantities, tickerKey } from "./reconcile";

/**
 * The Weekly update's three headline figures, as the execs keep them in the sheet's "2025 Time-Weighted Returns" tab:
 * the latest fund value (AUM), "Owl Fund YTD Performance:" and "SPX YTD Performance:". Pure, so it can be tested
 * against the tab's real layout.
 */

export const WEEKLY_TAB = "2025 Time-Weighted Returns";

export type SheetFigure = { value: number; ref: string };

export type SheetWeeklyFigures = {
  aumK: SheetFigure | null;
  ytdPct: SheetFigure | null;
  benchmarkYtdPct: SheetFigure | null;
  /** "Owl Fund Relative Performance:", used only to check the derived relative return. */
  relativePct: SheetFigure | null;
  /** The sheet's own label for the benchmark figure, so the page can show what it calls it. */
  benchmarkLabel: string | null;
  problems: string[];
};

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/:$/, "").trim().toLowerCase();
const isNum = (c: PtCell | undefined): c is PtCell & { v: number } => typeof c?.v === "number" && Number.isFinite(c.v);
/** Percent cells come back as fractions (6.34% is 0.0634). */
const pct = (v: number) => Math.round(v * 1e6) / 1e4;

/** The first number to the right of a cell whose text is `label` (the tab writes "Label:" then the value a few columns over). */
function valueAfterLabel(tab: PtTab, label: string): { cell: PtCell & { v: number }; label: string } | null {
  for (const row of tab.rows) {
    const i = row.cells.findIndex((c) => typeof c.v === "string" && norm(c.v) === norm(label));
    if (i < 0) continue;
    const cell = row.cells.slice(i + 1).find(isNum);
    if (cell) return { cell, label: String(row.cells[i].v).replace(/:$/, "").trim() };
  }
  return null;
}

export function weeklyFiguresFromSheet(tabs: PtTab[]): SheetWeeklyFigures {
  const out: SheetWeeklyFigures = { aumK: null, ytdPct: null, benchmarkYtdPct: null, relativePct: null, benchmarkLabel: null, problems: [] };
  const tab = tabs.find((t) => t.name === WEEKLY_TAB);
  if (!tab) {
    out.problems.push(`The "${WEEKLY_TAB}" tab was not read.`);
    return out;
  }
  if (tab.status !== "ok") {
    out.problems.push(`The "${WEEKLY_TAB}" tab's layout changed.`);
    return out;
  }

  const ytd = valueAfterLabel(tab, "Owl Fund YTD Performance");
  if (ytd) out.ytdPct = { value: pct(ytd.cell.v), ref: ytd.cell.ref };
  else out.problems.push('No "Owl Fund YTD Performance" figure.');

  const bench = valueAfterLabel(tab, "SPX YTD Performance");
  if (bench) {
    out.benchmarkYtdPct = { value: pct(bench.cell.v), ref: bench.cell.ref };
    out.benchmarkLabel = bench.label;
  } else out.problems.push('No "SPX YTD Performance" figure.');

  const relative = valueAfterLabel(tab, "Owl Fund Relative Performance");
  if (relative) out.relativePct = { value: pct(relative.cell.v), ref: relative.cell.ref };

  // The latest dated period: its value after any AUM infusion, else its ending value before one.
  const byLabel = (row: PtTab["rows"][number], label: string) => row.cells.find((c) => c.label && norm(c.label) === norm(label));
  const periods = tab.rows.filter((r) => {
    const d = byLabel(r, "Date");
    return typeof d?.v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d.v.trim());
  });
  const last = periods.at(-1);
  const after = last && byLabel(last, "Value After AUM Infusion");
  const ending = last && byLabel(last, "Ending Portfolio Value Before AUM Infusion");
  const aum = isNum(after) ? after : isNum(ending) ? ending : null;
  if (aum) out.aumK = { value: Math.round(aum.v / 10) / 100, ref: aum.ref };
  else out.problems.push("No dated fund value to take AUM from.");

  return out;
}

export const PRICE_TARGETS_TAB = "Price Targets";

/** One holding's "% 1 Week" from Price Targets, in percent. */
export type SheetMove = { ticker: string; pct: number; ref: string };

/** The Price Targets rows that are holdings: sector header rows carry a sector name, not a ticker. */
function holdingRows(tabs: PtTab[]): { rows: PtTab["rows"]; problem: string | null } {
  const tab = tabs.find((t) => t.name === PRICE_TARGETS_TAB);
  if (!tab) return { rows: [], problem: `The "${PRICE_TARGETS_TAB}" tab was not read.` };
  if (tab.status !== "ok") return { rows: [], problem: `The "${PRICE_TARGETS_TAB}" tab's layout changed.` };
  const rows = tab.rows.filter((r) => {
    const t = r.cells.find((c) => c.label === "Ticker");
    return typeof t?.v === "string" && TICKER.test(t.v.trim());
  });
  return { rows, problem: rows.length ? null : `No holdings in "${PRICE_TARGETS_TAB}".` };
}

const tickerOf = (row: PtTab["rows"][number]) => tickerKey(String(row.cells.find((c) => c.label === "Ticker")!.v));

/**
 * Each holding's "% 1 Week". The sheet computes it from a GOOGLEFINANCE close a week back, so read on the weekend it is
 * the deck's Monday-close-to-Friday-close window (checked 2026-09-27 against the app's closes for AMZN, XLY and IYK); after
 * Monday's open it has moved on. The caller cross-checks it against the app's closes before trusting it.
 */
export function weeklyMovesFromSheet(tabs: PtTab[]): { rows: SheetMove[]; blank: string[]; problem: string | null } {
  const { rows, problem } = holdingRows(tabs);
  if (problem) return { rows: [], blank: [], problem };
  // Price Targets also lists benchmarks (SPY); only what Portfolio Data holds shares of is a holding. Unread, nothing is dropped.
  const quantities = sheetQuantities(tabs).rows;
  const held = quantities.length ? new Set(quantities.map((q) => tickerKey(q.ticker))) : null;
  const byTicker = new Map<string, SheetMove>();
  const blank = new Set<string>();
  for (const r of rows) {
    const c = r.cells.find((x) => x.label === "% 1 Week");
    const ticker = tickerOf(r);
    if (held && !held.has(ticker)) continue;
    // Some rows have no formula and show a flat 0.0% (XLK, CIBR, SKYY and SOXX on 2026-09-27): that is no value, not a flat week.
    if (!isNum(c) || c.v === 0) {
      if (!byTicker.has(ticker)) blank.add(ticker);
      continue;
    }
    blank.delete(ticker);
    // A ticker listed under two sectors is one holding with one price.
    if (!byTicker.has(ticker)) byTicker.set(ticker, { ticker, pct: pct(c.v), ref: c.ref });
  }
  return { rows: [...byTicker.values()], blank: [...blank].sort(), problem: byTicker.size ? null : 'No "% 1 Week" values.' };
}

/** A holding's next report as the sheet has it: "10/29/2026", confirmed or expected, before or after the open. */
export type SheetEarnings = { ticker: string; date: string; status: string | null; timing: string | null };

/** "10/29/2026", and the sheet's occasional "10/29/26". */
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const toIso = (s: string) => {
  const m = s.trim().match(US_DATE);
  return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
const textOf = (c: PtCell | undefined) => (typeof c?.v === "string" && c.v.trim() && c.v.trim() !== "-" ? c.v.trim() : null);

/**
 * Holdings reporting between `from` and `to` (ISO dates, inclusive), per the sheet's Earnings Date column. `dated` lists every
 * holding the sheet gives any date, so a caller can tell "reports another week" from "the sheet doesn't say".
 */
export function earningsFromSheet(tabs: PtTab[], from: string, to: string): { rows: SheetEarnings[]; dated: string[]; problem: string | null } {
  const { rows, problem } = holdingRows(tabs);
  if (problem) return { rows: [], dated: [], problem };
  const byTicker = new Map<string, SheetEarnings>();
  const dated = new Set<string>();
  for (const r of rows) {
    const raw = textOf(r.cells.find((c) => c.label === "Earnings Date"));
    const date = raw ? toIso(raw) : null;
    if (!date) continue;
    const ticker = tickerOf(r);
    dated.add(ticker);
    if (date < from || date > to || byTicker.has(ticker)) continue;
    byTicker.set(ticker, { ticker, date, status: textOf(r.cells.find((c) => c.label === "Status")), timing: textOf(r.cells.find((c) => c.label === "After/Before")) });
  }
  return { rows: [...byTicker.values()].sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker)), dated: [...dated].sort(), problem: null };
}
