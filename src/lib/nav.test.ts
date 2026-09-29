import { describe, expect, it } from "vitest";
import { destinations, navModel, sectionFor } from "./nav";

const exec = { scope: "fund" as const, fundWide: true, seesBook: true };
const tabKeys = (pathname: string, input: Omit<Parameters<typeof navModel>[0], "pathname"> = exec) => navModel({ pathname, ...input }).tabs.map((t) => t.key);
const activeTab = (pathname: string, input: Omit<Parameters<typeof navModel>[0], "pathname"> = exec) => navModel({ pathname, ...input }).tabs.find((t) => t.active)?.key;

describe("sectionFor", () => {
  it("puts every page under one sidebar destination", () => {
    expect(sectionFor("/")).toBe("home");
    expect(sectionFor("/t/fund")).toBe("portfolio");
    expect(sectionFor("/t/fund/h/NVDA")).toBe("portfolio");
    expect(sectionFor("/t/tech")).toBe("team");
    expect(sectionFor("/t/tech/h/NVDA")).toBe("team");
    expect(sectionFor("/t/tech/movements/abc")).toBe("movements");
    expect(sectionFor("/t/tech/models/m1")).toBe("models");
    expect(sectionFor("/t/tech/agent/h/NVDA")).toBe("research");
    expect(sectionFor("/hoot/c1")).toBe("research");
    expect(sectionFor("/t/tech/sell-side/c2")).toBe("research");
    expect(sectionFor("/t/tech/earnings/e1")).toBe("calendar");
    expect(sectionFor("/t/fund/economic-calendar")).toBe("calendar");
    expect(sectionFor("/attribution/ledger")).toBe("portfolio");
    expect(sectionFor("/t/tech/risk")).toBe("portfolio");
    expect(sectionFor("/daily")).toBe("portfolio");
    expect(sectionFor("/t/tech/daily")).toBe("portfolio");
    expect(sectionFor("/backtesting")).toBe("portfolio");
    expect(sectionFor("/weekly/2026-09-25")).toBe("weekly");
    expect(sectionFor("/changelog")).toBe("changelog");
    expect(sectionFor("/admin/pt-sheet")).toBe("admin");
  });
});

