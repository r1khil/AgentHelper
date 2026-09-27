import { describe, expect, it } from "vitest";
import { pickEarnings, type Reporter } from "./earnings";

const B = 1e9;

describe("pickEarnings", () => {
  it("reproduces the week of 2026-09-21: the biggest reporters, largest first within a day", () => {
    const week: Reporter[] = [
      { ticker: "COST", date: "2026-09-24", cap: 409 * B },
      { ticker: "CTAS", date: "2026-09-23", cap: 80 * B },
      { ticker: "AZO", date: "2026-09-22", cap: 46 * B },
      { ticker: "PAYX", date: "2026-09-23", cap: 36 * B },
      { ticker: "DRI", date: "2026-09-24", cap: 23 * B },
      { ticker: "AIR", date: "2026-09-21", cap: 5 * B },
      { ticker: "ANAB", date: "2026-09-21", cap: 2 * B },
    ];
    expect(pickEarnings(week).map((r) => r.ticker)).toEqual(["AZO", "CTAS", "PAYX", "COST", "DRI"]);
  });

  it("always keeps holdings and bellwethers, whatever their size or a missing cap", () => {
    const week: Reporter[] = [
      { ticker: "SMALL", date: "2026-09-29", cap: 1 * B, always: true },
      { ticker: "NOCAP", date: "2026-09-29", cap: null, always: true },
      { ticker: "MU", date: "2026-09-30", cap: 1222 * B },
    ];
    expect(pickEarnings(week).map((r) => r.ticker)).toEqual(["SMALL", "NOCAP", "MU"]);
  });

  it("caps the big names at the largest few", () => {
    const week: Reporter[] = Array.from({ length: 12 }, (_, i) => ({ ticker: `T${String(i).padStart(2, "0")}`, date: "2026-09-30", cap: (20 + i) * B }));
    expect(pickEarnings(week).map((r) => r.ticker)).toEqual(["T11", "T10", "T09", "T08", "T07", "T06", "T05", "T04"]);
  });
});
