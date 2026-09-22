import { describe, expect, it } from "vitest";
import { parsePeriodKey, periodOptions } from "./periods";

describe("attribution period options", () => {
  it("defaults to the last session", () => {
    expect(parsePeriodKey(undefined)).toBe("1d");
    expect(parsePeriodKey("nonsense")).toBe("1d");
    expect(parsePeriodKey("6m")).toBe("6m");
  });
  it("always offers every preset", () => {
    expect(periodOptions({ inception: "2026-09-18", latest: "2026-09-18" }).map((o) => o.key)).toEqual(["1d", "7d", "1m", "6m", "ytd", "1y", "itd"]);
  });
  it("flags presets that reach back before the ledger", () => {
    const opts = periodOptions({ inception: "2026-09-02", latest: "2026-09-18" });
    expect(opts.filter((o) => o.clamped).map((o) => o.key)).toEqual(["1m", "6m", "ytd", "1y"]);
  });
  it("flags nothing with enough history", () => {
    expect(periodOptions({ inception: "2025-01-02", latest: "2026-09-18" }).some((o) => o.clamped)).toBe(false);
  });
});
