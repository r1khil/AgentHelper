import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SOURCE_LABELS } from "@/lib/lookthrough/parse";
import { activeWeights, buildLookthrough, buildSectorResolver, describeCoverage, describeExposure, type EtfList, type LookthroughInput } from "./lookthrough";

// Dates this year print without the year ("Tue 22 Sep"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const list = (etf: string, source: EtfList["source"], rows: [string, number, EtfList["constituents"][number]["sector"]?][], asOf = "2026-09-23"): EtfList => ({
  etf,
  asOf,
  source,
  constituents: rows.map(([symbol, weight, sector]) => ({ symbol, name: `${symbol} Inc`, weight, sector: sector ?? null })),
});

const SOXX = list("SOXX", "ishares", [["NVDA", 9], ["AVGO", 8], ["AMD", 82.5]]); // 99.5% covered
const SKYY = list("SKYY", "first-trust", [["NVDA", 4], ["GOOGL", 6], ["ORCL", 90]]);
const KRE = list("KRE", "yahoo-top10", [["ZION", 15], ["CFG", 10]], "2026-09-25"); // Top holdings only: 25%
const XLF = list("XLF", "ssga", [["JPM", 10, "financials"], ["ZION", 1, "financials"], ["CFG", 1, "financials"]]);
const SPY = list("SPY", "ssga", [["NVDA", 8], ["AAPL", 7], ["GOOGL", 3], ["GOOG", 2.5], ["JPM", 1.5], ["ZION", 0.01], ["OTHER", 77.99]]);

const input = (): LookthroughInput => ({
  positions: [
    { ticker: "NVDA", name: "NVIDIA", weight: 0.03, sector: "information_technology" },
    { ticker: "SOXX", name: "iShares Semiconductor", weight: 0.1, sector: "information_technology" },
    { ticker: "SKYY", name: "First Trust Cloud", weight: 0.05, sector: "information_technology" },
    { ticker: "KRE", name: "SPDR Regional Banking", weight: 0.04, sector: "financials" },
    { ticker: "XYZ", name: "Some ETF", weight: 0.02, sector: null },
    { ticker: "GOOG", name: "Alphabet C", weight: 0.05, sector: "communication_services" },
    { ticker: "JPM", name: "JPMorgan", weight: 0.06, sector: "financials" },
    { ticker: "AAPL", name: "Apple", weight: 0.6, sector: "information_technology" },
  ],
  cash: 0.05,
  lists: [SOXX, SKYY, KRE],
  benchmark: SPY,
  isEtf: (t) => ["SOXX", "SKYY", "KRE", "XYZ"].includes(t),
  sectorOf: buildSectorResolver({ lists: [XLF], sectorEtfs: { XLF: "financials" } }),
});

