import type { Position } from "./engine";

/** Where the money for an add comes from, or where the proceeds of a trim go. */
export type Funding = { kind: "cash" } | { kind: "pro_rata" } | { kind: "ticker"; ticker: string };

export type Trade = { ticker: string; /** Percentage points of the portfolio: negative trims, positive adds. */ changePp: number; funding: Funding };

const EPS = 1e-9;

export function fundingLabel(f: Funding) {
  return f.kind === "cash" ? "cash" : f.kind === "pro_rata" ? "the other holdings, pro rata" : f.ticker;
}

/**
 * Applies one relative trade to scenario weights (fractions by position id) and offsets it so the
 * total stays the same. Pro rata spreads the offset across every other holding with a weight, in
 * proportion to that weight, the usual way a trim's proceeds are reinvested across a book.
 */
export function applyTrade(positions: Position[], weights: Record<string, number>, trade: Trade): Record<string, number> {
  const target = positions.find((p) => p.ticker.toUpperCase() === trade.ticker.trim().toUpperCase());
  if (!target || target.kind === "cash") throw new Error(`${trade.ticker.toUpperCase()} is not a holding in this portfolio.`);
  if (!Number.isFinite(trade.changePp) || trade.changePp === 0) throw new Error("Enter a change in percentage points, such as 2.");
  const current = weights[target.id] ?? 0;
  const next = Math.min(1, Math.max(0, current + trade.changePp / 100));
  const delta = next - current;
  if (Math.abs(delta) < EPS) throw new Error(`${target.ticker} is already at ${(current * 100).toFixed(2)}%.`);

  const out = { ...weights, [target.id]: next };
  if (trade.funding.kind === "cash") {
    const cash = positions.find((p) => p.kind === "cash");
    if (!cash) throw new Error("This portfolio has no cash line.");
    const left = (out[cash.id] ?? 0) - delta;
    if (left < -EPS) throw new Error(`Only ${((out[cash.id] ?? 0) * 100).toFixed(2)}% cash is available. Fund the rest pro rata or from a holding.`);
    out[cash.id] = Math.max(0, left);
  } else if (trade.funding.kind === "ticker") {
    const f = trade.funding;
    const source = positions.find((p) => p.ticker.toUpperCase() === f.ticker.toUpperCase());
    if (!source || source.id === target.id) throw new Error("Choose a different holding to fund the trade.");
    const left = (out[source.id] ?? 0) - delta;
    if (left < -EPS) throw new Error(`${source.ticker} has only ${((out[source.id] ?? 0) * 100).toFixed(2)}% to sell.`);
    out[source.id] = Math.max(0, left);
  } else {
    const others = positions.filter((p) => p.id !== target.id && p.kind !== "cash" && (out[p.id] ?? 0) > EPS);
    const pool = others.reduce((s, p) => s + out[p.id], 0);
    if (pool <= EPS) throw new Error("There are no other holdings to spread the trade across.");
    if (delta > pool + EPS) throw new Error(`The other holdings total only ${(pool * 100).toFixed(2)}%.`);
    for (const p of others) out[p.id] = Math.max(0, out[p.id] - (delta * out[p.id]) / pool);
  }
  return out;
}

/** `TICKER:-2:cash`, `TICKER:3:pro_rata` or `TICKER:-1.5:MSFT`, as used in links from the Risk page. */
export function parseTradeParam(value: string | undefined): Trade | null {
  if (!value) return null;
  const m = /^([A-Za-z0-9.\-]{1,10}):(-?\d{1,3}(?:\.\d{1,2})?):([A-Za-z0-9._\-]{1,10})$/.exec(value.trim());
  if (!m) return null;
  const funding: Funding = m[3] === "cash" ? { kind: "cash" } : m[3] === "pro_rata" ? { kind: "pro_rata" } : { kind: "ticker", ticker: m[3].toUpperCase() };
  const changePp = Number(m[2]);
  return changePp === 0 ? null : { ticker: m[1].toUpperCase(), changePp, funding };
}

export function tradeParam(t: Trade) {
  return `${t.ticker}:${t.changePp}:${t.funding.kind === "ticker" ? t.funding.ticker : t.funding.kind}`;
}

/**
 * Weights as two-decimal percent strings for the weights table. Rounding many pro-rata changes can
 * leave the total a few hundredths off 100.00%, so the remainder goes to the largest position among
 * `absorb` (the trade's funding side) and the total stays exact.
 */
export function toPercentStrings(weights: Record<string, number>, absorb: string[]): Record<string, string> {
  const hundredths = Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, Math.round(w * 10_000)]));
  const target = Math.round(Object.values(weights).reduce((s, w) => s + w, 0) * 10_000);
  const residual = target - Object.values(hundredths).reduce((s, x) => s + x, 0);
  if (residual !== 0) {
    const pool = (absorb.length ? absorb : Object.keys(hundredths)).filter((id) => id in hundredths && hundredths[id] + residual >= 0);
    const into = pool.sort((a, b) => hundredths[b] - hundredths[a])[0];
    if (into) hundredths[into] += residual;
  }
  return Object.fromEntries(Object.entries(hundredths).map(([id, x]) => [id, (x / 100).toFixed(2)]));
}

/** Position ids that absorb a trade's offset. */
export function fundingIds(positions: Position[], trade: Trade): string[] {
  const target = positions.find((p) => p.ticker.toUpperCase() === trade.ticker.toUpperCase());
  if (trade.funding.kind === "cash") return positions.filter((p) => p.kind === "cash").map((p) => p.id);
  if (trade.funding.kind === "ticker") {
    const t = trade.funding.ticker.toUpperCase();
    return positions.filter((p) => p.ticker.toUpperCase() === t).map((p) => p.id);
  }
  return positions.filter((p) => p.kind !== "cash" && p.id !== target?.id).map((p) => p.id);
}
