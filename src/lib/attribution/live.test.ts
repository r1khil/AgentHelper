import { describe, expect, it } from "vitest";
import { marketPhase } from "../providers/calendar";
import { computeAttribution } from "./attribution";
import { buildLiveSnapshot, DOW_SYMBOL, intradayPath, withQuotes, type LiveQuote } from "./live";
import { buildSeries, type SeriesInputs } from "./series";
import type { DateSeries, SecurityMeta, Trade } from "./types";

const D1 = "2026-09-23";
const D2 = "2026-09-24";
const D3 = "2026-09-25";

const closes: Record<string, [number, number, number]> = {
  SPY: [600, 606, 603],
  "^GSPC": [6000, 6060, 6030],
  XLK: [250, 255, 252],
  XLF: [50, 50.5, 50.2],
  AAA: [100, 104, 101],
  BBB: [40, 39, 39.5],
};

function prices(days: string[]): DateSeries {
  const all = [D1, D2, D3];
  return new Map(Object.entries(closes).map(([t, v]) => [t, new Map(all.map((d, i) => [d, v[i]] as const).filter(([d]) => days.includes(d)))]));
}

const meta = new Map<string, SecurityMeta>([
  ["AAA", { ticker: "AAA", name: "Alpha", sector: "information_technology", teamId: "tech" }],
  ["BBB", { ticker: "BBB", name: "Beta", sector: "financials", teamId: "fig" }],
  ["CCC", { ticker: "CCC", name: "Gamma", sector: "financials", teamId: "fig" }],
]);

const buy = (date: string, ticker: string, shares: number, price: number): Trade => ({ date, ticker, side: "buy", shares, price, fees: 0 });

function inputs(days: string[], trades: Trade[] = []): SeriesInputs {
  return {
    trades: [buy(D1, "AAA", 50, 100), buy(D1, "BBB", 100, 40), ...trades],
    cashFlows: [{ date: D1, kind: "deposit", amount: 10_000 }],
    inception: D1,
    weightSets: [{ asOf: "2026-09-01", weights: { information_technology: 60, financials: 40 } }],
    prices: prices(days),
    dividends: new Map(),
    splits: [],
    meta,
  };
}

/** Quotes stamped at 14:00 ET on `date` from the D3 closes. */
function quotesAt(date: string, symbols = Object.keys(closes)): Record<string, LiveQuote> {
  return Object.fromEntries(symbols.map((s) => [s, { price: closes[s][2], asOf: `${date}T18:00:00.000Z`, previousClose: closes[s][1] }]));
}

const open = { phase: "open" as const, session: D3, opensAt: `${D3}T13:30:00.000Z`, closesAt: `${D3}T20:00:00.000Z` };
const after = { phase: "closed" as const, session: D3, opensAt: "2026-09-28T13:30:00.000Z", closesAt: null };
const now = new Date(`${D3}T18:05:00.000Z`);

