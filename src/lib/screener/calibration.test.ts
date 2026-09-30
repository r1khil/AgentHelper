import { describe, expect, it } from "vitest";
import { calibrate, checkKillCriteria, cohortOf, horizonEnd, parseCondition, scoreOutcome, type ScoredPitch } from "./calibration";

describe("cohortOf", () => {
  it("names the semester of a pitch", () => {
    expect(cohortOf("2026-09-29")).toBe("Fall 2026");
    expect(cohortOf("2027-02-01")).toBe("Spring 2027");
    expect(cohortOf("2027-06-15")).toBe("Summer 2027");
  });
});

describe("parseCondition", () => {
  it("reads metric, operator and threshold from plain words", () => {
    expect(parseCondition("gross margin < 40%")).toEqual({ text: "gross margin < 40%", metric: "gross_margin", op: "<", threshold: 40 });
    expect(parseCondition("FY27 operating margin ≥ 18%")).toMatchObject({ metric: "operating_margin", op: ">=", threshold: 18 });
    expect(parseCondition("Revenue growth <= -5%")).toMatchObject({ metric: "revenue_growth", op: "<=", threshold: -5 });
    expect(parseCondition("share price < $80")).toMatchObject({ metric: "price", op: "<", threshold: 80 });
  });

  it("keeps only the text when it can't be checked in code", () => {
    expect(parseCondition("Management leaves")).toEqual({ text: "Management leaves" });
    expect(parseCondition("churn above 5%")).toEqual({ text: "churn above 5%" });
  });
});

describe("checkKillCriteria", () => {
  it("trips a criterion whose condition holds and leaves prose ones alone", () => {
    const out = checkKillCriteria([parseCondition("gross margin < 40%"), parseCondition("CEO leaves"), parseCondition("net margin < 5%")], { gross_margin: { value: 38.2, asOf: "2026-06-30" } }, "2026-09-29");
    expect(out[0]).toMatchObject({ tripped: true, lastChecked: "2026-09-29" });
    expect(out[1]).toEqual({ text: "CEO leaves" });
    expect(out[2].tripped).toBeUndefined();
  });
});

describe("scoreOutcome", () => {
  it("counts a hit when the price reaches the target within the horizon, and measures the estimate against the end price", () => {
    const o = scoreOutcome({ priceTarget: 120, intrinsicValue: 130, priceAtPitch: 100 }, [{ date: "a", close: 110 }, { date: "b", close: 121 }, { date: "c", close: 104 }], true, "2027-03-01");
    expect(o.hitTarget).toBe(true);
    expect(o.priceAtHorizon).toBe(104);
    expect(o.valueGapPct).toBeCloseTo(130 / 104 - 1, 6);
  });

  it("reads a target below the pitch price as a short thesis", () => {
    expect(scoreOutcome({ priceTarget: 80, intrinsicValue: 75, priceAtPitch: 100 }, [{ date: "a", close: 85 }], null, "x").hitTarget).toBe(false);
  });

  it("has no hit or gap without prices", () => {
    expect(scoreOutcome({ priceTarget: 1, intrinsicValue: 1, priceAtPitch: 1 }, [], null, "x")).toMatchObject({ hitTarget: null, valueGapPct: null });
  });
});

describe("calibrate", () => {
  const p = (teamId: string, cohort: string, confidence: number, hit: boolean | null, gap: number | null, met: boolean | null = null): ScoredPitch => ({
    teamId,
    cohort,
    confidence,
    intrinsicValue: 1,
    outcome: { scoredAt: "x", priceAtHorizon: 1, hitTarget: hit, keyMetricMet: met, valueGapPct: gap },
  });

  it("scores by team and cohort with sample sizes, ignoring unresolved pitches", () => {
    const pitches = [p("t1", "Fall 2026", 70, true, 0.1, true), p("t1", "Fall 2026", 70, false, 0.3), p("t2", "Spring 2027", 90, true, -0.1), { ...p("t2", "Spring 2027", 50, null, null), outcome: null }];
    const { byTeam, byCohort, overall } = calibrate(pitches);
    const t1 = byTeam.find((r) => r.key === "t1")!;
    expect(t1).toMatchObject({ n: 2, hitRate: 0.5, thesisAccuracy: 1, thesisN: 1 });
    expect(t1.optimism).toBeCloseTo(0.2);
    expect(byCohort.find((r) => r.key === "Spring 2027")).toMatchObject({ n: 1, hitRate: 1 });
    expect(overall.n).toBe(3);
    expect(overall.byConfidence.find((c) => c.confidence === 70)).toMatchObject({ n: 2, hitRate: 0.5 });
  });
});

describe("horizonEnd", () => {
  it("adds months and clamps the day to the month", () => {
    expect(horizonEnd("2026-09-29", 12)).toBe("2027-09-29");
    expect(horizonEnd("2027-01-31", 1)).toBe("2027-02-28");
  });
});
