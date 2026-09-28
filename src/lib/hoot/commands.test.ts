import { describe, expect, it } from "vitest";
import { commandHref, parseHootCommand, scopeHref } from "./commands";

describe("Hoot UI commands", () => {
  it.each([
    ["Turn on light mode", "light"], ["turn light mode on", "light"],
    ["Hoot, could you please turn off light mode?", "dark"], ["turn light mode off", "dark"],
    ["disable dark mode", "light"], ["switch to dark mode please", "dark"],
    ["set the website to system theme", "system"], ["toggle the theme", "toggle"],
  ])("recognizes %s", (text, theme) => expect(parseHootCommand(text)).toEqual({ kind: "theme", theme }));

  it.each([
    ["Take me to holdings", "Holdings"], ["bring me to the risk page", "Risk"],
    ["Open sell-side analyzer", "Sell-side analyzer"], ["Can you take me to the economic calendar?", "Economic calendar"],
    ["go to backtesting", "Backtesting"], ["navigate to the weekly update section", "Weekly update"],
    ["take me to research", "Research"], ["open hoot", "Research"], ["go to conversations", "Research"], ["open the agent page", "Research"],
  ])("recognizes %s", (text, destination) => expect(parseHootCommand(text)).toEqual({ kind: "navigate", destination }));

  it.each([
    ["switch me to technology sector", "technology"],
    ["Hoot, bring me to the financials sector", "financials"],
    ["show me the consumer discretionary sector", "consumer discretionary"],
    ["filter to whole fund sector", "whole fund"],
    ["switch to the whole fund", "whole fund"],
  ])("recognizes scope command %s", (text, scope) => expect(parseHootCommand(text)).toEqual({ kind: "scope", scope }));

  it.each([
    "What moved our holdings today?", "Show me earnings growth for AAPL", "Show me earnings", "show me the risk", "Explain light mode",
    "Don't turn on light mode", 'The document says "open admin"', "Open https://example.com",
    "open javascript:alert(1)", "turn on light mode and explain risk", "How do I turn on light mode?",
    "show me earnings for the financials sector", "show me the risk in the energy sector", "switch to holdings",
    "switch me to the risk page", "change to a more defensive allocation", "switch to value stocks", "switch to light",
    "go to the team", "open my team",
  ])("leaves research and noncommands untouched: %s", (text) => expect(parseHootCommand(text)).toBeNull());

  it("uses the current member's scoped links and refuses unavailable destinations", () => {
    expect(commandHref("Risk", [{ label: "Risk", href: "/t/tech/risk" }])).toBe("/t/tech/risk");
    expect(commandHref("Risk", [{ label: "Risk", href: "/risk" }])).toBe("/risk");
    expect(commandHref("Admin", [{ label: "Holdings", href: "/t/tech" }])).toBeNull();
  });
  it("matches only the scope choices rendered for the member", () => {
    const links = [{ label: "Whole fund", href: "/t/fund/risk" }, { label: "Financials", href: "/t/financials/risk" }];
    expect(scopeHref("financials", links)).toBe("/t/financials/risk");
    expect(scopeHref("fund", links)).toBe("/t/fund/risk");
    expect(scopeHref("technology", links)).toBeNull();
  });
  it.each(["https://example.com", "//example.com", "javascript:alert(1)", "/\\example.com"]) ("rejects unsafe routes: %s", (href) => {
    expect(commandHref("Risk", [{ label: "Risk", href }])).toBeNull();
  });
});
