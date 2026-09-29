import { describe, expect, it } from "vitest";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import type { FlowIn, TradeIn } from "@/lib/portfolio/activity";
import { earningsWindow, filterLedger, pickEconomicEvents, pickMovements, reportTiming, resolveWorkspaceScope, signedFlow, tradeTotals } from "./workspace-shape";

const teams = [
  { id: "t1", slug: "tech", name: "Technology" },
  { id: "t2", slug: "fig", name: "Financials" },
];
const exec = { role: "exec" as const, teamId: null };
const associate = { role: "associate_analyst" as const, teamId: "t1" };

describe("resolveWorkspaceScope", () => {
  it("defaults to the chat's team, and to the whole fund in a fund-wide chat", () => {
    expect(resolveWorkspaceScope(teams, associate, "t1", undefined, "movements")).toMatchObject({ slug: "tech", label: "Technology", teamIds: ["t1"], fund: false });
    expect(resolveWorkspaceScope(teams, exec, null, undefined, "movements")).toMatchObject({ slug: "fund", teamIds: ["t1", "t2"], fund: true });
  });

  it("reads a fund-wide chat (no team) as every team, and still names one team when asked", () => {
    const fund = resolveWorkspaceScope(teams, { role: "admin", teamId: "t2" }, null, undefined, "earnings");
    expect(fund.teamIds).toEqual(["t1", "t2"]);
    expect([...fund.teamById.keys()]).toEqual(["t1", "t2"]);
    expect(resolveWorkspaceScope(teams, exec, null, "tech", "earnings")).toMatchObject({ slug: "tech", teamIds: ["t1"], fund: false });
    // Only execs and admins have fund-wide chats; anyone else reaching one gets the page's refusal, not every team.
    expect(() => resolveWorkspaceScope(teams, associate, null, undefined, "earnings")).toThrow(/execs and admins only/);
  });

  it("finds a team by slug or name and lets execs ask for the fund", () => {
    expect(resolveWorkspaceScope(teams, exec, "t1", "Financials", "earnings").slug).toBe("fig");
    expect(resolveWorkspaceScope(teams, exec, "t1", "fund", "earnings").fund).toBe(true);
  });

  it("keeps a member to their own team, as the pages do", () => {
    expect(() => resolveWorkspaceScope(teams, associate, "t1", "fig", "movements")).toThrow(/visible to that team/);
    expect(() => resolveWorkspaceScope(teams, associate, "t1", "fund", "movements")).toThrow(/execs and admins only/);
    expect(() => resolveWorkspaceScope(teams, associate, "t1", "energy", "movements")).toThrow(/No team matches "energy". Teams: tech, fig\./);
  });
});

