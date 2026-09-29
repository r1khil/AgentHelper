import { describe, expect, it } from "vitest";
import { resolveNavigation, resolveTeam, type AppTeam, type NavigateContext } from "./app-actions";

const teams: AppTeam[] = [
  { id: "t-com", slug: "commodities", name: "Commodities" },
  { id: "t-con", slug: "consumer", name: "Consumer & Communication Services" },
  { id: "t-fig", slug: "fig", name: "FIG" },
  { id: "t-hc", slug: "healthcare", name: "Healthcare" },
  { id: "t-ind", slug: "industrials", name: "Industrials" },
  { id: "t-it", slug: "tech", name: "Information Technology" },
];

describe("resolveTeam", () => {
  it("finds a team by slug, name, abbreviation or a typo", () => {
    expect(resolveTeam("fig", teams)).toMatchObject({ slug: "fig" });
    expect(resolveTeam("the FIG sector", teams)).toMatchObject({ slug: "fig" });
    expect(resolveTeam("FIG sectoer", teams)).toMatchObject({ slug: "fig" });
    expect(resolveTeam("tech", teams)).toMatchObject({ slug: "tech" });
    expect(resolveTeam("information technology", teams)).toMatchObject({ slug: "tech" });
    expect(resolveTeam("IT", teams)).toMatchObject({ slug: "tech" });
    expect(resolveTeam("C&CS", teams)).toMatchObject({ slug: "consumer" });
    expect(resolveTeam("consumer and communication services", teams)).toMatchObject({ slug: "consumer" });
    expect(resolveTeam("helthcare", teams)).toMatchObject({ slug: "healthcare" });
    expect(resolveTeam("industrails team", teams)).toMatchObject({ slug: "industrials" });
    expect(resolveTeam("whole fund", teams)).toBe("fund");
  });
  it("refuses a guess", () => {
    expect(resolveTeam("energy", teams)).toBeNull();
    expect(resolveTeam("figma", teams)).toBeNull();
    expect(resolveTeam("", teams)).toBeNull();
  });
});

const exec: NavigateContext = { viewer: { role: "exec", teamId: null }, teams, holdings: [{ ticker: "AXP", teamSlug: "fig" }] };
const analyst: NavigateContext = { viewer: { role: "associate_analyst", teamId: "t-it" }, teams: [teams[5]], holdings: [{ ticker: "AVGO", teamSlug: "tech" }] };
const lead: NavigateContext = { viewer: { role: "lead_analyst", teamId: "t-it" }, teams: [teams[5]] };
const go = (r: ReturnType<typeof resolveNavigation>) => ("action" in r ? `${r.action.href} (${r.action.label})` : `error: ${r.error}`);

