import { describe, expect, it } from "vitest";
import { buildBenchmarkDays } from "@/lib/attribution/benchmark";
import { buildPortfolioDays } from "@/lib/attribution/ledger";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import type { DateSeries, SecurityMeta } from "@/lib/attribution/types";
import { assembleRiskInput } from "./inputs";

const D = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
const prices: DateSeries = new Map([
  ["SPY", new Map([["2026-01-02", 100], ["2026-01-05", 101], ["2026-01-06", 102], ["2026-01-07", 100], ["2026-01-08", 103]])],
  ["AAA", new Map([["2026-01-02", 10], ["2026-01-05", 10], ["2026-01-06", 11], ["2026-01-07", 10.5], ["2026-01-08", 11]])],
  ["BBB", new Map([["2026-01-02", 20], ["2026-01-05", 20], ["2026-01-06", 20], ["2026-01-07", 21], ["2026-01-08", 22]])],
  ["^IRX", new Map([["2026-01-07", 4.2]])],
  ...GICS_SECTORS.map((s) => [ETF_BY_SECTOR[s], new Map([["2026-01-02", 50], ["2026-01-05", 50], ["2026-01-06", 51], ["2026-01-07", 50], ["2026-01-08", 52]])] as const),
]);
const dividends: DateSeries = new Map([["BBB", new Map([["2026-01-08", 0.5]])]]);
const meta = new Map<string, SecurityMeta>([
  ["AAA", { ticker: "AAA", name: "A", sector: "information_technology", teamId: "tech" }],
  ["BBB", { ticker: "BBB", name: "B", sector: "financials", teamId: "fig" }],
]);
const portfolio = buildPortfolioDays({
  trades: [
    { date: D[0], ticker: "AAA", side: "buy", shares: 100, price: 10, fees: 0 },
    { date: D[0], ticker: "BBB", side: "buy", shares: 50, price: 20, fees: 0 },
  ],
  cashFlows: [{ date: D[0], kind: "deposit", amount: 2_500 }],
  prices,
  dividends,
  days: D,
}).days;
const benchmark = buildBenchmarkDays([{ asOf: "2026-01-02", weights: { information_technology: 60, financials: 40 } }], prices, new Map(), D).days;
const series = { portfolio, benchmark, meta };

describe("assembleRiskInput", () => {
  it("weights the Fund's holdings and cash by NAV and reads returns on market days", () => {
    const input = assembleRiskInput({ series, prices, dividends, lookback: "6m", scope: { kind: "fund" } })!;
    const total = input.holdings.reduce((s, h) => s + h.weight, 0) + input.cash.weight;
    expect(total).toBeCloseTo(1, 12);
    expect(input.window.dates).toEqual(D);
    // BBB on the 8th: (22 + 0.5 dividend) / 21 − 1.
    expect(input.window.returns.get("BBB")!.at(-1)).toBeCloseTo(22.5 / 21 - 1, 12);
    expect(input.riskFree).toEqual({ annual: 0.042, asOf: "2026-01-07" });
    expect(Object.values(input.benchmarkWeights!).reduce((s, w) => s + w!, 0)).toBeCloseTo(1, 12);
    expect(input.realized!.dates).toEqual(D);
    expect(input.realized!.market[1]).toBeCloseTo(102 / 101 - 1, 12);
  });

  it("scales a team's holdings to 100% with no cash and benchmarks it on the team's sectors", () => {
    const input = assembleRiskInput({ series, prices, dividends, lookback: "6m", scope: { kind: "team", teamId: "tech", sectors: ["information_technology"] } })!;
    expect(input.holdings.map((h) => h.ticker)).toEqual(["AAA"]);
    expect(input.holdings[0].weight).toBeCloseTo(1, 12);
    expect(input.cash.weight).toBe(0);
    expect(input.benchmarkWeights).toEqual({ information_technology: 1 });
    expect(input.realized!.portfolio[1]).toBeCloseTo(0.1, 12);
  });
});
