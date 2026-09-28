import { describe, expect, it } from "vitest";
import { fixed, fmtAccounting, fmtCompact, fmtCurrency, fmtMoney, fmtPct } from "./format";

describe("negative zero", () => {
  it("fixed drops the minus from a value that rounds to zero", () => {
    expect(fixed(-0.004, 2)).toBe("0.00");
    expect(fixed(-0.4, 0)).toBe("0");
    expect(fixed(-0, 1)).toBe("0.0");
    expect(fixed(-0.05, 1)).toBe("-0.1");
    expect(fixed(1.234, 2)).toBe("1.23");
  });

  it("fmtMoney and fmtCompact never print -0", () => {
    expect(fmtMoney(-0.001)).toBe("0.00");
    expect(fmtMoney(-0)).toBe("0.00");
    expect(fmtMoney(-1234.5)).toBe("-1,234.50");
    expect(fmtCompact(-0.01)).toBe("0");
    expect(fmtCompact(-1500)).toBe("-1.5K");
  });

  it("fmtPct shows neither -0.00% nor +0.00%", () => {
    expect(fmtPct(-0.001)).toBe("0.00%");
    expect(fmtPct(0.001)).toBe("0.00%");
    expect(fmtPct(0.5)).toBe("+0.50%");
    expect(fmtPct(-0.5)).toBe("-0.50%");
  });
});

describe("fmtCurrency", () => {
  it("uses $ for USD and the ISO code for any other currency", () => {
    expect(fmtCurrency(4.4614, "USD")).toBe("$4.46");
    expect(fmtCurrency("1454935426950.00", "TWD", { scale: 1e9, suffix: "B" })).toBe("TWD 1,454.94B");
    expect(fmtCurrency(28.96, "twd")).toBe("TWD 28.96");
  });

  it("shows no symbol rather than a wrong $ when the currency is unknown", () => {
    expect(fmtCurrency(1454.94, null)).toBe("1,454.94");
    expect(fmtCurrency(1454.94, undefined)).toBe("1,454.94");
  });

  it("puts negatives in parentheses, symbol inside, and never shows a zero as negative", () => {
    expect(fmtCurrency(-0.1465, "USD")).toBe("($0.15)");
    expect(fmtCurrency(-2.5, "EUR")).toBe("(EUR 2.50)");
    expect(fmtCurrency(-0.001, "USD")).toBe("$0.00");
    expect(fmtCurrency(-0.004, "TWD", { scale: 1e9, suffix: "B" })).toBe("TWD 0.00B");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtCurrency(null, "USD")).toBe("—");
    expect(fmtCurrency("", "USD")).toBe("—");
    expect(fmtCurrency("n/a", "USD")).toBe("—");
  });
});

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
