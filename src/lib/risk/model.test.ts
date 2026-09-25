import { describe, expect, it } from "vitest";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import { volAfterBump } from "./math";
import { buildRiskReport, MARKET, type RiskInput } from "./model";

// Deterministic pseudo-random daily returns.
function series(seed: number, n: number, scale = 0.01) {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 16807) % 2147483647;
    return ((x / 2147483647) - 0.5) * 2 * scale;
  });
}

const N = 120;
const dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const market = series(7, N);
const returns = new Map<string, number[]>([[MARKET, market]]);
GICS_SECTORS.forEach((s, i) => returns.set(ETF_BY_SECTOR[s], market.map((m, t) => m + series(100 + i, N, 0.004)[t])));
returns.set("AAA", market.map((m, t) => 1.4 * m + series(11, N, 0.006)[t]));
returns.set("BBB", series(13, N));

function input(over: Partial<RiskInput> = {}): RiskInput {
  return {
    scope: "fund",
    asOf: dates.at(-1)!,
    lookback: "6m",
    nav: 1_000_000,
    cash: { value: 100_000, weight: 0.1 },
    holdings: [
      { ticker: "AAA", name: "A", teamId: "t1", sector: "information_technology", value: 540_000, weight: 0.54 },
      { ticker: "BBB", name: "B", teamId: "t2", sector: "financials", value: 360_000, weight: 0.36 },
    ],
    benchmarkWeights: { information_technology: 0.6, financials: 0.4 },
    window: { dates, returns },
    riskFree: { annual: 0.04, asOf: dates.at(-1)! },
    realized: null,
    ...over,
  };
}

