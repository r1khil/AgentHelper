import { describe, expect, it } from "vitest";
import { fixed, fmtAccounting, fmtBp, fmtCompact, fmtCurrency, fmtMoney, fmtNumber, fmtPct, fmtUsd, fmtUsdCompact, ppToBp } from "./format";

describe("fixed", () => {
  it("drops the minus from a value that rounds to zero", () => {
    expect(fixed(-0.004, 2)).toBe("0.00");
    expect(fixed(-0.4, 0)).toBe("0");
    expect(fixed(-0, 1)).toBe("0.0");
    expect(fixed(-0.05, 1)).toBe("-0.1");
    expect(fixed(1.234, 2)).toBe("1.23");
  });
});

describe("fmtAccounting, the shared primitive", () => {
  it("wraps negatives in parentheses with the unit inside", () => {
    expect(fmtAccounting(-0.29, 2, "%")).toBe("(0.29%)");
    expect(fmtAccounting(-26, 0, " bp")).toBe("(26 bp)");
  });

  it("gives positives no plus sign", () => {
    expect(fmtAccounting(4.5, 2, "%")).toBe("4.50%");
    expect(fmtAccounting(18, 0)).toBe("18");
  });

  it("never shows a negative zero, including values that round to zero", () => {
    expect(fmtAccounting(0, 2)).toBe("0.00");
    expect(fmtAccounting(-0, 2)).toBe("0.00");
    expect(fmtAccounting(-0.001, 2, "%")).toBe("0.00%");
    expect(fmtAccounting(-0.4, 0, " bp")).toBe("0 bp");
    expect(fmtAccounting(-0.005, 2)).toBe("(0.01)");
  });

  it("rounds half away from zero on the shown digits, the same either side of zero", () => {
    expect(fmtAccounting(1.005, 2)).toBe("1.01");
    expect(fmtAccounting(-1.005, 2)).toBe("(1.01)");
    expect(fmtAccounting(3.05, 1)).toBe("3.1");
  });

  it("groups thousands", () => {
    expect(fmtAccounting(1234567.891, 2)).toBe("1,234,567.89");
    expect(fmtAccounting(-1250, 0, " bp")).toBe("(1,250 bp)");
  });

  it("accepts numeric strings, as Postgres numerics arrive", () => {
    expect(fmtAccounting("-3.2100", 2, "%")).toBe("(3.21%)");
    expect(fmtAccounting("12", 0)).toBe("12");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtAccounting(null)).toBe("—");
    expect(fmtAccounting(undefined)).toBe("—");
    expect(fmtAccounting("")).toBe("—");
    expect(fmtAccounting("n/a")).toBe("—");
    expect(fmtAccounting(Number.NaN)).toBe("—");
    expect(fmtAccounting(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("formats a return or weight already in percent", () => {
    expect(fmtPct(0.84)).toBe("0.84%");
    expect(fmtPct(-0.5)).toBe("(0.50%)");
    expect(fmtPct(12.345, 1)).toBe("12.3%");
    expect(fmtPct(150)).toBe("150.00%");
    expect(fmtPct(-1234.5, 1)).toBe("(1,234.5%)");
  });

  it("shows neither -0.00% nor +0.00%", () => {
    expect(fmtPct(-0.001)).toBe("0.00%");
    expect(fmtPct(0.001)).toBe("0.00%");
    expect(fmtPct(0)).toBe("0.00%");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtPct(null)).toBe("—");
  });
});

describe("fmtBp", () => {
  it("writes bp, singular or plural, and puts losses in parentheses", () => {
    expect(fmtBp(-2)).toBe("(2 bp)");
    expect(fmtBp(1)).toBe("1 bp");
    expect(fmtBp(-1)).toBe("(1 bp)");
    expect(fmtBp(25)).toBe("25 bp");
    expect(fmtBp(1250)).toBe("1,250 bp");
  });

  it("rounds to whole basis points unless asked for more", () => {
    expect(fmtBp(12.6)).toBe("13 bp");
    expect(fmtBp(-1.24, 1)).toBe("(1.2 bp)");
  });

  it("never shows a negative zero", () => {
    expect(fmtBp(-0.4)).toBe("0 bp");
    expect(fmtBp(-0.04, 1)).toBe("0.0 bp");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtBp(null)).toBe("—");
    expect(fmtBp(undefined)).toBe("—");
  });

  it("converts percentage points first when needed", () => {
    expect(fmtBp(ppToBp(-4.19))).toBe("(419 bp)");
    expect(fmtBp(ppToBp("0.25"))).toBe("25 bp");
    expect(ppToBp(null)).toBeNull();
  });
});

describe("money", () => {
  it("fmtMoney is a plain amount in accounting style", () => {
    expect(fmtMoney(1234.5)).toBe("1,234.50");
    expect(fmtMoney(-1234.5)).toBe("(1,234.50)");
    expect(fmtMoney(-0.001)).toBe("0.00");
    expect(fmtMoney(null)).toBe("—");
  });

  it("fmtUsd puts the symbol inside the parentheses", () => {
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
    expect(fmtUsd(-12)).toBe("($12.00)");
    expect(fmtUsd(-1234.4, 0)).toBe("($1,234)");
    expect(fmtUsd(-0.004)).toBe("$0.00");
    expect(fmtUsd(null)).toBe("—");
  });

  it("fmtCompact and fmtUsdCompact abbreviate large values", () => {
    expect(fmtCompact(1500)).toBe("1.5K");
    expect(fmtCompact(-1500)).toBe("(1.5K)");
    expect(fmtCompact(-0.01)).toBe("0");
    expect(fmtUsdCompact(1_200_000)).toBe("$1.2M");
    expect(fmtUsdCompact(-45_000)).toBe("($45K)");
    expect(fmtUsdCompact(-0.01)).toBe("$0");
    expect(fmtUsdCompact(null)).toBe("—");
  });
});

describe("fmtNumber", () => {
  it("shows only the decimals a count has, up to a limit", () => {
    expect(fmtNumber(1200)).toBe("1,200");
    expect(fmtNumber(3.5)).toBe("3.5");
    expect(fmtNumber(0.123456, 4)).toBe("0.1235");
    expect(fmtNumber(-2)).toBe("(2)");
    expect(fmtNumber(-0.00001)).toBe("0");
    expect(fmtNumber(null)).toBe("—");
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

  it("keeps extra decimals a price has when allowed", () => {
    expect(fmtCurrency(280.1234, "USD", { maxDigits: 4 })).toBe("$280.1234");
    expect(fmtCurrency(71.5, "USD", { maxDigits: 4 })).toBe("$71.50");
  });

  it("shows a dash when there is no number", () => {
    expect(fmtCurrency(null, "USD")).toBe("—");
    expect(fmtCurrency("", "USD")).toBe("—");
    expect(fmtCurrency("n/a", "USD")).toBe("—");
  });
});
