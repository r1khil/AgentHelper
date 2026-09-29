import { describe, expect, it } from "vitest";
import type { Part } from "./turn";
import { turnPageLinks } from "./turn-links";

let n = 0;
const tool = (name: string, input: unknown, output: unknown = { data: {}, sources: [] }) => ({ type: `tool-${name}`, toolCallId: `${name}-${n++}`, state: "output-available", input, output }) as unknown as Part;

describe("turnPageLinks", () => {
  it("links a whole-fund lookup to its Portfolio view, once", () => {
    const links = turnPageLinks([tool("get_attribution", { scope: "fund" }), tool("get_attribution", { scope: "fund", period: "7d" })], "healthcare");
    expect(links).toEqual([{ label: "Performance", href: "/t/fund/performance" }]);
    expect(turnPageLinks([tool("get_daily_performance", {})], "healthcare")).toEqual([{ label: "Performance, today", href: "/t/fund/performance?period=today" }]);
  });

  it("sends a team lookup to the team's view, the chat's team when the tool defaulted to it", () => {
    expect(turnPageLinks([tool("get_attribution", { scope: "team", team: "tech" })], "healthcare")).toEqual([{ label: "Performance", href: "/t/tech/performance" }]);
    expect(turnPageLinks([tool("get_portfolio_risk", { scope: "team" })], "healthcare")).toEqual([{ label: "Risk", href: "/t/healthcare/risk" }]);
  });

  it("opens Exposure when the risk lookup cited it, and What if in the chat's team or the fund", () => {
    expect(turnPageLinks([tool("get_portfolio_risk", { scope: "fund", page: "exposure" })], null)).toEqual([{ label: "Exposure", href: "/t/fund/exposure" }]);
    expect(turnPageLinks([tool("run_backtest", {})], "tech")).toEqual([{ label: "What if", href: "/t/tech/what-if" }]);
    expect(turnPageLinks([tool("run_backtest", {})], null)).toEqual([{ label: "What if", href: "/t/fund/what-if" }]);
  });

  it("opens where write-ups and the calendars live now", () => {
    expect(turnPageLinks([tool("get_movements", { team: "tech" })], "healthcare")).toEqual([{ label: "Write-ups", href: "/t/tech/movements" }]);
    expect(turnPageLinks([tool("get_upcoming_earnings", { days: 14 })], "healthcare")).toEqual([{ label: "Markets", href: "/markets" }]);
    expect(turnPageLinks([tool("get_upcoming_earnings", {}), tool("get_economic_calendar", { from: "2026-09-28" })], null)).toEqual([{ label: "Markets", href: "/markets" }]);
    expect(turnPageLinks([tool("get_movements", { team: "Healthcare" })], "tech")).toEqual([]);
  });

  it("links the fund's own pages at their one address", () => {
    const links = turnPageLinks([tool("get_ledger", { ticker: "AVGO" }), tool("get_whats_new", {}), tool("get_my_todos", {})], "tech");
    expect(links).toEqual([
      { label: "Activity", href: "/t/fund/activity" },
      { label: "What's new", href: "/changelog" },
      { label: "Home", href: "/" },
    ]);
  });

  it("skips failed lookups, lookups with no page and a team page it cannot name", () => {
    expect(turnPageLinks([tool("get_attribution", { scope: "fund" }, { error: "no data" }), tool("get_news", { ticker: "THC" })], null)).toEqual([]);
    expect(turnPageLinks([tool("get_daily_performance", { scope: "team", team: "Healthcare" })], null)).toEqual([]);
  });
});
