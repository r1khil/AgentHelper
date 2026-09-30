import { describe, expect, it } from "vitest";
import {
  altmanZ,
  computeScreenMetrics,
  effectiveTaxRate,
  enterpriseValue,
  epsGrowth3y,
  evToEbit,
  historicalEvEbit,
  investedCapital,
  median,
  METRIC_DEFS,
  METRIC_KEYS,
  netDebtToEbitda,
  nopat,
  piotroski,
  roic,
  roicStable,
  roicTrend,
  shareChange3y,
  slope,
  type CompanyHistory,
} from "./metrics";
import { blankYear, healthyYear } from "./test-fixtures";

const ends = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31", "2020-12-31"];

function history(over: Partial<CompanyHistory> = {}): CompanyHistory {
  const years = ends.map((e, i) => healthyYear(e, i === 3 ? { eps: 1, shares: 110 } : {}));
  return { years, yearEndPrices: [20, 15, 20, 25, 30, 35], price: 20, marketCap: 2000, ...over };
}

describe("METRIC_DEFS", () => {
  it("covers every metric key once", () => {
    expect(METRIC_DEFS.map((d) => d.key).sort()).toEqual([...METRIC_KEYS].sort());
  });
});

describe("building blocks", () => {
  const y = healthyYear("2025-12-31");
  it("computes the effective tax rate and clamps it", () => {
    expect(effectiveTaxRate(y)).toBeCloseTo(0.2);
    expect(effectiveTaxRate({ incomeTax: 90, pretaxIncome: 100 })).toBe(0.35);
    expect(effectiveTaxRate({ incomeTax: -5, pretaxIncome: 100 })).toBe(0);
    expect(effectiveTaxRate({ incomeTax: 5, pretaxIncome: -100 })).toBe(0.21);
  });
  it("computes NOPAT, invested capital and ROIC", () => {
    expect(nopat(y)).toBeCloseTo(160);
    expect(investedCapital(y)).toBe(1000);
    expect(roic(y)).toBeCloseTo(0.16);
    expect(investedCapital({ equity: 50, debt: 0, cash: 100 })).toBeNull();
    expect(roic(blankYear("2025-12-31"))).toBeNull();
  });
  it("computes EV and EV/EBIT, blank for losses", () => {
    expect(enterpriseValue(2000, y)).toBe(2200);
    expect(evToEbit(2200, 200)).toBe(11);
    expect(evToEbit(2200, -5)).toBeNull();
    expect(evToEbit(-10, 200)).toBeNull();
  });
  it("slope and median", () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
    expect(slope([0.2, 0.18, 0.16, 0.14, 0.12])).toBeCloseTo(-0.02);
    expect(slope([1])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("Altman Z'' by hand", () => {
    // 6.56×0.1 + 3.26×0.25 + 6.72×0.1 + 1.05×(800/1200)
    expect(altmanZ(y)).toBeCloseTo(0.656 + 0.815 + 0.672 + 0.7, 6);
    expect(altmanZ({ ...y, retainedEarnings: null })).toBeNull();
  });
  it("net debt to EBITDA", () => {
    expect(netDebtToEbitda(y)).toBeCloseTo(0.8);
    expect(netDebtToEbitda({ ...y, cash: 500 })).toBeCloseTo(-0.8);
    expect(netDebtToEbitda({ ...y, ebit: -100 })).toBeNull();
    expect(netDebtToEbitda({ ...y, depreciation: null })).toBeNull();
  });
});

describe("history metrics", () => {
  it("EPS growth needs positive ends", () => {
    const h = history().years;
    expect(epsGrowth3y(h)).toBeCloseTo(1.52 ** (1 / 3) - 1, 8);
    expect(epsGrowth3y([h[0], h[1], h[2], { ...h[3], eps: -1 }])).toBeNull();
    expect(epsGrowth3y(h.slice(0, 3))).toBeNull();
  });
  it("share change compares like with like", () => {
    const h = history().years;
    expect(shareChange3y(h)).toBeCloseTo(100 / 110 - 1);
    expect(shareChange3y([h[0], h[1], h[2], { ...h[3], sharesSource: "diluted" }])).toBeNull();
  });
  it("ROIC trend and stability", () => {
    const flat = history().years;
    expect(roicTrend(flat)).toBeCloseTo(0);
    expect(roicStable(flat)).toBe(true);
    // ROIC 16% now, but EBIT was higher before: falling 4 points a year.
    const falling = flat.map((y, i) => ({ ...y, ebit: 200 + i * 50 }));
    expect(roicTrend(falling)).toBeCloseTo(-0.04);
    expect(roicStable(falling)).toBe(false);
    const low = flat.map((y) => ({ ...y, ebit: 100 }));
    expect(roicStable(low)).toBe(false);
    expect(roicTrend(flat.slice(0, 3))).toBeNull();
  });
  it("historical EV/EBIT uses each year's price and share count", () => {
    expect(historicalEvEbit(history())).toEqual([8.5, 11, 13.5, 16, 18.5].map((x, i) => (i === 2 ? (25 * 110 + 200) / 200 : x)));
  });
});

describe("piotroski", () => {
  const prev = healthyYear("2024-12-31", { netIncome: 100, totalAssets: 2000, longTermDebt: 300, currentAssets: 500, grossProfit: 350, revenue: 950, shares: 105 });
  it("scores all nine tests", () => {
    // ROA>0, CFO>0, ΔROA>0, CFO>NI, leverage down, current ratio up, no new shares, margin up, turnover up.
    expect(piotroski(healthyYear("2025-12-31"), prev)).toEqual({ score: 9, tested: 9 });
  });
  it("fails the tests that go the wrong way", () => {
    const cur = healthyYear("2025-12-31", { netIncome: -10, operatingCashFlow: -5, shares: 120, grossProfit: 300 });
    // ROA<0, CFO<0, ΔROA<0, CFO(−5) > NI(−10) passes, leverage down passes, current ratio up passes, shares up, margin down, turnover up passes.
    expect(piotroski(cur, prev)).toEqual({ score: 4, tested: 9 });
  });
  it("is blank when more than one test can't be run", () => {
    expect(piotroski(healthyYear("2025-12-31", { grossProfit: null, currentAssets: null }), prev).score).toBeNull();
    expect(piotroski(healthyYear("2025-12-31", { grossProfit: null }), prev)).toEqual({ score: 8, tested: 8 });
    expect(piotroski(healthyYear("2025-12-31"), undefined).score).toBeNull();
  });
});

describe("computeScreenMetrics", () => {
  it("computes every metric (pct metrics as fractions)", () => {
    const r = computeScreenMetrics(history());
    expect(r.metrics).toEqual({
      evEbit: 11,
      fcfYield: 0.08,
      // Previous five: 8.5, 11, 14.75 (year 3 had 110 shares), 16, 18.5; median 14.75.
      evEbitVsMedian: +(11 / 14.75).toFixed(3),
      piotroski: r.metrics.piotroski,
      roic: 0.16,
      roicTrend: 0,
      altmanZ: 2.84,
      shareChange3y: -0.0909,
      netDebtEbitda: 0.8,
      epsGrowth3y: 0.1498,
    });
    expect(r.distress).toBe(false);
    expect(r.garpEligible).toBe(true);
    expect(Object.values(r.resolved).every(Boolean)).toBe(true);
  });
  it("flags distress under Z'' 1.1", () => {
    const years = history().years.map((y) => ({ ...y, retainedEarnings: -2000, currentAssets: 300 }));
    const r = computeScreenMetrics(history({ years }));
    expect(r.metrics.altmanZ).toBeLessThan(1.1);
    expect(r.distress).toBe(true);
  });
  it("leaves a loss-maker's EV/EBIT blank but resolved", () => {
    const years = history().years.map((y, i) => (i === 0 ? { ...y, ebit: -50 } : y));
    const r = computeScreenMetrics(history({ years }));
    expect(r.metrics.evEbit).toBeNull();
    expect(r.resolved.evEbit).toBe(true);
  });
  it("needs three historical multiples for the median comparison", () => {
    const r = computeScreenMetrics(history({ yearEndPrices: [20, 15, null, null, null, 35] }));
    expect(r.metrics.evEbitVsMedian).toBeNull();
    expect(r.resolved.evEbitVsMedian).toBe(false);
  });
  it("returns blanks for a company with no years", () => {
    const r = computeScreenMetrics({ years: [], yearEndPrices: [], price: null, marketCap: null });
    expect(Object.values(r.metrics).every((v) => v === null)).toBe(true);
  });
});
