import { describe, expect, it } from "vitest";
import { fmtPct } from "@/lib/format";
import { niceScale } from "./ticks";

describe("niceScale", () => {
  it("puts three or four round ticks inside the data, with a domain that hugs it", () => {
    // META over a year, with the S&P 500 rebased to its first close: a covering axis would run $400 to $1,000.
    expect(niceScale(521.4, 868.9)).toEqual({ ticks: [600, 700, 800], domain: [521.4, 868.9], digits: 0 });
    // A return chart that dips just below 0%: 0% stays a tick and the plot isn't stretched to (25%).
    expect(niceScale(-0.5, 43)).toEqual({ ticks: [0, 20, 40], domain: [-0.5, 43], digits: 0 });
    // A drawdown: 0% on the top edge.
    expect(niceScale(-1.4, 0)).toEqual({ ticks: [-1, -0.5, 0], domain: [-1.4, 0], digits: 1 });
  });

  it("lets a tick sit a little past the data when none fits inside", () => {
    // Steps of 0.5 give five ticks inside and steps of 1 only two: 0 and 3 sit just past the data.
    expect(niceScale(0.05, 2.9)).toEqual({ ticks: [0, 1, 2, 3], domain: [0, 3], digits: 0 });
  });

  it("cover: ticks around the data, domain from the first to the last", () => {
    expect(niceScale(-1.9, 0, 4, { fit: "cover" })).toEqual({ ticks: [-2, -1, 0], domain: [-2, 0], digits: 0 });
    expect(niceScale(0, 0.55, 4, { fit: "cover" })).toEqual({ ticks: [0, 0.2, 0.4, 0.6], domain: [0, 0.6], digits: 1 });
  });

  it("gives a 2.5 step one more decimal", () => {
    const s = niceScale(0, 0.7, 4, { fit: "cover" })!;
    expect(s.ticks).toEqual([0, 0.25, 0.5, 0.75]);
    expect(s.digits).toBe(2);
  });

  it("three or four ticks, the data inside the domain, and no two labels alike, across many ranges", () => {
    for (const fit of ["inner", "cover"] as const) {
      for (let lo = -40; lo < 2000; lo = lo < 5 ? lo + 0.37 : lo * 1.37) {
        for (const width of [0.03, 0.2, 0.4, 1.3, 2, 3, 7.5, 19, 41, 64, 97, 410]) {
          const s = niceScale(lo, lo + width, 4, { fit })!;
          expect(s.ticks.length).toBeGreaterThanOrEqual(fit === "inner" ? 3 : 2);
          expect(s.ticks.length).toBeLessThanOrEqual(4);
          expect(s.domain[0]).toBeLessThanOrEqual(lo + 1e-9);
          expect(s.domain[1]).toBeGreaterThanOrEqual(lo + width - 1e-9);
          // Inner: never more than half the plot spent on empty space.
          if (fit === "inner") expect(s.domain[1] - s.domain[0]).toBeLessThan(width * 2);
          const labels = s.ticks.map((t) => fmtPct(t, s.digits));
          expect(new Set(labels).size).toBe(labels.length);
        }
      }
    }
  });

  it("handles a flat line and bad input", () => {
    expect(niceScale(100, 100)!.ticks.length).toBeGreaterThanOrEqual(2);
    expect(niceScale(0, 0)!.ticks).toContain(0);
    expect(niceScale(Number.NaN, 1)).toBeNull();
  });

  it("does not print negative zero", () => {
    expect(Object.is(niceScale(-1.2, 0)!.ticks.at(-1), 0)).toBe(true);
    expect(Object.is(niceScale(-1.2, 0, 4, { fit: "cover" })!.ticks.at(-1), 0)).toBe(true);
  });
});
