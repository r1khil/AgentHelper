import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { attentionFlags, expectationsDue, holdingNeeds, reportsWithin } from "./attention";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const ctx = { teamSlug: "tech", ticker: "NVDA", today: "2026-09-28", now: Date.parse("2026-09-28T15:00:00Z") };
const none = { nextReport: null, modelUpdates: 0, thesisProposed: false };

describe("attentionFlags", () => {
  it("is empty when nothing waits", () => {
    expect(attentionFlags(none, ctx)).toEqual([]);
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
  const empty = { nextReport: null, models: [], thesisProposed: false };

  it("is empty when nothing waits", () => {
    expect(holdingNeeds(empty, base)).toEqual([]);
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

});
