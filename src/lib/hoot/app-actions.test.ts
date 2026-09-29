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
    expect(go(resolveNavigation({ page: "team", team: "fig" }, { ...exec, path: "/risk" }))).toBe("/t/fig (Team page for FIG)");
    expect(go(resolveNavigation({ page: "team", team: "fund" }, exec))).toBe("/t/fund (Portfolio)");
  });

  it("keeps the scope the member asked from when no team is named", () => {
    expect(go(resolveNavigation({ page: "risk", lookback: "2y" }, { ...exec, path: "/attribution" }))).toBe("/risk?lookback=2y (Risk)");
    expect(go(resolveNavigation({ page: "risk" }, { ...exec, path: "/t/healthcare/movements" }))).toBe("/t/healthcare/risk (Risk for Healthcare)");
    expect(go(resolveNavigation({ page: "movements" }, analyst))).toBe("/t/tech/movements (Movements for Information Technology)");
  });

  it("carries the view settings the page reads", () => {
    expect(go(resolveNavigation({ page: "performance", team: "tech", period: "ytd" }, exec))).toBe("/t/tech/attribution?period=ytd (Performance for Information Technology)");
    expect(go(resolveNavigation({ page: "performance", period: "custom", from: "2026-09-17", to: "2026-09-25" }, exec))).toBe("/attribution?period=custom&from=2026-09-17&to=2026-09-25 (Performance)");
    expect(go(resolveNavigation({ page: "backtesting", trade: { ticker: "avgo", changePp: -2, fundFrom: "cash" } }, exec))).toBe("/backtesting?trade=AVGO%3A-2%3Acash (Backtesting)");
  });

  it("opens a holding in the scope in view", () => {
    expect(go(resolveNavigation({ page: "holding", ticker: "axp" }, { ...exec, path: "/t/fund" }))).toMatch(/^\/t\/fund\/h\/AXP /);
    expect(go(resolveNavigation({ page: "holding", ticker: "AVGO" }, analyst))).toMatch(/^\/t\/tech\/h\/AVGO /);
    expect(go(resolveNavigation({ page: "holding", ticker: "AXP" }, analyst))).toBe("error: AXP isn't an active holding in a team you can open.");
  });

  it("only opens pages the member's own sidebar offers, and says why not", () => {
    expect(go(resolveNavigation({ page: "exposure" }, analyst))).toBe("error: Exposure shows position sizes, which only the team's lead analyst, execs and admins see.");
    expect(go(resolveNavigation({ page: "exposure" }, lead))).toBe("/t/tech/exposure (Exposure for Information Technology)");
    expect(go(resolveNavigation({ page: "admin" }, analyst))).toBe("error: Admin is for execs and admins.");
    expect(go(resolveNavigation({ page: "team", team: "fig" }, analyst))).toMatch(/^error: No team you can open matches "fig"/);
    expect(go(resolveNavigation({ page: "research", team: "fund" }, analyst))).toMatch(/^error: The whole Fund's pages are for execs and admins/);
  });
});

describe("takeNewActions", () => {
  const nav = (id: string, href: string, state = "output-available") => ({ type: "tool-navigate", toolCallId: id, state, output: { data: { action: { kind: "navigate", href, label: "Risk" } } } });
  it("returns each finished action once, and never a saved one", async () => {
    const { seenActions, takeNewActions } = await import("./app-actions");
    const saved = [{ parts: [nav("old", "/risk")] }];
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
