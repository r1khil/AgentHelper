import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { attentionFlags, expectationsDue, reportsWithin } from "./attention";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const ctx = { teamSlug: "tech", ticker: "NVDA", today: "2026-09-28", now: Date.parse("2026-09-28T15:00:00Z") };
const none = { openMovement: null, nextReport: null, modelUpdates: 0, thesisProposed: false };

describe("attentionFlags", () => {
  it("is empty when nothing waits", () => {
    expect(attentionFlags(none, ctx)).toEqual([]);
  });

  it("puts an overdue write-up first, in pink", () => {
    const flags = attentionFlags({ ...none, modelUpdates: 1, openMovement: { id: "m1", dueAt: new Date("2026-09-25T16:00:00Z") } }, ctx);
    expect(flags[0]).toEqual({ tone: "hoot", label: "Write-up overdue", href: "/t/tech/movements/m1" });
    expect(flags[1]).toMatchObject({ tone: "neutral", label: "1 model update" });
  });

  it("says how far the stock moved under an open write-up", () => {
    const flags = attentionFlags({ ...none, openMovement: { id: "m1", dueAt: new Date("2026-09-25T16:00:00Z"), sessionDate: "2026-09-25", relativeMovePp: -4.3 } }, ctx);
    expect(flags[0].detail).toBe("Moved (430 bp) on Sep 25");
  });

  it("flags expectations only for an unlocked report within two weeks", () => {
    const soon = { id: "e1", reportDate: "2026-10-06", reportHour: "bmo", locked: false };
    expect(attentionFlags({ ...none, nextReport: soon }, ctx)).toEqual([{ tone: "caution", label: "Expectations due Mon, Oct 5", detail: "Lock them before the report", href: "/t/tech/earnings/e1" }]);
    expect(attentionFlags({ ...none, nextReport: { ...soon, locked: true } }, ctx)).toEqual([]);
    expect(attentionFlags({ ...none, nextReport: { ...soon, reportDate: "2026-11-18" } }, ctx)).toEqual([]);
  });

  it("adds neutral model and thesis flags", () => {
    expect(attentionFlags({ ...none, modelUpdates: 3, thesisProposed: true }, ctx).map((f) => [f.tone, f.label])).toEqual([
      ["neutral", "3 model updates"],
      ["neutral", "Thesis proposed"],
    ]);
  });
});

describe("report windows", () => {
  it("counts reports from today through two weeks out", () => {
    expect(reportsWithin("2026-09-28", "2026-09-28")).toBe(true);
    expect(reportsWithin("2026-10-12", "2026-09-28")).toBe(true);
    expect(reportsWithin("2026-10-13", "2026-09-28")).toBe(false);
    expect(reportsWithin(null, "2026-09-28")).toBe(false);
  });

  it("makes pre-market expectations due the session before", () => {
    expect(expectationsDue("2026-10-05", "bmo")).toBe("2026-10-02");
    expect(expectationsDue("2026-10-05", "amc")).toBe("2026-10-05");
  });
});
