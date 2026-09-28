import { describe, expect, it } from "vitest";
import { buildNudges, type NudgeInput } from "./build";
import { companionHiddenOn, pickBubble, pruneDismissed, restingMood, suggestionsFor, tickerFromPath, tipFor } from "./policy";
import type { HootNudge } from "./types";

// Tuesday 2026-09-22, 14:00 New York.
const NOW = new Date("2026-09-22T18:00:00Z");

const input = (over: Partial<NudgeInput> = {}): NudgeInput => ({
  now: NOW,
  today: "2026-09-22",
  soon: ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"],
  myMovements: [],
  teamMovements: [],
  unownedHoldings: null,
  earnings: [],
  mySellSide: [],
  thesisProposals: [],
  modelProposals: [],
  weeklyDraft: null,
  latestChangelog: null,
  dismissed: {},
  ...over,
});

const nudge = (over: Partial<HootNudge>): HootNudge => ({ id: "n", kind: "earnings", priority: 5, title: "t", href: "/", mood: "idle", ...over });

describe("buildNudges", () => {
  it("puts an overdue write-up first, a due-soon one after it, and keeps one due after the weekend", () => {
    const out = buildNudges(
      input({
        myMovements: [
          { id: "m1", ticker: "NVDA", teamSlug: "tech", dueAt: new Date("2026-09-22T16:00:00Z") },
          { id: "m2", ticker: "AAPL", teamSlug: "tech", dueAt: new Date("2026-09-23T16:00:00Z") },
          { id: "m3", ticker: "MSFT", teamSlug: "tech", dueAt: new Date("2026-09-28T16:00:00Z") },
        ],
      }),
    );
    expect(out.map((n) => n.id)).toEqual(["movement:m1:overdue", "movement:m2:due", "movement:m3:due"]);
    expect(out[0]).toMatchObject({ priority: 1, mood: "concerned", href: "/t/tech/movements/m1" });
    expect(out[1].title).toBe("Your AAPL write-up is due in 22h");
    expect(out[2]).toMatchObject({ priority: 5, title: "Your MSFT write-up is due Monday" });
  });

  it("gives a lead or exec the team's unassigned and overdue write-ups, and one line for unowned holdings", () => {
    const out = buildNudges(
      input({
        teamMovements: [
          { id: "t1", ticker: "META", teamSlug: "consumer", dueAt: new Date("2026-09-20T16:00:00Z"), ownerName: null },
          { id: "t2", ticker: "JPM", teamSlug: "fig", dueAt: new Date("2026-09-23T16:00:00Z"), ownerName: null },
          { id: "t3", ticker: "UNH", teamSlug: "healthcare", dueAt: new Date("2026-09-21T16:00:00Z"), ownerName: "Jane Doe" },
          { id: "t4", ticker: "AAPL", teamSlug: "tech", dueAt: new Date("2026-09-23T16:00:00Z"), ownerName: "Sam Lee" },
        ],
        unownedHoldings: { count: 29, href: "/t/fund?filter=unassigned" },
      }),
    );
    expect(out.map((n) => [n.id, n.priority, n.title])).toEqual([
      ["movement:t1:unassigned:overdue", 2, "META write-up has no owner"],
      ["movement:t2:unassigned", 3, "JPM write-up has no owner"],
      ["movement:t3:team:overdue", 3, "UNH write-up is overdue"],
      ["holdings:unowned:29", 6, "29 holdings have no owner"],
    ]);
    expect(out[0].href).toBe("/t/consumer/movements/t1");
    expect(out[2].detail).toBe("Jane Doe owns it. Check in, or reassign it on the movement page.");
    expect(out[3].href).toBe("/t/fund?filter=unassigned");
  });

  it("links in the member's scope when it shows the item, else in the item's team", () => {
    const rows = {
      myMovements: [{ id: "m1", ticker: "NVDA", teamSlug: "tech", dueAt: new Date("2026-09-22T16:00:00Z") }],
      earnings: [{ id: "e1", ticker: "TSM", teamSlug: "tech", reportDate: "2026-09-22", reportHour: "bmo", expectationsLocked: false, mine: false }],
      teamMovements: [{ id: "m2", ticker: "AAPL", teamSlug: "tech", dueAt: new Date("2026-09-23T16:00:00Z"), ownerName: null }],
    };
    expect(buildNudges(input({ ...rows, scope: "fund" })).map((n) => n.href)).toEqual(["/t/fund/movements/m1", "/t/fund/earnings/e1", "/t/fund/movements/m2"]);
    expect(buildNudges(input({ ...rows, scope: "tech" })).map((n) => n.href)).toEqual(["/t/tech/movements/m1", "/t/tech/earnings/e1", "/t/tech/movements/m2"]);
    expect(buildNudges(input({ ...rows, scope: "consumer" })).map((n) => n.href)).toEqual(["/t/tech/movements/m1", "/t/tech/earnings/e1", "/t/tech/movements/m2"]);
  });

  it("flags today's reports, asks owners to lock expectations, and rolls the rest of the week into one line", () => {
    const out = buildNudges(
      input({
        earnings: [
          { id: "e1", ticker: "NVDA", teamSlug: "tech", reportDate: "2026-09-22", reportHour: "amc", expectationsLocked: true, mine: false },
          { id: "e2", ticker: "AAPL", teamSlug: "tech", reportDate: "2026-09-24", reportHour: "bmo", expectationsLocked: false, mine: true },
          { id: "e3", ticker: "MSFT", teamSlug: "tech", reportDate: "2026-09-25", reportHour: null, expectationsLocked: false, mine: false },
          { id: "e4", ticker: "ORCL", teamSlug: "tech", reportDate: "2026-10-20", reportHour: null, expectationsLocked: false, mine: true },
        ],
      }),
    );
    expect(out.map((n) => n.title)).toEqual(["NVDA reports today after the close", "Write down expectations for AAPL", "AAPL, MSFT report in the next few days"]);
    expect(out[1].detail).toContain("Thursday before the open");
  });

  it("drops what the member dismissed", () => {
    const out = buildNudges(input({ latestChangelog: { prNumber: 50, headline: "Attribution redesign", mergedAt: NOW }, dismissed: { "changelog:50": NOW.toISOString() } }));
    expect(out).toEqual([]);
  });

  it("only mentions sell-side calls that finished in the last week", () => {
    const out = buildNudges(
      input({
        mySellSide: [
          { id: "c1", ticker: "NVDA", teamSlug: "tech", status: "ready", updatedAt: new Date("2026-09-21T12:00:00Z") },
          { id: "c2", ticker: "AMD", teamSlug: "tech", status: "ready", updatedAt: new Date("2026-09-01T12:00:00Z") },
          { id: "c3", ticker: "AVGO", teamSlug: "tech", status: "error", updatedAt: new Date("2026-09-22T12:00:00Z") },
        ],
      }),
    );
    expect(out.map((n) => n.id)).toEqual(["sell_side:c3:error", "sell_side:c1:ready"]);
  });
});

