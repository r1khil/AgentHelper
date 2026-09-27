import type { PtTab } from "./parse";

/**
 * Share counts in the sheet's Portfolio Data tab against the trades recorded in the app's ledger. The ledger's own
 * positions also reinvest dividends (several shares a year on the ETFs), which the sheet doesn't, so the comparison
 * uses recorded trades only: any gap is then a trade one side is missing.
 */

export const POSITIONS_TAB = "Portfolio Data";

export type SheetQuantity = { ticker: string; qty: number; ref: string };

export type QuantityCheck = {
  ticker: string;
  sheet: number | null;
  ledger: number | null;
  /** Sheet minus ledger. */
  diff: number;
  status: "match" | "fractional" | "mismatch" | "sheet_only" | "ledger_only";
  /** The sheet cell holding the quantity. */
  ref?: string;
};

/** The sheet sometimes writes GOOGLEFINANCE-style tickers with the exchange ("BATS:DRAM"). */
const TICKER = /^(?:[A-Z]+:)?[A-Z][A-Z0-9.-]{0,9}$/;
/** BATS:DRAM in the sheet is DRAM in the app, and BRK.B is BRK-B. */
export const tickerKey = (t: string) => t.trim().toUpperCase().replace(/^[A-Z]+:/, "").replace(/\./g, "-");

export function sheetQuantities(tabs: PtTab[]): { rows: SheetQuantity[]; problem: string | null } {
  const tab = tabs.find((t) => t.name === POSITIONS_TAB);
  if (!tab) return { rows: [], problem: `The "${POSITIONS_TAB}" tab was not read.` };
  if (tab.status !== "ok") return { rows: [], problem: `The "${POSITIONS_TAB}" tab's layout changed.` };
  const rows: SheetQuantity[] = [];
  for (const r of tab.rows) {
    const t = r.cells.find((c) => c.label === "Ticker");
    const q = r.cells.find((c) => c.label === "Quantity");
    if (typeof t?.v !== "string" || !TICKER.test(t.v.trim())) continue;
    // A zero row is a placeholder (a benchmark line), not a holding.
    if (typeof q?.v !== "number" || !Number.isFinite(q.v) || q.v === 0) continue;
    rows.push({ ticker: t.v.trim(), qty: q.v, ref: q.ref });
  }
  return { rows, problem: rows.length ? null : `No holdings with a quantity in "${POSITIONS_TAB}".` };
}

/** Net shares per ticker from the ledger's recorded trades (buys less sells, voided trades ignored), without dividends. */
export function recordedShares(trades: { ticker: string; side: "buy" | "sell"; shares: number | string; voidedAt?: Date | string | null }[]): { ticker: string; shares: number }[] {
  const net = new Map<string, number>();
  for (const t of trades) {
    if (t.voidedAt) continue;
    const n = Number(t.shares);
    net.set(t.ticker, (net.get(t.ticker) ?? 0) + (t.side === "buy" ? n : -n));
  }
  // A sale that included reinvested shares leaves a small negative remainder; that position is closed.
  return [...net].filter(([, s]) => s >= 1).map(([ticker, shares]) => ({ ticker, shares: Math.round(shares * 1e6) / 1e6 }));
}

export function compareWithLedger(sheet: SheetQuantity[], ledger: { ticker: string; shares: number }[]): QuantityCheck[] {
  const byKey = new Map<string, QuantityCheck>();
  for (const s of sheet) {
    const k = tickerKey(s.ticker);
    const prev = byKey.get(k);
    // A ticker listed twice (two teams) is one position.
    byKey.set(k, { ticker: prev?.ticker ?? tickerKey(s.ticker), sheet: (prev?.sheet ?? 0) + s.qty, ledger: null, diff: 0, status: "sheet_only", ref: prev?.ref ?? s.ref });
  }
  for (const l of ledger) {
    const k = tickerKey(l.ticker);
    const row = byKey.get(k) ?? { ticker: k, sheet: null, ledger: null, diff: 0, status: "ledger_only" as const };
    row.ledger = (row.ledger ?? 0) + l.shares;
    byKey.set(k, row);
  }
  for (const row of byKey.values()) {
    if (row.sheet === null || row.ledger === null) {
      row.diff = (row.sheet ?? 0) - (row.ledger ?? 0);
      row.status = row.sheet === null ? "ledger_only" : "sheet_only";
      continue;
    }
    row.diff = Math.round((row.sheet - row.ledger) * 1e6) / 1e6;
    const gap = Math.abs(row.diff);
    row.status = gap === 0 ? "match" : gap < 1 ? "fractional" : "mismatch";
  }
  const order = { mismatch: 0, sheet_only: 1, ledger_only: 2, fractional: 3, match: 4 };
  return [...byKey.values()].sort((a, b) => order[a.status] - order[b.status] || a.ticker.localeCompare(b.ticker));
}
