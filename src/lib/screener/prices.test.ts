import { describe, expect, it } from "vitest";
import { monthEndCloses, priceAtYearEnd, yahooSymbol } from "./prices";

describe("monthEndCloses", () => {
  it("keeps the last close of each month and drops bad values", () => {
    const out = monthEndCloses([
      { date: "2025-01-30", close: 10 },
      { date: "2025-01-31", close: 11 },
      { date: "2025-02-27", close: 12 },
      { date: "2025-02-28", close: Number.NaN },
      { date: "2025-03-03", close: 13 },
    ]);
    expect(out).toEqual({ "2025-01": 11, "2025-02": 12, "2025-03": 13 });
  });
});

describe("priceAtYearEnd", () => {
  const closes = { "2024-12": 100, "2025-09": 120 };
  it("uses the year-end month, else the month before", () => {
    expect(priceAtYearEnd(closes, "2024-12-31")).toBe(100);
    expect(priceAtYearEnd(closes, "2025-10-02")).toBe(120);
    expect(priceAtYearEnd(closes, "2025-01-02")).toBe(100);
    expect(priceAtYearEnd(closes, "2023-06-30")).toBeNull();
    expect(priceAtYearEnd(null, "2024-12-31")).toBeNull();
  });
});

describe("yahooSymbol", () => {
  it("uses dashes for share classes", () => {
    expect(yahooSymbol("brk.b")).toBe("BRK-B");
    expect(yahooSymbol("BF-B")).toBe("BF-B");
  });
});
