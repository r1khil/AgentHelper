import { describe, expect, it } from "vitest";
import { relativeMovePp, returnPct } from "./returns";
import { isTradingDay, nextTradingDay } from "@/lib/providers/calendar";

describe("relative move", () => {
  it("is the holding's return less the S&P 500's", () => {
    expect(returnPct(105, 100)).toBeCloseTo(5);
    expect(relativeMovePp({ close: 105, prevClose: 100 }, { close: 100.7, prevClose: 100 })).toBeCloseTo(4.3);
  });
});

describe("calendar", () => {
  it("skips weekends and holidays", () => {
    expect(isTradingDay("2026-09-07")).toBe(false); // Labor Day
    expect(isTradingDay("2026-09-05")).toBe(false); // Saturday
    expect(isTradingDay("2026-09-08")).toBe(true);
    expect(nextTradingDay("2026-09-04")).toBe("2026-09-08");
  });
});
