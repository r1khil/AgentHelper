import { describe, expect, it } from "vitest";
import { buildExposure } from "./exposure";
import type { EtfList } from "./lookthrough";
import { lookthroughCsvRows } from "./lookthrough-csv";
import { composeBenchmark, lookthroughFromRisk, STALE_AFTER_DAYS } from "./lookthrough-report";
import { PREVIEW_ETFS, previewLookthrough, previewReport } from "./preview";
import { summarizeLookthrough } from "./summary";

const list = (etf: string, rows: [string, number][], asOf = "2026-09-23"): EtfList => ({ etf, asOf, source: "ssga", constituents: rows.map(([symbol, weight]) => ({ symbol, name: symbol, weight, sector: null })) });

describe("composeBenchmark", () => {
  it("weights each ETF's holdings by its benchmark weight and merges shared names", () => {
    const b = composeBenchmark("XLK + XLC", [
      { list: list("XLK", [["NVDA", 60], ["MSFT", 40]]), weight: 0.75 },
      { list: list("XLC", [["META", 50], ["NVDA", 50]], "2026-09-20"), weight: 0.25 },
    ]);
    expect(b.etf).toBe("XLK + XLC");
    expect(b.asOf).toBe("2026-09-20"); // The oldest leg.
    expect(Object.fromEntries(b.constituents.map((c) => [c.symbol, c.weight]))).toEqual({ NVDA: 57.5, MSFT: 30, META: 12.5 });
  });
});

