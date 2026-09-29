import type { Position } from "./engine";
import { fmtPct } from "@/lib/format";

/** Where the difference goes when named weights don't total 100%: nowhere (reject), cash, or the unnamed holdings pro rata. */
export type OverrideFill = "none" | "cash" | "pro_rata";

const EPS = 1e-8;

const weightList = (positions: Position[]) => positions.map((p) => `${p.ticker} ${fmtPct(p.weight * 100)}`).join(", ");

/**
 * Explicit per-ticker overrides in percent. Unspecified positions, including cash, retain their saved weights.
 * With `fill` "none" the caller must offset edits to total 100%; "cash" puts the difference in the cash line and
 * "pro_rata" spreads it across the holdings that were not named, in proportion to their weights. A named position
 * never absorbs the difference.
 */
export function weightsFromOverrides(positions: Position[], overridesPct: Record<string, number>, fill: OverrideFill = "none"): Record<string, number> {
  const byTicker = new Map(positions.map((p) => [p.ticker.toUpperCase(), p]));
  const fixed = new Map<string, number>();
  for (const [ticker, pct] of Object.entries(overridesPct)) {
    const p = byTicker.get(ticker.trim().toUpperCase());
    if (!p) throw new Error(`${ticker.toUpperCase()} is not in the portfolio being backtested. Holdings: ${[...byTicker.keys()].join(", ")}.`);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error(`Weight for ${p.ticker} must be between 0% and 100%.`);
    fixed.set(p.id, pct / 100);
  }
  const out = Object.fromEntries(positions.map((p) => [p.id, fixed.get(p.id) ?? p.weight]));
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  const residual = 1 - total;
  if (Math.abs(residual) <= EPS) return out;

  const off = `Scenario weights total ${fmtPct(total * 100)}`;
  if (fill === "none") throw new Error(`${off}; specify an offset (such as CASH) so they total 100.00%. Current weights: ${weightList(positions)}.`);

  if (fill === "cash") {
    const cash = positions.find((p) => p.kind === "cash");
    if (!cash) throw new Error(`${off} and this portfolio has no cash line to absorb the difference; fund it pro rata instead.`);
    if (fixed.has(cash.id)) throw new Error(`${off}, and CASH was set explicitly, so it cannot absorb the difference; fund it pro rata or adjust the weights.`);
    const next = out[cash.id] + residual;
    if (next < -EPS) throw new Error(`${off}; only ${fmtPct(out[cash.id] * 100)} cash is available to fund it. Fund it pro rata instead.`);
    out[cash.id] = Math.max(0, next);
    return out;
  }

  const others = positions.filter((p) => !fixed.has(p.id) && p.kind !== "cash" && out[p.id] > EPS);
  const pool = others.reduce((s, p) => s + out[p.id], 0);
  if (pool <= EPS) throw new Error(`${off} and there are no other holdings to spread the difference across; fund it from cash.`);
  if (-residual > pool + EPS) throw new Error(`${off}; the holdings that were not named total only ${fmtPct(pool * 100)}.`);
  for (const p of others) out[p.id] = Math.max(0, out[p.id] + (residual * out[p.id]) / pool);
  return out;
}
