import { describe, expect, it } from "vitest";
import type { DateSeries } from "@/lib/attribution/types";
import { historyCovers } from "@/lib/prices";
import { MARKET } from "./model";
import { growthPath, rebalancedReturn, runStressTest, runStressTests, STRESS_HISTORY_FROM, STRESS_WINDOWS, stressDateRanges, type StressInput, type StressOk } from "./stress";

const DATES = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"];
const WINDOW = { key: "t", label: "Test", from: "2024-01-02", to: "2024-01-08", note: "" };

function series(entries: Record<string, (number | null)[]>, dates = DATES): DateSeries {
  const s: DateSeries = new Map();
  for (const [sym, values] of Object.entries(entries)) {
    const m = new Map<string, number>();
    values.forEach((v, i) => v !== null && m.set(dates[i], v));
    s.set(sym, m);
  }
  return s;
}

const prices = series({
  [MARKET]: [100, 98, 95, 96, 90], // −10%
  XLF: [50, 49, 45, 44, 40], // −20%
  XLK: [200, 196, 190, 188, 180], // −10%
  BANK: [20, 18, 15, 14, 10], // −50%
  TECH: [10, 10.5, 11, 11.5, 12], // +20%
  NEWCO: [null, null, 30, 29, 28], // lists mid-window
});

const base: StressInput = {
  nav: 1_000_000,
  cash: { value: 200_000, weight: 0.2 },
  holdings: [
    { ticker: "BANK", name: "Bank", sector: "financials", value: 300_000, weight: 0.3 },
    { ticker: "TECH", name: "Tech", sector: "information_technology", value: 400_000, weight: 0.4 },
    { ticker: "NEWCO", name: "New", sector: "financials", value: 100_000, weight: 0.1 },
  ],
  benchmarkWeights: { financials: 0.25, information_technology: 0.75 },
  prices,
  dividends: new Map(),
};

const ok = (r: ReturnType<typeof runStressTest>) => {
  expect(r.status).toBe("ok");
  return r as StressOk;
};