describe("buildRiskReport", () => {
  it("adds risk contributions up to the portfolio's volatility and 100%", () => {
    const r = buildRiskReport(input());
    const contribution = r.holdings.reduce((s, h) => s + h.contribution, 0);
    expect(contribution).toBeCloseTo(r.portfolio.vol, 10);
    expect(r.holdings.reduce((s, h) => s + h.riskShare, 0)).toBeCloseTo(1, 10);
    const active = r.holdings.reduce((s, h) => s + (h.activeRiskShare ?? 0), 0) + r.benchmarkLegs.reduce((s, l) => s + l.activeRiskShare, 0);
    expect(active).toBeCloseTo(1, 10);
    expect(r.sectors.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
  });

  it("gives a portfolio of the benchmark's own ETFs zero tracking error and its beta", () => {
    const r = buildRiskReport(
      input({
        cash: { value: 0, weight: 0 },
        holdings: [
          { ticker: "XLK", name: "Tech", teamId: null, sector: "information_technology", value: 600_000, weight: 0.6 },
          { ticker: "XLF", name: "Fin", teamId: null, sector: "financials", value: 400_000, weight: 0.4 },
        ],
      }),
    );
    expect(r.portfolio.trackingError).toBeCloseTo(0, 10);
  });

  it("uses the weighted sum of holding betas", () => {
    const r = buildRiskReport(input());
    const byTicker = new Map(r.holdings.map((h) => [h.ticker, h]));
    expect(r.portfolio.beta).toBeCloseTo(0.54 * byTicker.get("AAA")!.beta + 0.36 * byTicker.get("BBB")!.beta, 12);
    expect(byTicker.get("AAA")!.beta).toBeGreaterThan(1.2);
    expect(r.portfolio.stress.move).toBeCloseTo(r.portfolio.beta * -0.1, 12);
  });

  it("stands a sector ETF in for a holding with too little history", () => {
    const short = [...Array(N - 20).fill(NaN), ...series(17, 20)];
    const r = buildRiskReport(input({ window: { dates, returns: new Map([...returns, ["BBB", short]]) } }));
    const bbb = r.holdings.find((h) => h.ticker === "BBB")!;
    expect(bbb.source).toBe("proxy");
    expect(bbb.proxy).toBe("XLF");
    expect(r.notices.some((n) => n.includes("BBB (20 days)"))).toBe(true);
  });

  it("computes VaR from today's weights replayed over the window", () => {
    const r = buildRiskReport(input());
    const sim = dates.map((_, t) => 0.54 * returns.get("AAA")![t] + 0.36 * returns.get("BBB")![t]).sort((a, b) => a - b);
    const rank = 0.05 * (N - 1);
    const lo = Math.floor(rank);
    expect(r.portfolio.var.pct).toBeCloseTo(-(sim[lo] + (rank - lo) * (sim[lo + 1] - sim[lo])), 12);
    expect(r.portfolio.var.dollars).toBeCloseTo(r.portfolio.var.pct * 1_000_000, 6);
  });

  it("holds realized statistics back until there are enough days", () => {
    const short = buildRiskReport(input({ realized: { dates: dates.slice(0, 5), portfolio: market.slice(0, 5), benchmark: market.slice(0, 5), market: market.slice(0, 5), riskFree: Array(5).fill(0.0001) } }));
    expect(short.realized!.enough).toBe(false);
    expect(short.realized!.vol).toBeNull();
    const full = buildRiskReport(input({ realized: { dates, portfolio: market, benchmark: market, market, riskFree: Array(N).fill(0.0001) } }));
    expect(full.realized!.beta).toBeCloseTo(1, 10);
    expect(full.realized!.trackingError).toBeCloseTo(0, 10);
  });
  it("measures drawdown over the lookback window, not since inception", () => {
    // 80 realized days before the window opens, with a 30% fall on one of them.
    const early = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2025, 9, 13 + i)).toISOString().slice(0, 10));
    const all = [...early, ...dates];
    const port = [...early.map((_, i) => (i === 5 ? -0.3 : 0)), ...market];
    const r = buildRiskReport(input({ realized: { dates: all, portfolio: port, benchmark: port, market: port, riskFree: Array(all.length).fill(0.0001) } }));
    expect(r.realized!.drawdown.dates[0]).toBe(dates[0]);
    expect(r.realized!.drawdown.dates).toHaveLength(r.realized!.days);
    expect(r.realized!.drawdown.max).toBeGreaterThan(-0.3);
    expect(r.realized!.drawdown.marketMax).toBeGreaterThan(-0.3);
  });

  it("keeps negative cash so sector weights still add to 100%", () => {
    const r = buildRiskReport(
      input({
        cash: { value: -100_000, weight: -0.1 },
        holdings: [
          { ticker: "AAA", name: "A", teamId: "t1", sector: "information_technology", value: 660_000, weight: 0.66 },
          { ticker: "BBB", name: "B", teamId: "t2", sector: "financials", value: 440_000, weight: 0.44 },
        ],
      }),
    );
    expect(r.sectors.find((s) => s.key === "cash")!.weight).toBeCloseTo(-0.1, 12);
    expect(r.sectors.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
    expect(r.sectors.reduce((s, x) => s + (x.active ?? 0), 0)).toBeCloseTo(0, 10);
  });

  it("splits tracking error into contributions that add up, and its marginal matches a recomputation", () => {
    const r = buildRiskReport(input());
    const te = r.portfolio.trackingError!;
    const contributions = r.holdings.reduce((s, h) => s + h.teContribution!, 0) + r.benchmarkLegs.reduce((s, l) => s + l.teContribution, 0);
    expect(contributions).toBeCloseTo(te, 12);
    // ∂TE/∂wᵢ = (Σa)ᵢ ÷ TE: bump each holding's active weight by ±1 bp, funded from cash, and recompute TE.
    const { active, covariance, tickers } = r.matrix;
    const h = 1e-4;
    for (const x of r.holdings) {
      const i = tickers.indexOf(x.ticker);
      const numeric = ((volAfterBump(active!, covariance, i, h) - volAfterBump(active!, covariance, i, -h)) / (2 * h)) * Math.sqrt(252);
      expect(x.marginalTe!).toBeCloseTo(numeric, 8);
    }
    // Euler again: Σ aᵢ × marginalᵢ is the tracking error itself.
    const euler = r.holdings.reduce((s, x) => s + x.weight * x.marginalTe!, 0) + r.benchmarkLegs.reduce((s, l) => s + l.weight * l.marginalTe, 0);
    expect(euler).toBeCloseTo(te, 12);
  });

  it("leaves active-risk figures empty without a benchmark", () => {
    const r = buildRiskReport(input({ benchmarkWeights: null }));
    expect(r.holdings.every((h) => h.marginalTe === null && h.teContribution === null && h.activeRiskShare === null)).toBe(true);
  });
});