describe("pickBubble", () => {
  const urgent = nudge({ id: "u", priority: 2 });
  const quiet = nudge({ id: "q", priority: 6 });
  const tip = nudge({ id: "tip:today", kind: "tip", priority: 9 });
  const base = { nudges: [quiet, urgent], tip, session: { count: 0, shown: [] }, sinceLoadMs: 5000, typing: false };

  it("prefers the most urgent unseen item, then the page tip", () => {
    expect(pickBubble(base)?.id).toBe("u");
    expect(pickBubble({ ...base, session: { count: 1, shown: ["u"] } })?.id).toBe("tip:today");
    expect(pickBubble({ ...base, session: { count: 2, shown: ["u", "tip:today"] } })).toBeNull();
  });

  it("never interrupts typing, a page that just loaded, or past the session allowance", () => {
    expect(pickBubble({ ...base, typing: true })).toBeNull();
    expect(pickBubble({ ...base, sinceLoadMs: 1000 })).toBeNull();
    expect(pickBubble({ ...base, session: { count: 3, shown: [] } })).toBeNull();
  });

  it("keeps low-priority items for the panel", () => {
    expect(pickBubble({ ...base, nudges: [quiet], tip: null })).toBeNull();
  });
});

describe("moods and routes", () => {
  it("rests awake while the market trades and dozes after, unless something is urgent", () => {
    expect(restingMood(true, [])).toBe("idle");
    expect(restingMood(false, [])).toBe("sleepy");
    expect(restingMood(false, [nudge({ priority: 1 })])).toBe("concerned");
    expect(restingMood(false, [nudge({ kind: "earnings", mood: "alert", priority: 2 })])).toBe("alert");
  });

  it("reads tickers from holding pages and boards, and steps aside on agent pages", () => {
    expect(tickerFromPath("/t/tech/h/nvda")).toBe("NVDA");
    expect(tickerFromPath("/t/tech/agent/h/BRK.B")).toBe("BRK.B");
    expect(tickerFromPath("/t/tech/movements")).toBeNull();
    expect(companionHiddenOn("/t/tech/agent")).toBe(true);
    expect(companionHiddenOn("/t/tech/agent/h/NVDA")).toBe(true);
    expect(companionHiddenOn("/t/tech/agents-guide")).toBe(false);
    expect(companionHiddenOn("/hoot/0b7f")).toBe(true);
    expect(companionHiddenOn("/hootenanny")).toBe(false);
    // Today's greeter and the Calendar's sleeping Hoot are the page's one Hoot.
    expect(companionHiddenOn("/")).toBe(true);
    expect(companionHiddenOn("/t/tech/earnings")).toBe(true);
    expect(companionHiddenOn("/t/fund/economic-calendar")).toBe(true);
    expect(companionHiddenOn("/t/tech/earnings/e1")).toBe(false);
    expect(companionHiddenOn("/t/tech")).toBe(false);
  });

  it("gives each page's tip once and fits suggestions to the page", () => {
    expect(tipFor("/", [])?.id).toBe("tip:today");
    expect(tipFor("/", ["tip:today"])).toBeNull();
    expect(tipFor("/t/fund/attribution", [])?.id).toBe("tip:attribution");
    expect(suggestionsFor("/t/tech/h/NVDA", "NVDA")[0]).toContain("NVDA");
    expect(suggestionsFor("/t/tech/earnings", null)[0]).toContain("report");
  });

  it("forgets old dismissals", () => {
    const kept = pruneDismissed({ old: "2026-06-01T00:00:00Z", recent: "2026-09-20T00:00:00Z" }, NOW);
    expect(Object.keys(kept)).toEqual(["recent"]);
  });
});