describe("navModel: the sidebar", () => {
  it("opens the fund's pages for execs and admins, whatever scope is in view", () => {
    const nav = navModel({ pathname: "/t/tech/risk", scope: { slug: "tech" }, home: "fund", fundWide: true, seesBook: true, homeSeesBook: true });
    expect(nav.main.map((i) => [i.key, i.href])).toEqual([
      ["home", "/"],
      ["portfolio", "/t/fund"],
      ["research", "/t/fund/agent"],
      ["movements", "/t/fund/movements"],
      ["models", "/t/fund/models"],
      ["calendar", "/t/fund/earnings"],
    ]);
    expect(nav.main.find((i) => i.active)?.key).toBe("portfolio");
    expect(nav.manage.map((i) => i.href)).toEqual(["/weekly", "/changelog", "/admin"]);
  });

  it("opens a lead's own team, with Portfolio on the team's Performance", () => {
    const nav = navModel({ pathname: "/", scope: { slug: "health" }, fundWide: false, seesBook: true });
    expect(nav.main.find((i) => i.key === "portfolio")?.href).toBe("/t/health/attribution");
    expect(nav.main.find((i) => i.key === "movements")?.href).toBe("/t/health/movements");
    expect(nav.main.find((i) => i.active)?.key).toBe("home");
    expect(nav.manage).toEqual([]);
  });

  it("sends members without the book to Backtesting", () => {
    const nav = navModel({ pathname: "/backtesting", scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(nav.main.find((i) => i.key === "portfolio")?.href).toBe("/backtesting");
    expect(nav.tabs).toEqual([]);
  });

  it("drops the scoped places for a member with no team yet", () => {
    const nav = navModel({ pathname: "/", scope: null, fundWide: false, seesBook: false });
    expect(nav.main.map((i) => i.key)).toEqual(["home", "portfolio"]);
  });
});

describe("navModel: the page header", () => {
  it("gives the fund's Portfolio six tabs and marks the one in view", () => {
    expect(tabKeys("/t/fund")).toEqual(["overview", "activity", "performance", "risk", "exposure", "backtesting"]);
    expect(navModel({ pathname: "/t/fund", ...exec }).tabs.map((t) => t.href)).toEqual(["/t/fund", "/attribution/ledger", "/attribution", "/risk", "/exposure", "/backtesting"]);
    expect(activeTab("/t/fund")).toBe("overview");
    expect(activeTab("/attribution/ledger")).toBe("activity");
    expect(activeTab("/attribution")).toBe("performance");
    expect(activeTab("/risk")).toBe("risk");
    expect(activeTab("/backtesting")).toBe("backtesting");
  });

  it("treats Daily as the Today period of Performance", () => {
    expect(activeTab("/daily")).toBe("performance");
    expect(activeTab("/t/tech/daily", { scope: { slug: "tech" }, fundWide: true, seesBook: true })).toBe("performance");
  });

  it("gives a team's Portfolio its own book pages and Backtesting", () => {
    const team = { scope: { slug: "tech" }, fundWide: true, seesBook: true };
    expect(navModel({ pathname: "/t/tech/risk", ...team }).tabs.map((t) => t.href)).toEqual(["/t/tech/attribution", "/t/tech/risk", "/t/tech/exposure", "/backtesting"]);
    expect(activeTab("/t/tech/risk", team)).toBe("risk");
  });

  it("leaves Activity to execs and admins", () => {
    // A lead viewing the fund can't, but the tabs never offer the ledger to anyone who isn't fund-wide.
    expect(tabKeys("/t/fund", { scope: "fund", fundWide: false, seesBook: true })).not.toContain("activity");
  });

  it("gives Research and the Calendar their two tabs, a general chat included", () => {
    expect(navModel({ pathname: "/t/fund/agent", ...exec }).tabs.map((t) => t.label)).toEqual(["Chats and boards", "Sell-side calls"]);
    expect(activeTab("/hoot/abc")).toBe("chats");
    expect(activeTab("/t/fund/agent/h/NVDA")).toBe("chats");
    expect(activeTab("/t/fund/sell-side/c1")).toBe("sell-side");
    expect(navModel({ pathname: "/t/fund/economic-calendar", ...exec }).tabs.map((t) => t.label)).toEqual(["Earnings", "Economic releases"]);
    expect(activeTab("/t/fund/earnings")).toBe("earnings");
  });

  it("gives a holding and one earnings report a breadcrumb back instead of tabs", () => {
    const holding = navModel({ pathname: "/t/fund/h/NVDA", ...exec });
    expect(holding.tabs).toEqual([]);
    expect(holding.back).toEqual({ label: "Portfolio", href: "/t/fund" });
    expect(holding.crumbs).toEqual([{ label: "Portfolio", href: "/t/fund" }]);

    const teamHolding = navModel({ pathname: "/t/tech/h/BRK.B/", scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(teamHolding.back).toEqual({ label: "Teams", href: "/t/tech" });

    const report = navModel({ pathname: "/t/fund/earnings/e1", ...exec });
    expect(report.tabs).toEqual([]);
    expect(report.back).toEqual({ label: "Calendar", href: "/t/fund/earnings" });
    // No scope (no team yet): nowhere to go back to, so nothing rather than a broken link.
    expect(navModel({ pathname: "/t/tech/h/NVDA", scope: null, fundWide: false, seesBook: false }).back).toBeNull();
  });

  it("has no tabs on Home, a team page, Movements, Models or Manage", () => {
    for (const pathname of ["/", "/t/tech", "/t/fund/movements/m1", "/t/fund/models", "/weekly", "/changelog", "/admin"]) {
      expect(navModel({ pathname, ...exec }).tabs, pathname).toEqual([]);
    }
    expect(navModel({ pathname: "/admin/pt-sheet", ...exec }).back).toEqual({ label: "Admin", href: "/admin" });
    expect(navModel({ pathname: "/weekly", ...exec }).crumbs).toEqual([{ label: "Weekly update" }]);
  });
});

describe("destinations", () => {
  it("names pages the way Hoot's commands do", () => {
    const names = destinations(exec).map((d) => d.hoot).filter(Boolean);
    expect(names).toEqual(
      expect.arrayContaining(["Home", "Portfolio", "Research", "Sell-side calls", "Models", "Movements", "Earnings", "Economic calendar", "Attribution", "Daily performance", "Risk", "Exposure", "Backtesting", "Activity", "Weekly update", "Changelog", "Admin"]),
    );
    expect(destinations({ scope: { slug: "tech" }, fundWide: false, seesBook: false }).map((d) => d.hoot)).toContain("Holdings");
  });
});
