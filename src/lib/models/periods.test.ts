import { describe, expect, it } from "vitest";
import { parsePeriodLabel } from "./periods";

describe("parsePeriodLabel", () => {
  it("parses common header styles", () => {
    expect(parsePeriodLabel("Q3 2025")).toBe("2025-09-30");
    expect(parsePeriodLabel("Q1'24")).toBe("2024-03-31");
    expect(parsePeriodLabel("3Q24")).toBe("2024-09-30");
    expect(parsePeriodLabel("FY25")).toBe("2025-12-31");
    expect(parsePeriodLabel("2024")).toBe("2024-12-31");
    expect(parsePeriodLabel("Sep-25")).toBe("2025-09-30");
    expect(parsePeriodLabel("December 2023")).toBe("2023-12-31");
    expect(parsePeriodLabel("2025-06-30")).toBe("2025-06-30");
    expect(parsePeriodLabel("Revenue")).toBeNull();
    expect(parsePeriodLabel(12)).toBeNull();
  });
});