describe("resolveNavigation", () => {
  it("takes an exec to a team (the 2026-09-25 'take me to the fig sector')", () => {
    expect(go(resolveNavigation({ page: "portfolio", team: "fig" }, { ...exec, path: "/t/fund/risk" }))).toBe("/t/fig (Portfolio for FIG)");
    expect(go(resolveNavigation({ page: "portfolio", team: "fund" }, exec))).toBe("/t/fund (Portfolio)");
    // The team page is the Portfolio filtered to the team now.
    expect(go(resolveNavigation({ page: "team", team: "fig" }, exec))).toBe("/t/fig (Portfolio for FIG)");
  });

  it("keeps the scope the member asked from when no team is named", () => {
    expect(go(resolveNavigation({ page: "risk", lookback: "2y" }, { ...exec, path: "/t/fund/performance" }))).toBe("/t/fund/risk?lookback=2y (Risk)");
    // A page from before the five screens still counts as the fund's.
    expect(go(resolveNavigation({ page: "risk" }, { ...exec, path: "/attribution" }))).toBe("/t/fund/risk (Risk)");
    expect(go(resolveNavigation({ page: "risk" }, { ...exec, path: "/t/healthcare/movements/m1" }))).toBe("/t/healthcare/risk (Risk for Healthcare)");
    expect(go(resolveNavigation({ page: "markets" }, analyst))).toBe("/markets (Markets)");
  });

  it("carries the view settings the page reads", () => {
    expect(go(resolveNavigation({ page: "performance", team: "tech", period: "ytd" }, exec))).toBe("/t/tech/performance?period=ytd (Performance for Information Technology)");
    expect(go(resolveNavigation({ page: "performance", period: "custom", from: "2026-09-17", to: "2026-09-25" }, exec))).toBe("/t/fund/performance?period=custom&from=2026-09-17&to=2026-09-25 (Performance)");
    expect(go(resolveNavigation({ page: "performance", period: "today" }, exec))).toBe("/t/fund/performance?period=today (Performance today)");
    expect(go(resolveNavigation({ page: "what_if", trade: { ticker: "avgo", changePp: -2, fundFrom: "cash" } }, exec))).toBe("/t/fund/what-if?trade=AVGO%3A-2%3Acash (What if)");
  });

  it("opens where a page from before the five screens lives now", () => {
    expect(go(resolveNavigation({ page: "performance_today" }, exec))).toBe("/t/fund/performance?period=today (Performance today)");
    expect(go(resolveNavigation({ page: "backtesting", trade: { ticker: "avgo", changePp: -2, fundFrom: "cash" } }, exec))).toBe("/t/fund/what-if?trade=AVGO%3A-2%3Acash (What if)");
    expect(go(resolveNavigation({ page: "attribution", team: "tech" }, exec))).toBe("/t/tech/performance (Performance for Information Technology)");
    expect(go(resolveNavigation({ page: "ledger" }, exec))).toBe("/t/fund/activity (Activity)");
    expect(go(resolveNavigation({ page: "research" }, analyst))).toBe("/hoot (All threads)");
    expect(go(resolveNavigation({ page: "economic_calendar" }, exec))).toBe("/markets (Markets)");
    expect(go(resolveNavigation({ page: "movements" }, analyst))).toBe("/t/tech/movements (Write-ups for Information Technology)");
    expect(go(resolveNavigation({ page: "earnings" }, analyst))).toBe("/markets (Markets)");
    expect(go(resolveNavigation({ page: "earnings", team: "tech" }, exec))).toBe("/markets?team=tech (Markets for Information Technology)");
  });

  it("opens a holding's tab for a list about one holding, and the list across the scope without one", () => {
    expect(go(resolveNavigation({ page: "movements", ticker: "avgo" }, analyst))).toBe("/t/tech/h/AVGO?tab=write-ups (AVGO, Write-ups)");
    expect(go(resolveNavigation({ page: "write_ups", ticker: "avgo" }, analyst))).toBe("/t/tech/h/AVGO?tab=write-ups (AVGO, Write-ups)");
    expect(go(resolveNavigation({ page: "sell_side", ticker: "AVGO" }, analyst))).toBe("/t/tech/h/AVGO?tab=filings (AVGO, Filings & notes)");
    expect(go(resolveNavigation({ page: "models", ticker: "AVGO" }, analyst))).toBe("/t/tech/h/AVGO?tab=model (AVGO, Model)");
    expect(go(resolveNavigation({ page: "threads", ticker: "AVGO" }, analyst))).toBe("/t/tech/h/AVGO?tab=threads (AVGO, Threads)");
    expect(go(resolveNavigation({ page: "earnings", ticker: "AXP" }, { ...exec, path: "/markets" }))).toBe("/t/fund/h/AXP?tab=earnings (AXP, Earnings)");
    expect(go(resolveNavigation({ page: "models" }, { ...exec, path: "/t/fund/risk" }))).toBe("/t/fund/models (Models)");
    expect(go(resolveNavigation({ page: "sell_side", team: "fig" }, exec))).toBe("/t/fig/sell-side (Sell-side calls for FIG)");
    expect(go(resolveNavigation({ page: "threads" }, exec))).toBe("/hoot (All threads)");
    expect(go(resolveNavigation({ page: "changelog" }, exec))).toBe("/changelog (What's new)");
  });

  it("opens a holding in the scope in view, on the tab asked for", () => {
    expect(go(resolveNavigation({ page: "holding", ticker: "axp" }, { ...exec, path: "/t/fund" }))).toMatch(/^\/t\/fund\/h\/AXP /);
    expect(go(resolveNavigation({ page: "holding", ticker: "axp" }, { ...exec, path: "/t/fig/risk" }))).toMatch(/^\/t\/fig\/h\/AXP /);
    // From a page outside /t/ (Home, a thread, Markets), an exec opens it in the whole fund.
    expect(go(resolveNavigation({ page: "holding", ticker: "axp", tab: "threads" }, { ...exec, path: "/hoot/c1" }))).toBe("/t/fund/h/AXP?tab=threads (AXP, Threads)");
    expect(go(resolveNavigation({ page: "holding", ticker: "AVGO" }, analyst))).toMatch(/^\/t\/tech\/h\/AVGO /);
    expect(go(resolveNavigation({ page: "holding", ticker: "AXP" }, analyst))).toBe("error: AXP isn't an active holding in a team you can open.");
    expect(go(resolveNavigation({ page: "models", ticker: "AXP" }, analyst))).toBe("error: AXP isn't an active holding in a team you can open.");
  });

  it("only opens pages the member's own sidebar offers, and says why not", () => {
    expect(go(resolveNavigation({ page: "exposure" }, analyst))).toBe("error: Exposure shows position sizes, which only the team's lead analyst, execs and admins see.");
    expect(go(resolveNavigation({ page: "performance_today" }, analyst))).toBe("error: Performance shows position sizes and P&L, which only the team's lead analyst, execs and admins see.");
    expect(go(resolveNavigation({ page: "exposure" }, lead))).toBe("/t/tech/exposure (Exposure for Information Technology)");
    expect(go(resolveNavigation({ page: "activity" }, lead))).toBe("error: Activity (the trade ledger) is the whole Fund's, for execs and admins.");
    expect(go(resolveNavigation({ page: "what_if" }, analyst))).toBe("/t/tech/what-if (What if for Information Technology)");
    expect(go(resolveNavigation({ page: "admin" }, analyst))).toBe("error: Admin is for execs and admins.");
    expect(go(resolveNavigation({ page: "portfolio", team: "fig" }, analyst))).toMatch(/^error: No team you can open matches "fig"/);
    expect(go(resolveNavigation({ page: "portfolio", team: "fund" }, analyst))).toMatch(/^error: The whole Fund's pages are for execs and admins/);
  });
});

describe("takeNewActions", () => {
  const nav = (id: string, href: string, state = "output-available") => ({ type: "tool-navigate", toolCallId: id, state, output: { data: { action: { kind: "navigate", href, label: "Risk" } } } });
  it("returns each finished action once, and never a saved one", async () => {
    const { seenActions, takeNewActions } = await import("./app-actions");
    const saved = [{ parts: [nav("old", "/t/fund/risk")] }];
    const seen = seenActions(saved);
    const live = [...saved, { parts: [nav("new", "/t/fig", "input-available")] }];
    expect(takeNewActions(live, seen)).toEqual([]);
    live[1].parts[0] = nav("new", "/t/fig");
    expect(takeNewActions(live, seen)).toEqual([{ kind: "navigate", href: "/t/fig", label: "Risk" }]);
    expect(takeNewActions(live, seen)).toEqual([]);
  });
  it("ignores anything that isn't an in-app path or a known theme", async () => {
    const { actionOfPart } = await import("./app-actions");
    expect(actionOfPart(nav("a", "https://evil.example"))).toBeNull();
    expect(actionOfPart(nav("b", "//evil.example/x"))).toBeNull();
    expect(actionOfPart({ type: "tool-set_theme", toolCallId: "c", state: "output-available", output: { data: { action: { kind: "theme", theme: "neon" } } } })).toBeNull();
    expect(actionOfPart({ type: "tool-set_theme", toolCallId: "d", state: "output-available", output: { data: { action: { kind: "theme", theme: "dark" } } } })).toEqual({ kind: "theme", theme: "dark" });
    expect(actionOfPart({ type: "tool-get_quote", toolCallId: "e", state: "output-available", output: { data: { action: { kind: "theme", theme: "dark" } } } })).toBeNull();
  });
});
