import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AttributionResult } from "./attribution";
import { attributionHeadline, summarizeAttribution } from "./summary";

// Dates this year print without the year ("Tue 22 Sep"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const result: AttributionResult = {
  start: "2026-09-18",
  end: "2026-09-22",
  days: 2,
  portfolioReturn: -0.012,
  benchmarkReturn: -0.004,
  activeReturn: -0.008,
  effects: { allocation: -0.001, selection: -0.0065, interaction: -0.0005 },
  sectors: [{ key: "information_technology", avgPortfolioWeight: 0.3, avgBenchmarkWeight: 0.32, portfolioReturn: -0.03, benchmarkReturn: -0.01, contribution: -0.009, allocation: 0, selection: -0.006, interaction: 0, total: -0.006 }],
  holdings: [
    { ticker: "NVDA", name: "Nvidia", sector: "information_technology", teamId: "t1", avgWeight: 0.05, ret: -0.08, contribution: -0.004 },
    { ticker: "JPM", name: "JPMorgan", sector: "financials", teamId: "t2", avgWeight: 0.04, ret: 0.02, contribution: 0.0008 },
    { ticker: "XOM", name: "Exxon", sector: "energy", teamId: null, avgWeight: 0.03, ret: 0.0, contribution: 0 },
  ],
  teams: [{ teamId: "t1", avgWeight: 0.3, ret: -0.02, contribution: -0.006 }],
  cashContribution: 0,
  cumulative: [
    { date: "2026-09-18", portfolio: 0, benchmark: 0, active: 0 },
    { date: "2026-09-21", portfolio: 0.01, benchmark: 0.0, active: 0.01 },
    { date: "2026-09-22", portfolio: -0.012, benchmark: -0.004, active: -0.008 },
  ],
};

describe("summarizeAttribution", () => {
  const s = summarizeAttribution({
    scope: "fund",
    period: { key: "7d", start: "2026-09-18", end: "2026-09-22", clamped: false },
    result,
    index: new Map([["2026-09-18", 6000], ["2026-09-21", 6030], ["2026-09-22", 6060]]),
    teamNames: new Map([["t1", "Tech"], ["t2", "FIG"]]),
    holdingsLimit: 1,
    notices: [],
  });

  it("reports the headline in percent and bp against the S&P 500, in accounting style", () => {
    expect(s.headline).toMatchObject({ returnPct: -1.2, spxPriceReturnPct: 1, activeVsSpxBps: -220, activeVsSectorBenchmarkBps: -80, selectionBps: -65 });
  });
  it("lists the best and worst contributors with team names", () => {
    expect(s.topContributors.map((h) => h.ticker)).toEqual(["JPM"]);
    expect(s.bottomContributors).toEqual([expect.objectContaining({ ticker: "NVDA", team: "Tech", contributionBps: -40, returnPct: -8 })]);
  });
  it("rebuilds daily returns from the cumulative series", () => {
    expect(s.daily?.map((d) => d.date)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(s.daily?.[0]).toMatchObject({ returnPct: 1, spxReturnPct: 0.5, activeVsSpxBps: 50 });
    expect(s.daily?.[1].returnPct).toBeCloseTo(((1 - 0.012) / 1.01 - 1) * 100, 2);
  });
  it("summarizes in one line", () => {
    expect(attributionHeadline(s)).toContain("Whole fund, 7D (Fri 18 Sep close to Tue 22 Sep close): return (1.20%); S&P 500 1.00%, active (220 bp)");
    expect(attributionHeadline(s)).toContain("biggest detractors NVDA (40 bp); top contributors JPM 8 bp");
  });
});
