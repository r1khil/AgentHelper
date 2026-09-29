import type { Position } from "./engine";

/** Share classes of one company: asking for either means the one the portfolio holds. */
const SHARE_CLASSES: string[][] = [
  ["GOOG", "GOOGL"],
  ["BRK.A", "BRK.B"],
  ["FOX", "FOXA"],
  ["NWS", "NWSA"],
  ["UA", "UAA"],
  ["LBRDA", "LBRDK"],
];

const norm = (t: string) => t.trim().toUpperCase().replace(/-/g, ".");

type Trade = { ticker: string; changePp: number; fundFrom: string };

/**
 * A scenario as a model tends to write it, fitted to the portfolio before the strict checks run: a ticker in another
 * share class of a holding becomes the holding ("GOOGL" for a Fund that holds GOOG), and an "added" ticker the
 * portfolio already holds is simply dropped from `addedTickers` instead of failing the call. Each change is noted
 * so the answer can say what was assumed.
 */
export function fitScenarioInput(positions: Position[], input: { weights?: Record<string, number>; trades?: Trade[]; addedTickers?: string[] }) {
  const held = new Map(positions.map((p) => [norm(p.ticker), p.ticker]));
  const notes: string[] = [];
  const mapped = new Map<string, string>();
  const fit = (ticker: string): string => {
    const t = norm(ticker);
    if (held.has(t) || t === "CASH") return held.get(t) ?? ticker;
    const sibling = SHARE_CLASSES.find((c) => c.includes(t))?.map((s) => held.get(s)).find(Boolean);
    if (!sibling) return ticker;
    if (!mapped.has(t)) {
      mapped.set(t, sibling);
      notes.push(`${t} was read as ${sibling}, the share class the portfolio holds.`);
    }
    return sibling;
  };

  const weights = input.weights ? Object.fromEntries(Object.entries(input.weights).map(([t, w]) => [fit(t), w])) : undefined;
  const trades = input.trades?.map((t) => ({ ...t, ticker: fit(t.ticker), fundFrom: ["cash", "pro_rata"].includes(t.fundFrom) ? t.fundFrom : fit(t.fundFrom) }));
  const addedTickers = input.addedTickers?.filter((t) => {
    const f = fit(t);
    if (!held.has(norm(f))) return true;
    notes.push(`${norm(t)} is already held, so it was not added as a new company.`);
    return false;
  });
  return { weights, trades, addedTickers: addedTickers?.length ? addedTickers : undefined, notes };
}

/** The portfolio's saved weights in percent, largest first: what a scenario starts from. */
export function currentWeights(positions: Position[]): { ticker: string; weightPct: number }[] {
  return positions
    .filter((p) => p.weight > 0)
    .map((p) => ({ ticker: p.ticker, weightPct: +(p.weight * 100).toFixed(2) }))
    .sort((a, b) => b.weightPct - a.weightPct);
}