describe("buildLookthrough", () => {
  it("puts an unclassified direct holding in the same sector as its ETF weight", () => {
    const XLK = list("XLK", "ssga", [["FOO", 100]]);
    const r = buildLookthrough({
      positions: [
        { ticker: "FOO", name: "Foo", weight: 0.1, sector: null },
        { ticker: "XLK", name: "Tech SPDR", weight: 0.5, sector: "information_technology" },
      ],
      cash: 0.4,
      lists: [XLK],
      benchmark: null,
      isEtf: (t) => t === "XLK",
      sectorOf: buildSectorResolver({ lists: [XLK], sectorEtfs: { XLK: "information_technology" } }),
    });
    const tech = r.sectors.find((s) => s.key === "information_technology")!;
    expect(tech.lookthrough).toBeCloseTo(0.6, 12);
    expect(r.sectors.find((s) => s.key === "unclassified")?.lookthrough ?? 0).toBeCloseTo(0, 12);
    expect(r.names.find((n) => n.key === "FOO")!.sector).toBe("information_technology");
  });

  it("combines direct and ETF exposure per name", () => {
    const r = buildLookthrough(input());
    const nvda = r.names.find((n) => n.key === "NVDA")!;
    expect(nvda.total).toBeCloseTo(0.041, 12);
    expect(nvda.direct).toBeCloseTo(0.03, 12);
    expect(nvda.viaEtfs.map((v) => v.via)).toEqual(["SOXX", "SKYY"]);
    expect(nvda.viaEtfs[0].weight).toBeCloseTo(0.009, 12);
    expect(nvda.overlap).toBe(true);
    expect(describeExposure(nvda)).toBe("NVDA 4.1% = 3.0% direct + 0.9% SOXX + 0.2% SKYY");
    expect(r.names.find((n) => n.key === "AVGO")!.overlap).toBe(false);
    expect(r.names.find((n) => n.key === "AAPL")!.overlap).toBe(false);
  });

  it("collapses share classes and keeps the Fund's own name for the company", () => {
    const goog = buildLookthrough(input()).names.find((n) => n.key === "GOOG")!;
    expect(goog.symbols).toEqual(["GOOG", "GOOGL"]);
    expect(goog.total).toBeCloseTo(0.05 + 0.05 * 0.06, 12);
    expect(goog.name).toBe("Alphabet C");
    expect(goog.overlap).toBe(true);
    expect(goog.sector).toBe("communication_services");
  });

  it("keeps uncovered ETF weight in an explicit bucket so the report adds back to the book", () => {
    const r = buildLookthrough(input());
    expect(r.notLookedThrough.byEtf.map((l) => l.via)).toEqual(["KRE", "XYZ", "SOXX"]);
    expect(r.notLookedThrough.total).toBeCloseTo(0.04 * 0.75 + 0.02 + 0.1 * 0.005, 12);
    expect(r.total).toBeCloseTo(1, 12);
    expect(r.names.some((n) => n.key === "XYZ")).toBe(false); // An ETF without a list is not a stock.
  });

  it("reports each ETF's coverage, source and as-of", () => {
    const r = buildLookthrough(input());
    const by = Object.fromEntries(r.etfs.map((e) => [e.etf, e]));
    // 99.5%: the rest is the ETF's own cash, so it counts as fully looked through.
    expect(by.SOXX).toMatchObject({ status: "full", source: "ishares", asOf: "2026-09-23", names: 3 });
    expect(by.SOXX.coverage).toBeCloseTo(0.995, 12);
    expect(by.SKYY).toMatchObject({ status: "full", coverage: 1 });
    expect(by.KRE).toMatchObject({ status: "top-holdings", coverage: 0.25 });
    expect(by.KRE.notLookedThrough).toBeCloseTo(0.03, 12);
    expect(by.XYZ).toMatchObject({ status: "none", coverage: 0, source: null, asOf: null, notLookedThrough: 0.02 });
    expect(describeCoverage(by.SKYY, (s) => SOURCE_LABELS[s])).toBe("SKYY 100.0% looked through, as of Wed 23 Sep, First Trust");
    expect(describeCoverage(by.XYZ, (s) => SOURCE_LABELS[s])).toBe("XYZ not looked through (no holdings list)");
  });

  it("computes sector weights through the ETFs, marking what was assumed", () => {
    const r = buildLookthrough(input());
    const s = Object.fromEntries(r.sectors.map((x) => [x.key, x]));
    // As held: KRE counts whole in Financials.
    expect(s.financials.asHeld).toBeCloseTo(0.1, 12);
    // Through: JPM 6% + KRE's named banks (1%, classified via XLF) + KRE's uncovered 3%, assumed Financials.
    expect(s.financials.lookthrough).toBeCloseTo(0.06 + 0.01 + 0.03, 12);
    expect(s.financials.assumed).toBeCloseTo(0.03, 12);
    // SKYY's GOOGL moves to Communication Services (sector from the direct GOOG holding).
    expect(s.information_technology.lookthrough).toBeCloseTo(0.03 + 0.1 + 0.05 * 0.94 + 0.6, 12);
    expect(s.cash.lookthrough).toBe(0.05);
    expect(s.unclassified.lookthrough).toBeCloseTo(0.02, 12);
    const total = r.sectors.reduce((acc, x) => acc + x.lookthrough, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("finds stock-level active weights against SPY", () => {
    const a = buildLookthrough(input()).active!;
    const row = (k: string) => a.rows.find((x) => x.key === k)!;
    expect(row("NVDA").active).toBeCloseTo(0.041 - 0.08, 12);
    expect(row("GOOG").benchmark).toBeCloseTo(0.055, 12); // SPY's GOOG + GOOGL.
    expect(row("AMD").benchmark).toBe(0);
    expect(a.largestOverweight?.key).toBe("AAPL");
    expect(a.largestUnderweight?.key).toBe("OTHER");
    expect(a.largestBet?.key).toBe("OTHER");
    expect(a.excluded).toBeCloseTo(0.05 + 0.0505, 12);
    expect(a.benchmark).toMatchObject({ etf: "SPY", source: "ssga" });
    expect(a.benchmark.coverage).toBeCloseTo(1, 12);
    expect(a.activeShare).toBeGreaterThan(0.5);
    expect(a.activeShare).toBeLessThan(1);
  });

  it("works with no ETFs and no benchmark", () => {
    const r = buildLookthrough({ positions: [{ ticker: "MSFT", name: "Microsoft", weight: 0.9, sector: "information_technology" }], cash: 0.1, lists: [] });
    expect(r.names).toHaveLength(1);
    expect(r.etfs).toEqual([]);
    expect(r.active).toBeNull();
    expect(r.total).toBeCloseTo(1, 12);
  });

  it("marks a list with a real gap as partial (DRAM's swap on an unnamed stock)", () => {
    const r = buildLookthrough({ positions: [{ ticker: "DRAM", name: "Roundhill Memory", weight: 0.02, sector: "information_technology" }], cash: 0.98, lists: [list("DRAM", "roundhill", [["MU", 26.79], ["005930.KS", 24.89], ["000660.KS", 43.17]])] });
    expect(r.etfs[0].status).toBe("partial");
    expect(r.etfs[0].coverage).toBeCloseTo(0.9485, 12);
    expect(r.notLookedThrough.byEtf[0].weight).toBeCloseTo(0.02 * 0.0515, 12);
  });

  it("scales a list that adds to more than 100% back to the ETF", () => {
    const r = buildLookthrough({ positions: [{ ticker: "E", name: "E", weight: 0.1, sector: null }], cash: 0.9, lists: [list("E", "ssga", [["A", 60], ["B", 60]])] });
    expect(r.names.map((n) => n.total)).toEqual([0.05, 0.05]);
    expect(r.notLookedThrough.total).toBe(0);
  });
});

describe("activeWeights", () => {
  const names = (rows: [string, number][]) => rows.map(([key, total]) => ({ key, symbols: [key], name: key, sector: null, total, direct: total, viaEtfs: [], overlap: false }));
  const bench = (rows: [string, number][]) => list("SPY", "ssga", rows);

  it("is 0 for an index copy and 1 for no common names", () => {
    expect(activeWeights(names([["A", 0.6], ["B", 0.4]]), bench([["A", 60], ["B", 40]]), 0).activeShare).toBeCloseTo(0, 12);
    expect(activeWeights(names([["A", 1]]), bench([["B", 100]]), 0).activeShare).toBeCloseTo(1, 12);
  });

  it("is ½Σ|w_p − w_b| with each side scaled to its invested weight", () => {
    // Fund: A 45%, B 45%, cash 10% → A 0.5, B 0.5 invested. Bench: A 50, C 50. ½(0 + 0.5 + 0.5) = 0.5.
    const a = activeWeights(names([["A", 0.45], ["B", 0.45]]), bench([["A", 50], ["C", 50]]), 0.1);
    expect(a.activeShare).toBeCloseTo(0.5, 12);
    expect(a.excluded).toBe(0.1);
    expect(a.overlapWithBenchmark).toBeCloseTo(0.45, 12);
    // Active weights themselves stay in NAV terms: A is 45% vs 50%.
    expect(a.rows.find((r) => r.key === "A")!.active).toBeCloseTo(-0.05, 12);
  });
});

describe("buildSectorResolver", () => {
  it("prefers the Fund's own classification, then sector SPDR membership, then the issuer's label", () => {
    const resolve = buildSectorResolver({
      direct: new Map([["NVDA", "information_technology"]]),
      lists: [list("XLK", "ssga", [["NVDA", 15], ["MSFT", 12]]), list("RING", "ishares", [["NEM", 16, "materials"], ["MSFT", 1, "materials"]])],
      sectorEtfs: { XLK: "information_technology" },
    });
    expect(resolve("NVDA")).toBe("information_technology");
    expect(resolve("MSFT")).toBe("information_technology");
    expect(resolve("NEM")).toBe("materials");
    expect(resolve("UNKNOWN")).toBeNull();
  });
});
