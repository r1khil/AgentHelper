import { describe, expect, it } from "vitest";
import { fmtBp, fmtBps, fmtBpsShort, fmtSigned, fmtWeight } from "./format";

describe("attribution formatters never show a negative zero", () => {
  it("rounds tiny losses to a plain zero", () => {
    expect(fmtBpsShort(-0.00004)).toBe("0");
    expect(fmtBp(-0.00004)).toBe("0 bp");
    expect(fmtBps(-0.000004)).toBe("0.0 bps");
    expect(fmtSigned(-0.00001)).toBe("0.00%");
    expect(fmtWeight(-0.0001)).toBe("0.0%");
  });

  it("keeps the sign on figures that survive rounding", () => {
    expect(fmtBpsShort(-0.0068)).toBe("-68");
    expect(fmtBpsShort(0.0041)).toBe("+41");
    expect(fmtBps(-0.00012)).toBe("-1.2 bps");
    expect(fmtSigned(0.0084)).toBe("+0.84%");
  });
});