describe("growthPath", () => {
  it("compounds closes and reinvests dividends on their ex-dates", () => {
    const g = growthPath(series({ A: [100, 100, 99, 99, 99] }), series({ A: [null, null, 1, null, null] }), "A", DATES)!;
    // Ex-date close 99 + $1 dividend on a $100 prior close: flat on a total-return basis.
    expect(g).toEqual([1, 1, 1, 1, 1]);
    const priceOnly = growthPath(series({ A: [100, 100, 99, 99, 99] }), new Map(), "A", DATES)!;
    expect(priceOnly.at(-1)).toBeCloseTo(0.99, 12);
  });

  it("carries a missing interior close and applies its dividend at the next close", () => {
    const g = growthPath(series({ A: [100, null, 102, 102, 102] }), series({ A: [null, 2, null, null, null] }), "A", DATES)!;
    expect(g[1]).toBe(1);
    expect(g[2]).toBeCloseTo(1.04, 12);
  });

  it("is null without a purchase close, or when history stops before the end", () => {
    expect(growthPath(prices, new Map(), "NEWCO", DATES)).toBeNull();
    expect(growthPath(series({ A: [1, 1, null, null, null] }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"]), new Map(), "A", ["2024-01-02", "2024-03-01"])).toBeNull();
  });

  it("needs a close on the start date itself, so moves before the window never count as stress", () => {
    expect(growthPath(series({ A: [100, 110] }, ["2024-01-02", "2024-01-03"]), new Map(), "A", ["2024-01-02", "2024-01-03"])).toEqual([1, 1.1]);
    expect(growthPath(series({ A: [100, 110] }, ["2023-12-29", "2024-01-03"]), new Map(), "A", ["2024-01-02", "2024-01-03"])).toBeNull();
  });
});

describe("runStressTest", () => {
  const r = ok(runStressTest(base, WINDOW));

  it("uses the market's closes for the window's sessions", () => {
    expect(r.start).toBe("2024-01-02");
    expect(r.end).toBe("2024-01-08");
    expect(r.sessions).toBe(4);
    expect(r.market).toBeCloseTo(-0.1, 12);
    expect(r.backtestFrom).toBe("2024-01-03");
  });

  it("stands in the sector ETF for a holding not yet listed, and flags it", () => {
    const newco = r.holdings.find((h) => h.ticker === "NEWCO")!;
    expect(newco.proxied).toBe(true);
    expect(newco.series).toBe("XLF");
    expect(newco.proxyReason).toBe("first stored close 2024-01-04");
    expect(newco.ret).toBeCloseTo(-0.2, 12);
    expect(r.proxied).toBe(1);
    expect(r.holdings.find((h) => h.ticker === "BANK")!.proxied).toBe(false);
  });

  it("falls back to the S&P 500 for a holding with no sector", () => {
    const res = ok(runStressTest({ ...base, holdings: [{ ...base.holdings[2], sector: null }] }, WINDOW));
    expect(res.holdings[0].series).toBe(MARKET);
    expect(res.holdings[0].proxyReason).toContain("no sector set");
  });

  it("contributions add up to the fund's return, and dollars to the NAV impact", () => {
    // 0.3 × −50% + 0.4 × +20% + 0.1 × −20% (XLF) + cash 0.
    expect(r.fund).toBeCloseTo(-0.15 + 0.08 - 0.02, 12);
    expect(r.holdings.reduce((s, h) => s + h.contribution, 0)).toBeCloseTo(r.fund, 12);
    expect(r.dollars).toBeCloseTo(r.fund * 1_000_000, 6);
    expect(r.holdings.reduce((s, h) => s + h.dollars, 0)).toBeCloseTo(r.dollars, 6);
    expect(r.path[0]).toEqual({ date: "2024-01-02", fund: 0, market: 0, benchmark: 0 });
    expect(r.path.at(-1)!.fund).toBeCloseTo(r.fund, 12);
  });

  it("ranks the worst contributors first", () => {
    expect(r.worst.map((h) => h.ticker)).toEqual(["BANK", "NEWCO", "TECH"]);
  });

  it("measures the benchmark buy-and-hold at its sector weights, and active against it", () => {
    expect(r.benchmark).toBeCloseTo(0.25 * -0.2 + 0.75 * -0.1, 12);
    expect(r.active).toBeCloseTo(r.fund - r.benchmark!, 12);
    expect(r.benchmarkLegs.map((l) => l.etf)).toEqual(["XLK", "XLF"]);
    expect(r.benchmarkLegs.reduce((s, l) => s + l.contribution, 0)).toBeCloseTo(r.benchmark!, 12);
    const none = ok(runStressTest({ ...base, benchmarkWeights: null }, WINDOW));
    expect(none.benchmark).toBeNull();
    expect(none.active).toBeNull();
  });

  it("lets weights drift: end weights reflect each holding's return, and sum with cash to 100%", () => {
    const end = 1 + r.fund;
    expect(r.holdings.find((h) => h.ticker === "BANK")!.endWeight).toBeCloseTo((0.3 * 0.5) / end, 12);
    expect(r.holdings.reduce((s, h) => s + h.endWeight, 0) + 0.2 / end).toBeCloseTo(1, 12);
  });

  it("differs from a daily-rebalanced replay of the same weights", () => {
    // A doubles then halves; B is flat. Held: back to where it started. Rebalanced 50/50: 1.5 × 0.75.
    const d = DATES.slice(0, 3);
    const input: StressInput = {
      nav: 100,
      cash: { value: 0, weight: 0 },
      holdings: [
        { ticker: "A", name: "A", sector: null, value: 50, weight: 0.5 },
        { ticker: "B", name: "B", sector: null, value: 50, weight: 0.5 },
      ],
      benchmarkWeights: null,
      prices: series({ [MARKET]: [1, 1, 1], A: [10, 20, 10], B: [5, 5, 5] }, d),
      dividends: new Map(),
    };
    const res = ok(runStressTest(input, { ...WINDOW, to: d[2] }));
    expect(res.fund).toBeCloseTo(0, 12);
    expect(res.rebalanced).toBeCloseTo(0.125, 12);
    expect(rebalancedReturn([0.5, 0.5], [[1, 2, 1], [1, 1, 1]])).toBeCloseTo(0.125, 12);
  });

  it("includes dividends in holding and fund returns", () => {
    const res = ok(runStressTest({ ...base, dividends: series({ TECH: [null, null, null, null, 0.6] }) }, WINDOW));
    expect(res.holdings.find((h) => h.ticker === "TECH")!.ret).toBeCloseTo((12 + 0.6) / 10 - 1, 12);
    expect(res.fund - r.fund).toBeCloseTo(0.4 * 0.06, 12);
  });

  it("reports no data when stored closes do not reach the window", () => {
    const res = runStressTest(base, { ...WINDOW, from: "2020-02-19", to: "2020-03-23" });
    expect(res.status).toBe("no-data");
  });

  it("computes a team sleeve with no cash", () => {
    const team = ok(runStressTest({ ...base, cash: { value: 0, weight: 0 }, holdings: [{ ...base.holdings[0], weight: 1, value: 300_000 }], nav: 300_000 }, WINDOW));
    expect(team.fund).toBeCloseTo(-0.5, 12);
    expect(team.dollars).toBeCloseTo(-150_000, 6);
  });
});

describe("preview stress data", () => {
  it("runs every window through the real engine, with OSCR stood in before it lists", async () => {
    const { previewReport, previewStress } = await import("./preview");
    const report = previewReport("1y");
    const results = previewStress(report);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok"]);
    const [covid, , svb] = results as StressOk[];
    expect(covid.holdings.find((h) => h.ticker === "OSCR")!.series).toBe("XLB");
    expect(svb.proxied).toBe(0);
    for (const r of results as StressOk[]) {
      expect(r.holdings.reduce((s, h) => s + h.contribution, 0)).toBeCloseTo(r.fund, 12);
      expect(r.dollars).toBeCloseTo(r.fund * report.nav, 4);
      expect(r.benchmark).not.toBeNull();
    }
  });
});

describe("windows and history", () => {
  it("every window starts after the stored history does, and runs forward", () => {
    for (const w of STRESS_WINDOWS) {
      expect(w.from < w.to).toBe(true);
      expect(stressDateRanges([w])[0].from >= STRESS_HISTORY_FROM).toBe(true);
    }
    expect(runStressTests(base).every((x) => x.status === "no-data")).toBe(true);
  });

  it("counts history as covered from the requested start or, for a later listing, from its first trade", () => {
    expect(historyCovers("2020-02-03", "2020-02-01", null)).toBe(true);
    expect(historyCovers("2024-08-26", "2020-02-01", null)).toBe(false);
    expect(historyCovers("2024-08-26", "2020-02-01", "1998-12-22")).toBe(false);
    expect(historyCovers("2026-04-02", "2020-02-01", "2026-04-01")).toBe(true);
    expect(historyCovers("2026-05-01", "2020-02-01", "2026-04-01")).toBe(false);
  });
});
