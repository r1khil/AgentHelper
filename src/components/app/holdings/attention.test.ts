import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { attentionFlags, expectationsDue, holdingNeeds, overdueWords, reportsWithin } from "./attention";

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

  it("puts an overdue write-up first, in red", () => {
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

describe("holdingNeeds", () => {
  const base = { base: "/t/fund", today: "2026-09-28", now: Date.parse("2026-09-28T15:00:00Z") };
  const empty = { moves: [], nextReport: null, models: [], thesisProposed: false };
  const move = { id: "m1", sessionDate: "2026-09-24", status: "open", dueAt: new Date("2026-09-24T14:00:00Z"), relativeMovePp: 4.53, dataQuality: null, evidence: 17, drafted: false };

  it("is empty when nothing waits", () => {
    expect(holdingNeeds(empty, base)).toEqual([]);
  });

  it("lists every open write-up, the most overdue first, red from the first minute late", () => {
    const rows = holdingNeeds(
      {
        ...empty,
        moves: [
          { ...move, id: "m2", sessionDate: "2026-09-25", dueAt: new Date("2026-09-28T14:00:00Z"), relativeMovePp: -4.02, drafted: true },
          move,
          { ...move, id: "m3", status: "completed" },
        ],
      },
      base,
    );
    expect(rows.map((r) => [r.status, r.tone, r.title, r.action, r.href])).toEqual([
      ["4 days overdue", "overdue", "Movement write-up for +453 bp on Sep 24", "Write it", "/t/fund/movements/m1"],
      ["1 hour overdue", "overdue", "Movement write-up for (402 bp) on Sep 25", "Finish", "/t/fund/movements/m2"],
    ]);
    expect(rows[0].detail).toBe("Hoot gathered 17 sources");
  });

  it("keeps a data problem amber even when late", () => {
    const [row] = holdingNeeds({ ...empty, moves: [{ ...move, dataQuality: "No close for Sep 24" }] }, base);
    expect(row).toMatchObject({ status: "Data problem", tone: "caution", action: "Open" });
  });

  it("says when a write-up is due before it is late", () => {
    const [row] = holdingNeeds({ ...empty, moves: [{ ...move, dueAt: new Date("2026-09-29T16:00:00Z") }] }, base);
    expect(row).toMatchObject({ status: "Due Sep 29, 12:00 PM ET", tone: "caution" });
  });

  it("adds expectations, model values and a proposed thesis", () => {
    const rows = holdingNeeds(
      {
        ...empty,
        nextReport: { id: "e1", reportDate: "2026-10-06", reportHour: "bmo", fiscalPeriod: "Q3", locked: false, drafted: false },
        models: [
          { id: "v2", fileName: "META.xlsx", version: 2, toDecide: 4 },
          { id: "v1", fileName: "META.xlsx", version: 1, toDecide: 0 },
        ],
        thesisProposed: true,
      },
      base,
    );
    expect(rows.map((r) => [r.status, r.action, r.href])).toEqual([
      ["Due Mon, Oct 5", "Write them", "/t/fund/earnings/e1"],
      ["4 to decide", "Review", "/t/fund/models/v2"],
      ["Proposed", "Review", "#thesis"],
    ]);
    const lateReport = { id: "e2", reportDate: "2026-09-29", reportHour: "bmo", fiscalPeriod: null, locked: false, drafted: true };
    expect(holdingNeeds({ ...empty, nextReport: lateReport }, { ...base, today: "2026-09-29" })[0]).toMatchObject({ status: "Overdue", tone: "overdue", action: "Finish" });
    expect(holdingNeeds({ ...empty, nextReport: { id: "e1", reportDate: "2026-11-18", reportHour: null, fiscalPeriod: null, locked: false, drafted: false } }, base)).toEqual([]);
  });

  it("words how late something is in its largest unit", () => {
    const now = Date.parse("2026-09-28T15:00:00Z");
    expect(overdueWords(new Date("2026-09-28T14:48:00Z"), now)).toBe("12 minutes overdue");
    expect(overdueWords(new Date("2026-09-27T14:00:00Z"), now)).toBe("1 day overdue");
  });
});
