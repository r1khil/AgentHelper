import { describe, expect, it } from "vitest";
import { qualifies, relativeMovePp, returnPct } from "./math";
import { isTradingDay, movementDueAt, nextTradingDay } from "@/lib/providers/calendar";

describe("relative move", () => {
  it("matches the approved examples", () => {
    expect(returnPct(105, 100)).toBeCloseTo(5);
    const cases: [number, number, boolean][] = [
      [5.0, 0.7, true],
      [-3.5, 0.8, true],
      [4.0, 0.0, true],
      [-4.0, 0.0, true],
      [3.9, 0.0, false],
    ];
    for (const [h, s, q] of cases) {
      const rel = relativeMovePp({ close: 100 + h, prevClose: 100 }, { close: 100 + s, prevClose: 100 });
      expect(qualifies(rel)).toBe(q);
    }
  });
  it("treats float noise at the boundary as inclusive", () => {
    expect(qualifies(3.99999)).toBe(true);
    expect(qualifies(3.9999)).toBe(false);
  });
});

describe("calendar", () => {
  it("skips weekends and holidays", () => {
    expect(isTradingDay("2026-09-07")).toBe(false); // Labor Day
    expect(isTradingDay("2026-09-05")).toBe(false); // Saturday
    expect(isTradingDay("2026-09-08")).toBe(true);
    expect(nextTradingDay("2026-09-04")).toBe("2026-09-08");
  });
  it("sets the deadline at noon Eastern next trading day", () => {
    const due = movementDueAt("2026-09-04"); // Friday before Labor Day
    expect(due.toISOString()).toBe("2026-09-08T16:00:00.000Z"); // EDT: noon = 16:00Z
    const winter = movementDueAt("2026-01-16");
    expect(winter.toISOString()).toBe("2026-01-20T17:00:00.000Z"); // MLK Monday skipped; EST: noon = 17:00Z
  });
});
