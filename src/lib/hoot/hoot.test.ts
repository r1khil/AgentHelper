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
  earnings: [],
  mySellSide: [],
  thesisProposals: [],
  modelProposals: [],
  weeklyPack: null,
  latestChangelog: null,
  dismissed: {},
  ...over,
});

const nudge = (over: Partial<HootNudge>): HootNudge => ({ id: "n", kind: "earnings", priority: 5, title: "t", href: "/", mood: "idle", ...over });

describe("buildNudges", () => {
  it("links in the member's scope when it shows the item, else in the item's team", () => {
    const rows = {
      earnings: [{ id: "e1", ticker: "TSM", teamSlug: "tech", reportDate: "2026-09-22", reportHour: "bmo", expectationsLocked: false, mine: false }],
    };
    expect(buildNudges(input({ ...rows, scope: "fund" })).map((n) => n.href)).toEqual(["/t/fund/earnings/e1"]);
    expect(buildNudges(input({ ...rows, scope: "tech" })).map((n) => n.href)).toEqual(["/t/tech/earnings/e1"]);
    expect(buildNudges(input({ ...rows, scope: "consumer" })).map((n) => n.href)).toEqual(["/t/tech/earnings/e1"]);
  });

  it("flags today's reports, asks the holding's team to lock expectations, and rolls the rest of the week into one line", () => {
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

  it("names this week's pack by the Weekly page's status, and gives a failed send its own id", () => {
    const one = (state: "draft" | "scheduled" | "failed") => buildNudges(input({ weeklyPack: { weekEnding: "2026-09-25", state } }))[0];
    expect(one("scheduled")).toMatchObject({ id: "weekly:2026-09-25", at: "2026-09-25", title: "This week's update pack is scheduled" });
    expect(one("draft")).toMatchObject({ id: "weekly:2026-09-25", title: "This week's update pack is a draft" });
    expect(one("draft").at).toBeUndefined();
    expect(one("failed")).toMatchObject({ id: "weekly:2026-09-25:failed", mood: "concerned", title: "This week's update pack failed to send" });
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
    expect(tickerFromPath("/t/tech/models")).toBeNull();
    expect(companionHiddenOn("/t/tech/agent")).toBe(true);
    expect(companionHiddenOn("/t/tech/agent/h/NVDA")).toBe(true);
    expect(companionHiddenOn("/t/tech/agents-guide")).toBe(false);
    expect(companionHiddenOn("/hoot/0b7f")).toBe(true);
    expect(companionHiddenOn("/hootenanny")).toBe(false);
    // Home is a conversation with Hoot already; the Calendar keeps the corner button.
    expect(companionHiddenOn("/")).toBe(true);
    expect(companionHiddenOn("/t/tech/earnings")).toBe(false);
    expect(companionHiddenOn("/t/fund/economic-calendar")).toBe(false);
    expect(companionHiddenOn("/t/tech/earnings/e1")).toBe(false);
    // The Portfolio's Positions and a holding have their own ask box; the Portfolio's other views keep the corner.
    expect(companionHiddenOn("/t/tech")).toBe(true);
    expect(companionHiddenOn("/t/tech/h/NVDA")).toBe(true);
    expect(companionHiddenOn("/t/tech/risk")).toBe(false);
  });

  it("gives each page's tip once and fits suggestions to the page", () => {
    expect(tipFor("/", [])?.id).toBe("tip:today");
    expect(tipFor("/", ["tip:today"])).toBeNull();
    // A tip keeps its id when its page moved: Attribution is the Portfolio's Performance view now.
    expect(tipFor("/t/fund/performance", [])?.id).toBe("tip:attribution");
    expect(tipFor("/t/tech/what-if", [])?.title).toBe("What if");
    expect(tipFor("/markets", [])?.id).toBe("tip:markets");
    // Pages that are gone (they redirect) have no tip.
    expect(tipFor("/attribution", [])).toBeNull();
    expect(tipFor("/backtesting", [])).toBeNull();
    expect(suggestionsFor("/t/tech/h/NVDA", "NVDA")[0]).toContain("NVDA");
    expect(suggestionsFor("/markets", null)[0]).toContain("report");
    expect(suggestionsFor("/t/fund/activity", null)[0]).toContain("trades");
    expect(suggestionsFor("/t/fund/performance", null)[0]).toContain("performance");
    expect(suggestionsFor("/t/fund/what-if", null)[0]).toContain("scenario");
  });

  it("forgets old dismissals", () => {
    const kept = pruneDismissed({ old: "2026-06-01T00:00:00Z", recent: "2026-09-20T00:00:00Z" }, NOW);
    expect(Object.keys(kept)).toEqual(["recent"]);
  });
});
