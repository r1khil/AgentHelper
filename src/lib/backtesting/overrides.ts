import type { Position } from "./engine";
import { fmtPct } from "@/lib/format";

/**
 * Explicit per-ticker overrides in percent. Unspecified positions, including cash,
 * retain their saved weights. The caller must offset edits to total 100%.
 */
export function weightsFromOverrides(positions: Position[], overridesPct: Record<string, number>): Record<string, number> {
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
  if (Math.abs(total - 1) > 1e-8)
    throw new Error(`Scenario weights total ${fmtPct(total * 100)}; specify an offset (such as CASH) so they total 100.00%.`);
  return out;
}
