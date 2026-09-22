import { describe, expect, it } from "vitest";
import { buildCloseLookup, rankWeeklyMovers, type PerformerHolding } from "./performers";

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
