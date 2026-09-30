import { describe, expect, it } from "vitest";
import { addMonths, forwardReturn, forwardReturns, isFirstSaturday, monthStart } from "./screen-schedule";

describe("isFirstSaturday", () => {
  it("is true only on the month's first Saturday", () => {
    expect(isFirstSaturday("2026-10-03")).toBe(true);
    expect(isFirstSaturday("2026-10-10")).toBe(false);
    expect(isFirstSaturday("2026-10-04")).toBe(false);
    expect(isFirstSaturday("2026-08-01")).toBe(true);
    expect(isFirstSaturday("2026-08-08")).toBe(false);
  });
  it("month start and month arithmetic", () => {
    expect(monthStart("2026-10-03")).toBe("2026-10-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-03", 12)).toBe("2027-10-03");
  });
});

describe("forwardReturn", () => {
  const bars = [
    { date: "2026-01-05", close: 100 }, // run date is a Saturday; the base is the next close
    { date: "2026-04-03", close: 110 },
    { date: "2026-04-06", close: 111 },
    { date: "2026-07-06", close: 90 },
  ];
  it("measures from the first close on or after each date, as a fraction", () => {
    expect(forwardReturn(bars, "2026-01-03", 3, "2026-09-01")).toBe(0.1);
    expect(forwardReturn(bars, "2026-01-03", 6, "2026-09-01")).toBe(-0.1);
  });
  it("is null before the horizon arrives or without a later close", () => {
    expect(forwardReturn(bars, "2026-01-03", 12, "2026-09-01")).toBeNull();
    expect(forwardReturn(bars.slice(0, 1), "2026-01-03", 3, "2026-09-01")).toBeNull();
  });
  it("sets each horizon beside the S&P 500", () => {
    const spx = [{ date: "2026-01-05", close: 5000 }, { date: "2026-04-03", close: 5100 }, { date: "2026-07-06", close: 5250 }];
    expect(forwardReturns(bars, spx, "2026-01-03", "2026-09-01")).toEqual({ r3m: 0.1, r6m: -0.1, r12m: null, spx3m: 0.02, spx6m: 0.05, spx12m: null, excess3m: 0.08, excess6m: -0.15, excess12m: null });
  });
});
