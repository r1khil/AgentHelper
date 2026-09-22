import type { Position } from "./engine";

/**
 * Scenario weights from a few per-ticker overrides (in percent), the way someone asks it in words: "what if NVDA
 * had been 10%". Overridden tickers get exactly that weight; every other holding keeps its saved proportion of what
 * is left. Returns decimals keyed by position id, totalling 1, ready for `runBacktest`.
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
  const fixedTotal = [...fixed.values()].reduce((a, b) => a + b, 0);
  if (fixedTotal > 1 + 1e-9) throw new Error(`Scenario weights add up to ${(fixedTotal * 100).toFixed(2)}%, more than 100%.`);
  const rest = positions.filter((p) => !fixed.has(p.id));
  const restSaved = rest.reduce((a, p) => a + p.weight, 0);
  if (restSaved <= 0) {
    // Everything was overridden (or the rest is zero-weight): the overrides alone must make up the portfolio.
    if (Math.abs(fixedTotal - 1) > 1e-6) throw new Error(`Scenario weights add up to ${(fixedTotal * 100).toFixed(2)}%; with no other holdings to fill the rest they must total 100%.`);
    return Object.fromEntries(positions.map((p) => [p.id, (fixed.get(p.id) ?? 0) / fixedTotal]));
  }
  const out = Object.fromEntries(positions.map((p) => [p.id, fixed.get(p.id) ?? (p.weight / restSaved) * (1 - fixedTotal)]));
  // Put the floating-point residual on the largest filled weight so the total is exactly 1.
  const residual = 1 - Object.values(out).reduce((a, b) => a + b, 0);
  const largest = rest.reduce((a, b) => (b.weight > a.weight ? b : a));
  out[largest.id] += residual;
  return out;
}