describe("buildLiveSnapshot", () => {
  it("gives exactly the stored-close result when the quotes equal the closes", () => {
    const live = buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: quotesAt(D3), market: open, now })!;
    const final = buildLiveSnapshot({ raw: inputs([D1, D2, D3]), quotes: {}, market: after, now })!;
    expect(live.status).toBe("live");
    expect(final.status).toBe("final");
    expect(live.session).toBe(D3);
    expect(live.base).toBe(D2);

    const stored = buildSeries(inputs([D1, D2, D3]));
    const attribution = computeAttribution(stored.series, { start: D2, end: D3 });
    for (const s of [live, final]) {
      expect(s.result.portfolioReturn).toBeCloseTo(attribution.portfolioReturn, 12);
      expect(s.result.activeReturn!).toBeCloseTo(attribution.activeReturn!, 12);
      expect(s.result.effects!.selection).toBeCloseTo(attribution.effects!.selection, 12);
      expect(s.ret).toBeCloseTo(stored.series.portfolio.at(-1)!.ret, 12);
      expect(s.spx!).toBeCloseTo(6030 / 6060 - 1, 12);
    }
    expect(live.holdings.map((h) => [h.ticker, h.contribution])).toEqual(attribution.holdings.map((h) => [h.ticker, expect.closeTo(h.contribution, 12)]));
    expect(live.holdings.every((h) => h.source === "quote")).toBe(true);
    expect(final.holdings.every((h) => h.source === "close")).toBe(true);
  });

  it("weights contributions at the open and drifts the current weight", () => {
    const s = buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: quotesAt(D3), market: open, now })!;
    const a = s.holdings.find((h) => h.ticker === "AAA")!;
    expect(a.ret).toBeCloseTo(101 / 104 - 1, 12);
    expect(a.contribution).toBeCloseTo(a.weightOpen * a.ret, 12);
    expect(a.weightNow).toBeCloseTo((50 * 101) / s.value, 12);
    expect(s.holdings.reduce((x, h) => x + h.contribution, 0)).toBeCloseTo(s.ret, 12);
  });

  it("carries a holding with no quote this session at its last close and says so", () => {
    const quotes = quotesAt(D3);
    quotes.BBB = { ...quotes.BBB, asOf: `${D2}T20:00:00.000Z` };
    const s = buildLiveSnapshot({ raw: inputs([D1, D2]), quotes, market: open, now })!;
    const b = s.holdings.find((h) => h.ticker === "BBB")!;
    expect(b.source).toBe("carried");
    expect(b.ret).toBe(0);
    expect(s.notes.join(" ")).toContain("No quote yet this session for BBB");
  });

  it("counts a buy made today from the start of the session, at its trade price", () => {
    const raw = inputs([D1, D2], [buy(D3, "CCC", 10, 20)]);
    const quotes = { ...quotesAt(D3), CCC: { price: 21, asOf: `${D3}T18:00:00.000Z` } };
    const s = buildLiveSnapshot({ raw, quotes, market: open, now })!;
    const c = s.holdings.find((h) => h.ticker === "CCC")!;
    expect(c.ret).toBeCloseTo(21 / 20 - 1, 12);
    expect(c.weightOpen).toBeGreaterThan(0);
    expect(s.holdings.reduce((x, h) => x + h.contribution, 0)).toBeCloseTo(s.ret, 12);
  });

  it("marks closing quotes provisional after the bell, and flags stale quotes during the session", () => {
    expect(buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: quotesAt(D3), market: after, now })!.status).toBe("provisional");
    const late = new Date(`${D3}T18:30:00.000Z`);
    expect(buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: quotesAt(D3), market: open, now: late })!.notes.join(" ")).toContain("more than 15 minutes old");
  });

  it("reads the Dow from its own quote and only for the session shown", () => {
    const quotes = { ...quotesAt(D3), [DOW_SYMBOL]: { price: 45_450, previousClose: 45_000, asOf: `${D3}T18:00:00.000Z` } };
    expect(buildLiveSnapshot({ raw: inputs([D1, D2]), quotes, market: open, now })!.dow).toBeCloseTo(0.01, 12);
    quotes[DOW_SYMBOL].asOf = `${D2}T20:00:00.000Z`;
    expect(buildLiveSnapshot({ raw: inputs([D1, D2]), quotes, market: open, now })!.dow).toBeNull();
  });

  it("falls back to the last stored session when there are neither closes nor quotes for it", () => {
    const s = buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: {}, market: open, now })!;
    expect(s.status).toBe("final");
    expect(s.session).toBe(D2);
    expect(s.notes[0]).toContain(`Closes for ${D3}`);
  });

  it("builds a team's sleeve against its own sectors", () => {
    const s = buildLiveSnapshot({ raw: inputs([D1, D2]), quotes: quotesAt(D3), market: open, now, team: { id: "fig", sectors: ["financials"] } })!;
    expect(s.holdings.map((h) => h.ticker)).toEqual(["BBB"]);
    expect(s.holdings[0].weightOpen).toBeCloseTo(1, 12);
    expect(s.ret).toBeCloseTo(39.5 / 39 - 1, 12);
    expect(s.result.benchmarkReturn!).toBeCloseTo(50.2 / 50.5 - 1, 12);
    expect(s.legs.benchmark.map((l) => l.symbol)).toEqual(["XLF"]);
  });
});

