import { describe, expect, it } from "vitest";
import { buildCloseLookup, chooseMovers, rankWeeklyMovers, type PerformerHolding } from "./performers";

const START = "2026-09-11";
const END = "2026-09-18";

function closes(rows: [string, number, number][]) {
  return buildCloseLookup(
    rows.flatMap(([ticker, from, to]) => [
      { ticker, sessionDate: START, close: from },
      { ticker, sessionDate: END, close: to },
    ]),
  );
}

const holdings: PerformerHolding[] = [
  { ticker: "ANAB", name: "AnaptysBio" },
  { ticker: "TCOM", name: "Trip.com" },
  { ticker: "FPS", name: "Fair Isaac" },
  { ticker: "LEN", name: "Lennar" },
  { ticker: "AXP", name: "American Express" },
];

describe("rankWeeklyMovers", () => {
  it("ranks the best and worst Monday-to-Friday price returns", () => {
    const r = rankWeeklyMovers({
      holdings,
      closes: closes([
        ["ANAB", 100, 110],
        ["TCOM", 100, 105],
        ["FPS", 100, 101],
        ["LEN", 100, 95],
        ["AXP", 100, 90],
      ]),
      start: START,
      end: END,
    });
    expect(r.top.map((p) => p.ticker)).toEqual(["ANAB", "TCOM", "FPS"]);
    expect(r.worst.map((p) => p.ticker)).toEqual(["AXP", "LEN", "FPS"]);
    expect(r.top[0].pct).toBeCloseTo(10, 6);
    expect(r.worst[0].pct).toBeCloseTo(-10, 6);
    expect(r.window).toEqual({ start: START, end: END });
    expect(r.missing).toEqual([]);
  });

  it("breaks ties by ticker so a rebuild is stable", () => {
    const r = rankWeeklyMovers({
      holdings: [
        { ticker: "ZZZ", name: "Zeta" },
        { ticker: "AAA", name: "Alpha" },
        { ticker: "MMM", name: "Mid" },
      ],
      closes: closes([
        ["ZZZ", 100, 105],
        ["AAA", 100, 105],
        ["MMM", 100, 105],
      ]),
      start: START,
      end: END,
    });
    expect(r.top.map((p) => p.ticker)).toEqual(["AAA", "MMM", "ZZZ"]);
    expect(r.worst.map((p) => p.ticker)).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("reports holdings with a missing close instead of ranking them at zero", () => {
    const lookup = closes([["ANAB", 100, 110]]);
    lookup.set("TCOM|2026-09-11", 100); // no Friday-end close
    const r = rankWeeklyMovers({ holdings: [holdings[0], holdings[1], holdings[2]], closes: lookup, start: START, end: END });
    expect(r.top.map((p) => p.ticker)).toEqual(["ANAB"]);
    expect(r.missing).toEqual(["FPS", "TCOM"]);
  });

  it("returns what it has when there are fewer than three usable holdings, or none", () => {
    const r = rankWeeklyMovers({ holdings: [holdings[0]], closes: closes([["ANAB", 100, 110]]), start: START, end: END });
    expect(r.top).toHaveLength(1);
    expect(r.worst).toHaveLength(1);
    const empty = rankWeeklyMovers({ holdings: [], closes: new Map(), start: START, end: END });
    expect(empty).toEqual({ top: [], worst: [], missing: [], window: { start: START, end: END } });
  });

  it("skips a zero starting close rather than dividing by it", () => {
    const r = rankWeeklyMovers({ holdings: [holdings[0]], closes: closes([["ANAB", 0, 110]]), start: START, end: END });
    expect(r.top).toEqual([]);
    expect(r.missing).toEqual(["ANAB"]);
  });
});

describe("chooseMovers", () => {
  const window = { start: START, end: END };
  const names = new Map([["AVGO", "Broadcom Inc"], ["CI", "The Cigna Group"]]);
  const scored = (rows: [string, number][]) => rows.map(([ticker, pct]) => ({ ticker, name: ticker, pct }));
  const closes = { scored: scored([["AVGO", 4.4], ["TSM", 3.1], ["SOXX", 7.2], ["CI", -5.1], ["AXP", -5.0], ["EVR", -4.7]]), missing: [] };

  it("takes the sheet's % 1 Week when it agrees with the closes, with the app's names", () => {
    const sheet = [["AVGO", 4.41], ["TSM", 3.08], ["SOXX", 7.2], ["CI", -5.1], ["AXP", -5.02], ["EVR", -4.7], ["NEW", 9]] as const;
    const r = chooseMovers({ sheet: sheet.map(([ticker, pct]) => ({ ticker, pct })), readAt: "2026-09-27T13:00:00Z", closes, names, window });
    expect(r.source).toBe("sheet");
    expect(r.readAt).toBe("2026-09-27T13:00:00Z");
    expect(r.top.map((p) => [p.ticker, p.pct])).toEqual([["NEW", 9], ["SOXX", 7.2], ["AVGO", 4.41]]);
    expect(r.top[2].name).toBe("Broadcom Inc");
    expect(r.worst[0]).toEqual({ ticker: "CI", name: "The Cigna Group", pct: -5.1 });
    expect(r.checks).toEqual([]);
  });

  it("ranks a holding the sheet leaves blank by its closes, and says so", () => {
    const sheet = [["AVGO", 4.41], ["TSM", 3.08], ["CI", -5.1], ["AXP", -5.02], ["EVR", -4.7]] as const;
    const r = chooseMovers({ sheet: sheet.map(([ticker, pct]) => ({ ticker, pct })), sheetBlank: ["SOXX", "XLK"], closes, names, window });
    expect(r.source).toBe("sheet");
    expect(r.top.map((p) => [p.ticker, p.pct])).toEqual([["SOXX", 7.2], ["AVGO", 4.41], ["TSM", 3.08]]);
    expect(r.checks).toEqual([
      `SOXX has no "% 1 Week" in the PT sheet, so its week comes from the app's closes.`,
      `XLK has no "% 1 Week" in the PT sheet and no closes in the app, so it's left out of the top and worst 3.`,
    ]);
  });

  it("names a holding the two disagree on by more than half a point", () => {
    const sheet = [["AVGO", 5.4], ["TSM", 3.1], ["SOXX", 7.2], ["CI", -5.1], ["AXP", -5.0], ["EVR", -4.7]] as const;
    const r = chooseMovers({ sheet: sheet.map(([ticker, pct]) => ({ ticker, pct })), closes, names, window });
    expect(r.source).toBe("sheet");
    expect(r.checks).toEqual(["AVGO: the sheet says 5.4% for the week, the app's closes say 4.4%."]);
  });

  it("falls back to the closes when the sheet's window has moved on", () => {
    const sheet = [["AVGO", 1], ["TSM", 2], ["SOXX", 3], ["CI", -1], ["AXP", -2], ["EVR", -4.7]] as const;
    const r = chooseMovers({ sheet: sheet.map(([ticker, pct]) => ({ ticker, pct })), closes, names, window });
    expect(r.source).toBe("closes");
    expect(r.top.map((p) => p.ticker)).toEqual(["SOXX", "AVGO", "TSM"]);
    expect(r.checks?.[0]).toMatch(/agreed for only 1 of 6 holdings/);
  });

  it("uses the closes, and says why, when the sheet wasn't read", () => {
    const r = chooseMovers({ sheet: null, sheetProblem: "Google Drive is not configured here", closes, names, window });
    expect(r.source).toBe("closes");
    expect(r.checks).toEqual([`Top and worst 3 use the app's closes: the PT sheet's "% 1 Week" wasn't read (Google Drive is not configured here).`]);
  });

  it("trusts the sheet, and says it wasn't cross-checked, when the app has too few closes", () => {
    const r = chooseMovers({ sheet: [{ ticker: "AVGO", pct: 9 }, { ticker: "X", pct: 1 }], closes: { scored: scored([["AVGO", 1]]), missing: ["X"] }, names, window });
    expect(r.source).toBe("sheet");
    expect(r.top[0].pct).toBe(9);
    expect(r.checks?.[0]).toMatch(/only 1 holding, so they weren't cross-checked/);
  });
});
