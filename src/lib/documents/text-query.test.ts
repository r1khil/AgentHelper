import { describe, expect, it } from "vitest";
import { looseQueryText } from "./text-query";

describe("looseQueryText", () => {
  it("keeps every word of a plain query", () => {
    expect(looseQueryText("quarter results revenue guidance")).toBe("quarter results revenue guidance");
  });
  it("drops excluded terms and phrases so the fallback never looks for them", () => {
    expect(looseQueryText('KKR fee earnings -"private wealth" -insurance')).toBe("KKR fee earnings");
    expect(looseQueryText("-margin outlook")).toBe("outlook");
  });
  it("unwraps phrases and drops the or keyword", () => {
    expect(looseQueryText('"fee related earnings" or FRE')).toBe("fee related earnings FRE");
  });
  it("keeps hyphenated words", () => {
    expect(looseQueryText("year-over-year growth")).toBe("year-over-year growth");
  });
  it("returns null when nothing searchable is left", () => {
    expect(looseQueryText("  -capex  ")).toBeNull();
    expect(looseQueryText("")).toBeNull();
  });
});
