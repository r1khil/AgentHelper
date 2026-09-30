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
    ["Take me to holdings", "Portfolio"], ["bring me to the risk page", "Risk"],
    ["Open sell-side calls", "Sell-side calls"], ["Open sell-side analyzer", "Sell-side calls"], ["go to sell side", "Sell-side calls"],
    ["Can you take me to the economic calendar?", "Markets"], ["go to earnings", "Markets"], ["open markets", "Markets"],
    ["go to backtesting", "What if"], ["open what if", "What if"], ["open the attribution page", "Performance"], ["navigate to the weekly update section", "Weekly update"],
    ["take me to research", "Threads"], ["go to conversations", "Threads"], ["open the agent page", "Threads"], ["open all threads", "Threads"], ["open hoot", "Home"],
    ["open models", "Models"], ["go to the ledger", "Activity"], ["open what's new", "Changelog"],
    ["take me to the portfolio", "Portfolio"], ["open portfolio", "Portfolio"],
  ])("recognizes %s", (text, destination) => expect(parseHootCommand(text)).toEqual({ kind: "navigate", destination }));

  it("opens a view of a page by its old name", () => {
    expect(parseHootCommand("go to daily performance")).toEqual({ kind: "navigate", destination: "Performance", query: "?period=today" });
    expect(parseHootCommand("open the daily page")).toEqual({ kind: "navigate", destination: "Performance", query: "?period=today" });
  });

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
    expect(commandHref("Risk", [{ label: "Risk", href: "/t/fund/risk" }])).toBe("/t/fund/risk");
    expect(commandHref("Admin", [{ label: "Portfolio", href: "/t/tech" }])).toBeNull();
    // Without the book there is no Performance link, so the command falls to Hoot, who says why.
    expect(commandHref("Performance", [{ label: "Portfolio", href: "/t/tech" }, { label: "What if", href: "/t/tech/what-if" }])).toBeNull();
  });
  it("matches only the scope choices rendered for the member", () => {
    const links = [{ label: "Whole fund", href: "/t/fund/risk" }, { label: "Financials", href: "/t/financials/risk" }];
    expect(scopeHref("financials", links)).toBe("/t/financials/risk");
    expect(scopeHref("fund", links)).toBe("/t/fund/risk");
    expect(scopeHref("technology", links)).toBeNull();
  });
  it("finds a team by its short name or one word of its name, and FIG as financials", () => {
    const links = [
      { label: "Whole fund", href: "/t/fund" },
      { label: "FIG", href: "/t/fig" },
      { label: "Information Technology", href: "/t/tech" },
      { label: "Consumer & Communication Services", href: "/t/consumer" },
    ];
    expect(scopeHref("fig", links)).toBe("/t/fig");
    expect(scopeHref("financials", links)).toBe("/t/fig");
    expect(scopeHref("tech", links)).toBe("/t/tech");
    expect(scopeHref("technology", links)).toBe("/t/tech");
    expect(scopeHref("consumer", links)).toBe("/t/consumer");
    expect(scopeHref("healthcare", links)).toBeNull();
    expect(scopeHref("services", links)).toBe("/t/consumer");
  });
  it.each(["https://example.com", "//example.com", "javascript:alert(1)", "/\\example.com"]) ("rejects unsafe routes: %s", (href) => {
    expect(commandHref("Risk", [{ label: "Risk", href }])).toBeNull();
  });
});
