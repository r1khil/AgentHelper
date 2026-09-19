import { describe, expect, it } from "vitest";
import { availablePeriods } from "./periods";

describe("attribution range availability", () => {
  it("only offers all history before a second valuation exists", () => {
    expect(
      availablePeriods({ inception: "2026-09-18", latest: "2026-09-18" }),
    ).toEqual(["itd"]);
  });
  it("offers a complete daily period without falsely advertising a week or year", () => {
    expect(
      availablePeriods({ inception: "2026-09-17", latest: "2026-09-18" }),
    ).toEqual(["1d", "itd"]);
  });
  it("offers all presets with enough history", () => {
    expect(
      availablePeriods({ inception: "2025-01-02", latest: "2026-09-18" }),
    ).toEqual(["1d", "7d", "mtd", "qtd", "ytd", "1y", "itd"]);
  });
});
