import { describe, expect, it } from "vitest";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import { buildRiskReport, MARKET, type RiskInput } from "./model";
import { modeledPath } from "./simulated";

function series(seed: number, n: number, scale = 0.01) {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 16807) % 2147483647;
    return (x / 2147483647 - 0.5) * 2 * scale;
  });
}

const N = 120;
const dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const market = series(7, N);
const returns = new Map<string, number[]>([[MARKET, market]]);
GICS_SECTORS.forEach((s, i) => returns.set(ETF_BY_SECTOR[s], market.map((m, t) => m + series(100 + i, N, 0.004)[t])));
returns.set("AAA", market.map((m, t) => 1.4 * m + series(11, N, 0.006)[t]));

const input = (over: Partial<RiskInput> = {}): RiskInput => ({
  scope: "fund",
  asOf: dates.at(-1)!,
  lookback: "6m",
  nav: 1_000_000,
  cash: { value: 100_000, weight: 0.1 },
  holdings: [{ ticker: "AAA", name: "A", teamId: "t1", sector: "information_technology", value: 900_000, weight: 0.9 }],
  benchmarkWeights: { information_technology: 1 },
  window: { dates, returns },
  riskFree: { annual: 0.04, asOf: dates.at(-1)! },
  realized: null,
  ...over,
});

describe("modeledPath", () => {
  it("replays today's weights over the window and finds the worst fall from a high", () => {
    const r = buildRiskReport(input());
    const m = modeledPath(r)!;
    expect(m.returns).toHaveLength(N);
    // 90% in AAA, the rest in cash.
    expect(m.returns[3]).toBeCloseTo(0.9 * returns.get("AAA")![3], 12);
    expect(m.drawdown.every((d) => d <= 0)).toBe(true);
    expect(m.max).toBeCloseTo(Math.min(...m.drawdown), 12);
    expect(m.dates.indexOf(m.peakDate)).toBeLessThanOrEqual(m.dates.indexOf(m.troughDate));
    // The path from the peak to the trough is the worst drawdown.
    const peak = m.dates.indexOf(m.peakDate);
    const trough = m.dates.indexOf(m.troughDate);
    const growth = m.returns.slice(peak + 1, trough + 1).reduce((g, x) => g * (1 + x), 1);
    expect(growth - 1).toBeCloseTo(m.max, 10);
  });

  it("gives a Sharpe ratio for the book and for the S&P 500 only when a risk-free rate is stored", () => {
    const withRf = modeledPath(buildRiskReport(input()))!;
    expect(withRf.sharpe).not.toBeNull();
    expect(withRf.marketSharpe).not.toBeNull();
    const without = modeledPath(buildRiskReport(input({ riskFree: null })))!;
    expect(without.sharpe).toBeNull();
    expect(without.marketSharpe).toBeNull();
  });
});