describe("withQuotes", () => {
  it("never overwrites a stored close", () => {
    const raw = inputs([D1, D2, D3]);
    const { raw: out, quoted } = withQuotes(raw, D3, { AAA: { price: 999, asOf: `${D3}T18:00:00.000Z` } });
    expect(out.prices.get("AAA")!.get(D3)).toBe(101);
    expect(quoted.size).toBe(0);
    expect(raw.prices.get("AAA")!.get(D3)).toBe(101);
  });
});

describe("intradayPath", () => {
  it("starts each leg at its base, holds its last bar, and ends on the snapshot's figures", () => {
    const legs = { portfolio: [{ symbol: "AAA", weight: 0.5, base: 100 }, { symbol: "BBB", weight: 0.5, base: 40 }], benchmark: [{ symbol: "^GSPC", weight: 1, base: 6000 }] };
    const bars = {
      AAA: [{ t: "2026-09-25T13:35:00.000Z", close: 102 }, { t: "2026-09-25T13:40:00.000Z", close: 104 }],
      BBB: [{ t: "2026-09-25T13:40:00.000Z", close: 42 }],
      "^GSPC": [{ t: "2026-09-25T13:35:00.000Z", close: 6060 }],
    };
    const path = intradayPath(legs, bars, { t: "2026-09-25T13:41:00.000Z", portfolio: 0.05, benchmark: 0.01 });
    expect(path.map((p) => p.t)).toEqual(["2026-09-25T13:35:00.000Z", "2026-09-25T13:40:00.000Z", "2026-09-25T13:41:00.000Z"]);
    expect(path[0].portfolio).toBeCloseTo(0.5 * 0.02, 12);
    expect(path[1].portfolio).toBeCloseTo(0.5 * 0.04 + 0.5 * 0.05, 12);
    expect(path[1].benchmark).toBeCloseTo(0.01, 12);
    expect(path[2]).toEqual({ t: "2026-09-25T13:41:00.000Z", portfolio: 0.05, benchmark: 0.01 });
  });
});

describe("marketPhase", () => {
  const at = (iso: string) => marketPhase(new Date(iso));
  it("follows the bell in New York time", () => {
    expect(at("2026-09-28T13:29:00.000Z")).toMatchObject({ phase: "pre", session: "2026-09-25" });
    expect(at("2026-09-28T13:30:00.000Z")).toMatchObject({ phase: "open", session: "2026-09-28", closesAt: "2026-09-28T20:00:00.000Z" });
    expect(at("2026-09-28T19:59:00.000Z").phase).toBe("open");
    expect(at("2026-09-28T20:00:00.000Z")).toMatchObject({ phase: "closed", session: "2026-09-28", opensAt: "2026-09-29T13:30:00.000Z" });
  });
  it("handles weekends, holidays and early closes", () => {
    expect(at("2026-09-26T15:00:00.000Z")).toMatchObject({ phase: "closed", session: "2026-09-25", opensAt: "2026-09-28T13:30:00.000Z" });
    expect(at("2026-11-26T15:00:00.000Z")).toMatchObject({ phase: "closed", session: "2026-11-25" });
    expect(at("2026-11-27T17:59:00.000Z")).toMatchObject({ phase: "open", closesAt: "2026-11-27T18:00:00.000Z" });
    expect(at("2026-11-27T18:00:00.000Z").phase).toBe("closed");
  });
});
