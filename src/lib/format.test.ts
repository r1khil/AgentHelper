import { describe, expect, it } from "vitest";
import { fmtAccounting } from "./format";

describe("fmtAccounting", () => {
  it("wraps negatives in parentheses with the unit inside", () => {
    expect(fmtAccounting(-0.29, 2, "%")).toBe("(0.29%)");
    expect(fmtAccounting(-26, 0, " bps")).toBe("(26 bps)");
  });

  it("drops the plus sign on positives", () => {
    expect(fmtAccounting(4.5, 2, "%")).toBe("4.50%");
    expect(fmtAccounting(18, 0)).toBe("18");
  });

  it("never shows a negative zero", () => {
    expect(fmtAccounting(-0.001, 2, "%")).toBe("0.00%");
    expect(fmtAccounting(-0.4, 0, " bps")).toBe("0 bps");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtAccounting(null)).toBe("—");
    expect(fmtAccounting(Number.NaN)).toBe("—");
  });
});
