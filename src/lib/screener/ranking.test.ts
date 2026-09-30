import { describe, expect, it } from "vitest";
import { METRIC_KEYS, type MetricKey, type ScreenResult } from "./metrics";
import { eligible, metricCoverage, percentiles, rankedMetrics, rankScreen, trackComposites, type RankInput } from "./ranking";

const all = (v: boolean) => Object.fromEntries(METRIC_KEYS.map((k) => [k, v])) as Record<MetricKey, boolean>;
function result(m: Partial<Record<MetricKey, number | null>>, over: Partial<ScreenResult> = {}): ScreenResult {
  const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, m[k] ?? null])) as Record<MetricKey, number | null>;
  return { metrics, distress: false, garpEligible: false, resolved: all(true), ...over };
}
const full = Object.fromEntries(METRIC_KEYS.map((k) => [k, 1]));

describe("percentiles", () => {
  it("ranks worst 0 to best 1, respecting direction, ties sharing", () => {
    expect(percentiles([10, 20, 30, null], false)).toEqual([0, 0.5, 1, null]);
    expect(percentiles([10, 20, 30], true)).toEqual([1, 0.5, 0]);
    expect(percentiles([5, 5, 9], false)).toEqual([0.25, 0.25, 1]);
    expect(percentiles([7], false)).toEqual([0.5]);
  });
});

describe("coverage", () => {
  it("counts resolved inputs and drops metrics under 80% from the ranking", () => {
    const rs = [result({}), result({}), result({}), result({}, { resolved: { ...all(true), fcfYield: false } }), result({}, { resolved: { ...all(true), fcfYield: false } })];
    const cov = metricCoverage(rs);
    expect(cov.fcfYield).toBe(0.6);
    expect(cov.evEbit).toBe(1);
    expect(rankedMetrics(cov, "value")).not.toContain("fcfYield");
    expect(rankedMetrics(cov, "value")).toContain("roic");
    expect(rankedMetrics(cov, "garp")).toEqual(["roic", "roicTrend", "altmanZ", "shareChange3y", "netDebtEbitda", "epsGrowth3y"]);
  });
});

describe("filters", () => {
  it("keeps distress, losses and negative ROIC out of the value track", () => {
    expect(eligible(result({ evEbit: 8, roic: 10 }), "value")).toBe(true);
    expect(eligible(result({ evEbit: 8, roic: 10 }, { distress: true }), "value")).toBe(false);
    expect(eligible(result({ evEbit: null, roic: 10 }), "value")).toBe(false);
    expect(eligible(result({ evEbit: 8, roic: -2 }), "value")).toBe(false);
  });
  it("needs stable ROIC and EPS growth for GARP", () => {
    expect(eligible(result({ epsGrowth3y: 12 }, { garpEligible: true }), "garp")).toBe(true);
    expect(eligible(result({ epsGrowth3y: 12 }), "garp")).toBe(false);
    expect(eligible(result({ epsGrowth3y: null }, { garpEligible: true }), "garp")).toBe(false);
  });
});

describe("trackComposites", () => {
  it("averages percentiles; cheaper and better scores higher", () => {
    const rows: RankInput[] = [
      { key: "cheap", ticker: "A", teamId: null, result: result({ evEbit: 6, fcfYield: 10, roic: 20, altmanZ: 5 }) },
      { key: "mid", ticker: "B", teamId: null, result: result({ evEbit: 12, fcfYield: 5, roic: 15, altmanZ: 3 }) },
      { key: "dear", ticker: "C", teamId: null, result: result({ evEbit: 30, fcfYield: 1, roic: 5, altmanZ: 2 }) },
    ];
    const cov = { ...full, evEbitVsMedian: 0, piotroski: 0, roicTrend: 0, shareChange3y: 0, netDebtEbitda: 0 };
    const c = trackComposites(rows, "value", cov);
    expect(c.get("cheap")).toBe(1);
    expect(c.get("mid")).toBe(0.5);
    expect(c.get("dear")).toBe(0);
  });
  it("skips names with fewer than 60% of the track's metrics", () => {
    const rows: RankInput[] = [
      { key: "a", ticker: "A", teamId: null, result: result({ evEbit: 6, roic: 20 }) },
      { key: "b", ticker: "B", teamId: null, result: result({ evEbit: 8, roic: 10, fcfYield: 3, altmanZ: 3, piotroski: 5, netDebtEbitda: 1 }) },
    ];
    const c = trackComposites(rows, "value", full);
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
  });
});

describe("rankScreen", () => {
  it("keeps the top 100 plus each team's top five, with team ranks", () => {
    const rows: RankInput[] = Array.from({ length: 130 }, (_, i) => ({
      key: `k${i}`,
      ticker: `T${String(i).padStart(3, "0")}`,
      // Team "small" owns the five worst names; they still make the list.
      teamId: i >= 125 ? "small" : "big",
      result: result({ evEbit: 5 + i, fcfYield: 20 - i / 10, roic: 30 - i / 10, altmanZ: 5, piotroski: 7, netDebtEbitda: 1 }),
    }));
    const out = rankScreen(rows, full);
    expect(out).toHaveLength(105);
    expect(out[0]).toMatchObject({ key: "k0", rank: 1, teamRank: 1, track: "value" });
    const small = out.filter((r) => r.key >= "k125" && Number(r.key.slice(1)) >= 125);
    expect(small.map((r) => r.teamRank)).toEqual([1, 2, 3, 4, 5]);
    expect(small[0].rank).toBe(126);
  });
  it("puts a name on the track where it scores higher", () => {
    const rows: RankInput[] = [
      { key: "g", ticker: "G", teamId: null, result: result({ evEbit: 30, fcfYield: 1, roic: 40, altmanZ: 6, piotroski: 8, epsGrowth3y: 25, roicTrend: 1, netDebtEbitda: 0 }, { garpEligible: true }) },
      { key: "v", ticker: "V", teamId: null, result: result({ evEbit: 6, fcfYield: 12, roic: 15, altmanZ: 3, piotroski: 7, epsGrowth3y: 5, roicTrend: 0, netDebtEbitda: 1 }, { garpEligible: true }) },
    ];
    const cov = { ...full, evEbitVsMedian: 0, shareChange3y: 0 };
    const out = rankScreen(rows, cov);
    expect(out.find((r) => r.key === "g")!.track).toBe("garp");
    expect(out.find((r) => r.key === "v")!.track).toBe("value");
  });
});
