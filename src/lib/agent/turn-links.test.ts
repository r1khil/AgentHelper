import { describe, expect, it } from "vitest";
import type { Part } from "./turn";
import { turnPageLinks } from "./turn-links";

let n = 0;
const tool = (name: string, input: unknown, output: unknown = { data: {}, sources: [] }) => ({ type: `tool-${name}`, toolCallId: `${name}-${n++}`, state: "output-available", input, output }) as unknown as Part;

describe("turnPageLinks", () => {
  it("links a whole-fund lookup to its page, once", () => {
    const links = turnPageLinks([tool("get_attribution", { scope: "fund" }), tool("get_attribution", { scope: "fund", period: "7d" })], "healthcare");
    expect(links).toEqual([{ label: "Performance", href: "/attribution" }]);
  });

  it("sends a team lookup to the team's page, the chat's team when the tool defaulted to it", () => {
    expect(turnPageLinks([tool("get_attribution", { scope: "team", team: "tech" })], "healthcare")).toEqual([{ label: "Performance", href: "/t/tech/attribution" }]);
    expect(turnPageLinks([tool("get_portfolio_risk", { scope: "team" })], "healthcare")).toEqual([{ label: "Risk", href: "/t/healthcare/risk" }]);
  });

  it("opens Exposure when the risk lookup cited it, and Backtesting without a team", () => {
    expect(turnPageLinks([tool("get_portfolio_risk", { scope: "fund", page: "exposure" })], null)).toEqual([{ label: "Exposure", href: "/exposure" }]);
    expect(turnPageLinks([tool("run_backtest", { scope: "team" })], "tech")).toEqual([{ label: "Backtesting", href: "/backtesting" }]);
  });

  it("skips failed lookups, lookups with no page and a team page it cannot name", () => {
    expect(turnPageLinks([tool("get_attribution", { scope: "fund" }, { error: "no data" }), tool("get_news", { ticker: "THC" })], null)).toEqual([]);
    expect(turnPageLinks([tool("get_daily_performance", { scope: "team", team: "Healthcare" })], null)).toEqual([]);
  });
});
