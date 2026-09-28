import { describe, expect, it } from "vitest";
import { fmtAccounting, fmtBp, fmtPct } from "@/lib/format";
import { bps, pct, toneOf } from "./format";

describe("attribution figures in the app's accounting style", () => {
  it("rounds tiny losses to a plain zero", () => {
    expect(fmtAccounting(bps(-0.00004), 0)).toBe("0");
    expect(fmtBp(bps(-0.00004))).toBe("0 bp");
    expect(fmtBp(bps(-0.000004), 1)).toBe("0.0 bp");
    expect(fmtPct(pct(-0.00001))).toBe("0.00%");
    expect(fmtPct(pct(-0.0001), 1)).toBe("0.0%");
    expect(toneOf(-0.00004)).toBeNull();
  });

  it("puts losses in parentheses and gives gains no sign", () => {
    expect(fmtAccounting(bps(-0.0068), 0)).toBe("(68)");
    expect(fmtAccounting(bps(0.0041), 0)).toBe("41");
    expect(fmtBp(bps(-0.00012), 1)).toBe("(1.2 bp)");
    expect(fmtPct(pct(0.0084))).toBe("0.84%");
    expect(toneOf(-0.0068)).toBe("down");
  });

  it("shows a dash when there is no figure", () => {
    expect(fmtBp(bps(null))).toBe("—");
    expect(fmtPct(pct(undefined))).toBe("—");
  });
});