describe("pickMovements", () => {
  const now = Date.parse("2026-09-29T16:00:00Z");
  const rows = [
    { id: "a", ticker: "AVGO", status: "open" as const, dueAt: new Date("2026-09-28T16:00:00Z") },
    { id: "b", ticker: "META", status: "in_progress" as const, dueAt: new Date("2026-09-30T16:00:00Z") },
    { id: "c", ticker: "AVGO", status: "completed" as const, dueAt: new Date("2026-09-20T16:00:00Z") },
  ];

  it("counts open and in-progress as unfinished, and overdue only when past due and not done", () => {
    expect(pickMovements(rows, { status: "unfinished", limit: 10, now }).rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(pickMovements(rows, { status: "overdue", limit: 10, now }).rows.map((r) => r.id)).toEqual(["a"]);
    expect(pickMovements(rows, { status: "completed", limit: 10, now }).rows.map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by ticker in any case and reports the match count before the cap", () => {
    const r = pickMovements(rows, { ticker: "avgo", status: "all", limit: 1, now });
    expect(r.rows.map((x) => x.id)).toEqual(["a"]);
    expect(r.matched).toBe(2);
  });
});

describe("earningsWindow", () => {
  const row = (ticker: string, reportDate: string, status: "upcoming" | "reported" | "reviewed" = "upcoming", active = true) => ({ ticker, reportDate, status, active });
  const rows = [row("MSFT", "2026-10-20"), row("AVGO", "2026-10-02"), row("GOOG", "2026-09-29"), row("OLD", "2026-10-01", "upcoming", false), row("NKE", "2026-09-25", "reported"), row("JPM", "2026-09-10", "reviewed")];

  it("lists active holdings' reports within the window, soonest first, today included", () => {
    const w = earningsWindow(rows, { today: "2026-09-29", days: 14, recentDays: 7 });
    expect(w.upcoming.map((r) => r.ticker)).toEqual(["GOOG", "AVGO"]);
    expect(w.through).toBe("2026-10-13");
  });

  it("lists what just reported, newest first, within recentDays", () => {
    expect(earningsWindow(rows, { today: "2026-09-29", days: 14, recentDays: 7 }).recent.map((r) => r.ticker)).toEqual(["NKE"]);
    expect(earningsWindow(rows, { today: "2026-09-29", days: 30, recentDays: 0, ticker: "msft" }).upcoming.map((r) => r.ticker)).toEqual(["MSFT"]);
  });

  it("names the report hour", () => {
    expect([reportTiming("bmo"), reportTiming("amc"), reportTiming(null)]).toEqual(["before the open", "after the close", "time not announced"]);
  });
});

describe("pickEconomicEvents", () => {
  const ev = (name: string, importance: EconomicEvent["importance"]): EconomicEvent =>
    ({ id: name, name, importance, timestamp: null, date: "2026-09-30", time: "8:30 AM", tentative: false, category: null, period: null, actual: null, estimate: null, previous: null, previousBeforeRevision: null, source: null, updatedAt: null }) as EconomicEvent;
  const events = [ev("CPI YoY", 3), ev("Core CPI MoM", 2), ev("Redbook", 1), ev("Fed speech", null)];

  it("applies the page's importance chips and says how many they hid", () => {
    expect(pickEconomicEvents(events, { importance: "medium", limit: 10 })).toMatchObject({ matched: 2, belowImportance: 2 });
    expect(pickEconomicEvents(events, { importance: "high", limit: 10 }).events.map((e) => e.name)).toEqual(["CPI YoY"]);
    expect(pickEconomicEvents(events, { importance: "all", limit: 3 })).toMatchObject({ matched: 4, belowImportance: 0 });
  });

  it("searches names like the page's search box", () => {
    expect(pickEconomicEvents(events, { importance: "all", search: "cpi", limit: 10 }).events.map((e) => e.name)).toEqual(["CPI YoY", "Core CPI MoM"]);
  });
});

describe("ledger", () => {
  const trade = (id: string, date: string, ticker: string, side: "buy" | "sell", shares: number, price: number, voided = false): TradeIn => ({ id, date, ticker, side, kind: "trade", shares, price, fees: 0, note: null, voided, createdAt: `${date}T20:00:00Z`, by: null });
  const flow = (id: string, date: string, kind: FlowIn["kind"], amount: number): FlowIn => ({ id, date, kind, amount, note: null, voided: false, createdAt: `${date}T20:00:00Z`, by: null });
  const rows = {
    trades: [trade("1", "2026-03-02", "AVGO", "buy", 100, 150), trade("2", "2026-06-01", "AVGO", "buy", 50, 180), trade("3", "2026-09-21", "AVGO", "sell", 25, 330), trade("4", "2026-09-22", "KRE", "sell", 849, 71.5), trade("5", "2026-09-23", "AVGO", "buy", 10, 1, true)],
    flows: [flow("f1", "2026-01-05", "deposit", 1000), flow("f2", "2026-09-01", "fee", 25)],
  };

  it("narrows to a ticker (dropping cash), a date range and a kind, newest first, voided rows left out", () => {
    const avgo = filterLedger(rows, { ticker: "avgo", kind: "all", includeVoided: false });
    expect(avgo.trades.map((t) => t.id)).toEqual(["3", "2", "1"]);
    expect(avgo.flows).toEqual([]);
    expect(filterLedger(rows, { from: "2026-09-01", to: "2026-09-22", kind: "all", includeVoided: false })).toMatchObject({ trades: [{ id: "4" }, { id: "3" }], flows: [{ id: "f2" }] });
    expect(filterLedger(rows, { kind: "cash", includeVoided: true }).trades).toEqual([]);
    expect(filterLedger(rows, { ticker: "AVGO", kind: "trades", includeVoided: true }).trades.map((t) => t.id)).toContain("5");
  });

  it("totals a ticker's trades with share-weighted average prices", () => {
    const [avgo] = tradeTotals(rows.trades.filter((t) => t.ticker === "AVGO"));
    expect(avgo).toEqual({ ticker: "AVGO", trades: 3, opening: null, sharesBought: 150, sharesSold: 25, netShares: 125, avgBuyPrice: 160, avgSellPrice: 330, first: "2026-03-02", last: "2026-09-21" });
  });

  it("keeps the opening snapshot out of the average buy price: its price is a close, not a cost", () => {
    const opening: TradeIn = { ...trade("o", "2026-09-17", "AVGO", "buy", 631, 347.3), kind: "opening" };
    const [avgo] = tradeTotals([opening, trade("b", "2026-09-21", "AVGO", "buy", 25, 362.66)]);
    expect(avgo).toMatchObject({ opening: { date: "2026-09-17", shares: 631, price: 347.3 }, sharesBought: 25, netShares: 656, avgBuyPrice: 362.66 });
  });

  it("signs cash the way the account sees it", () => {
    expect(rows.flows.map(signedFlow)).toEqual([1000, -25]);
  });
});
