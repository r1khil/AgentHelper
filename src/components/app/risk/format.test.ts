import { describe, expect, it } from "vitest";
import { rnum, rpct, rsigned, rusd, rusdFull } from "./format";

describe("risk formatters never show a negative zero", () => {
  it("rounds tiny negatives to a plain zero", () => {
    expect(rpct(-0.0001)).toBe("0.0%");
    expect(rsigned(-0.0001)).toBe("0.0%");
    expect(rsigned(0.0001)).toBe("0.0%");
    expect(rnum(-0.001)).toBe("0.00");
    expect(rusd(-0.01)).toBe("$0");
    expect(rusdFull(-0.4)).toBe("$0");
  });

  it("keeps real figures as before", () => {
    expect(rpct(0.123)).toBe("12.3%");
    expect(rsigned(0.123)).toBe("+12.3%");
    expect(rsigned(-0.123)).toBe("-12.3%");
    expect(rusd(-1500)).toBe("−$1.5K");
    expect(rusdFull(-1234.4)).toBe("−$1,234");
    expect(rpct(null)).toBe("—");
  });
});
