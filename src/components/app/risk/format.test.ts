import { describe, expect, it } from "vitest";
import { rbp, rnum, rpct, rusd, rusdFull } from "./format";

describe("risk figures in the app's accounting style", () => {
  it("rounds tiny negatives to a plain zero", () => {
    expect(rpct(-0.0001)).toBe("0.0%");
    expect(rpct(0.0001)).toBe("0.0%");
    expect(rbp(-0.00001)).toBe("0 bp");
    expect(rnum(-0.001)).toBe("0.00");
    expect(rusd(-0.01)).toBe("$0");
    expect(rusdFull(-0.4)).toBe("$0");
  });

  it("puts losses in parentheses and gives gains no sign", () => {
    expect(rpct(0.123)).toBe("12.3%");
    expect(rpct(-0.123)).toBe("(12.3%)");
    expect(rbp(-0.0123)).toBe("(123 bp)");
    expect(rbp(0.0001)).toBe("1 bp");
    expect(rnum(-0.5)).toBe("(0.50)");
    expect(rusd(-1500)).toBe("($1.5K)");
    expect(rusdFull(-1234.4)).toBe("($1,234)");
  });

  it("shows a dash when there is no figure", () => {
    expect(rpct(null)).toBe("—");
    expect(rbp(undefined)).toBe("—");
    expect(rnum(Number.NaN)).toBe("—");
    expect(rusd(null)).toBe("—");
  });
});