describe("lookthroughFromRisk (preview data)", () => {
  const fund = previewReport("1y");
  const state = previewLookthrough(fund);
  if (state.state !== "ok") throw new Error("preview look-through should be ok");
  const lt = state.report;

  it("looks through the preview's stand-in ETFs and adds back to the book", () => {
    expect(state.heldEtfs.sort()).toEqual(Object.keys(PREVIEW_ETFS).sort());
    expect(lt.total).toBeCloseTo(1, 10);
    const status = Object.fromEntries(lt.etfs.map((e) => [e.etf, e.status]));
    expect(status).toEqual({ CHRL: "full", GOLF: "top-holdings", ECHO: "partial", NOVR: "none" });
    expect(state.stale).toEqual(["ECHO"]);
    // ALFA is held directly and inside CHRL and ECHO.
    const alfa = lt.names.find((n) => n.key === "ALFA")!;
    expect(alfa.overlap).toBe(true);
    expect(alfa.viaEtfs.map((v) => v.via).sort()).toEqual(["CHRL", "ECHO"]);
  });

  it("compares the Fund with SPY's holdings", () => {
    expect(state.benchmarkLabel).toBe("SPY");
    expect(lt.active!.activeShare).toBeGreaterThan(0);
    expect(lt.active!.activeShare).toBeLessThan(1);
    expect(lt.active!.benchmark.coverage).toBeCloseTo(0.998, 5);
  });

  it("uses the team's sector SPDRs at its sector weights as a team's benchmark", () => {
    const team = previewReport("1y", { team: true });
    const t = previewLookthrough(team);
    if (t.state !== "ok") throw new Error("expected ok");
    expect(t.benchmarkLabel).toBe("XLK + XLC");
    expect(t.report.cash).toBe(0);
    expect(t.report.total).toBeCloseTo(1, 10);
    const benchTotal = t.report.active!.rows.reduce((s, r) => s + r.benchmark, 0);
    expect(benchTotal).toBeCloseTo(0.998, 6);
  });

  it("says why there are no stock-level weights when the benchmark's lists are missing", () => {
    const noSpy = lookthroughFromRisk(fund, [list("CHRL", [["ALFA", 50], ["ZZZ", 50]])], { isEtf: (t) => t === "CHRL" });
    expect(noSpy).toMatchObject({ state: "ok", benchmarkMissing: "SPY's holdings aren't stored yet." });
    const none = lookthroughFromRisk(fund, [], { isEtf: (t) => t === "CHRL" });
    expect(none).toEqual({ state: "unavailable", reason: "no-lists", heldEtfs: ["CHRL"] });
  });

  it("flags a list more than two weeks older than the positions as stale", () => {
    const old = new Date(Date.parse(`${fund.asOf}T00:00:00Z`) - (STALE_AFTER_DAYS + 1) * 864e5).toISOString().slice(0, 10);
    const s = lookthroughFromRisk(fund, [list("CHRL", [["ALFA", 100]], old)], { isEtf: (t) => t === "CHRL" });
    expect(s.state === "ok" && s.stale).toEqual(["CHRL"]);
    expect(s.state === "ok" && s.benchmarkStale).toBe(false);
  });

  it("flags a stale benchmark list too", () => {
    const old = new Date(Date.parse(`${fund.asOf}T00:00:00Z`) - (STALE_AFTER_DAYS + 1) * 864e5).toISOString().slice(0, 10);
    const s = lookthroughFromRisk(fund, [list("CHRL", [["ALFA", 100]]), list("SPY", [["ALFA", 100]], old)], { isEtf: (t) => t === "CHRL" });
    expect(s.state === "ok" && s.benchmarkStale).toBe(true);
  });

  it("gives the sector table weights through the ETFs, with the same benchmark and balanced actives", () => {
    const asHeld = buildExposure(fund);
    const through = buildExposure(fund, { through: lt });
    expect(asHeld.throughEtfs).toBe(false);
    expect(through.throughEtfs).toBe(true);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(through.sectors.map((s) => s.weight))).toBeCloseTo(1, 10);
    expect(through.overweight! + through.underweight!).toBeCloseTo(0, 10);
    const it = (x: typeof asHeld) => x.sectors.find((s) => s.key === "information_technology")!;
    expect(it(through).benchWeight).toBe(it(asHeld).benchWeight);
    // GOLF (a financials ETF, only its top 10 known) keeps its uncovered 75.5% in Financials, marked assumed.
    const fin = lt.sectors.find((s) => s.key === "financials")!;
    expect(fin.assumed).toBeGreaterThan(0);
  });

  it("writes a CSV whose company, not-looked-through and cash rows add to 100%", () => {
    const rows = lookthroughCsvRows(fund, state);
    const width = rows[0].length;
    expect(rows.every((r) => r.length === width)).toBe(true);
    const book = rows.filter((r) => r[0] === "company" || r[0] === "not looked through" || r[0] === "cash").reduce((s, r) => s + Number(r[4]), 0);
    expect(book).toBeCloseTo(1, 10);
    // Benchmark weights on company rows (benchmark-only names included) cover the whole benchmark list.
    const bench = rows.filter((r) => r[0] === "company").reduce((s, r) => s + Number(r[7] || 0), 0);
    expect(bench).toBeCloseTo(lt.active!.benchmark.coverage, 10);
    expect(rows.find((r) => r[0] === "active share")![4]).toBe(lt.active!.activeShare);
    expect(lookthroughCsvRows(fund, { state: "unavailable", reason: "no-table", heldEtfs: [] })).toEqual([["note"], ["ETF holdings are not set up yet (migration 0021)."]]);
  });

  it("summarizes for Hoot", () => {
    const s = summarizeLookthrough(state, 5);
    if (!s.etfs || !s.heldBothWays) throw new Error("expected a summary");
    expect(s.etfs.find((e) => e.etf === "ECHO")).toMatchObject({ status: "partial", stale: true });
    expect(s.largestExposures).toHaveLength(5);
    expect(s.heldBothWays.some((line) => line.startsWith("ALFA "))).toBe(true);
    expect(s.stockLevel).toHaveProperty("activeSharePct");
    expect(summarizeLookthrough({ state: "unavailable", reason: "no-lists", heldEtfs: ["KRE"] })).toMatchObject({ heldEtfs: ["KRE"] });
  });
});
