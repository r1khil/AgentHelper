import { describe, expect, it } from "vitest";
import { destinations, navModel, sectionFor } from "./nav";

const exec = { scope: "fund" as const, fundWide: true, seesBook: true };

describe("sectionFor", () => {
  it("puts every page under one rail destination", () => {
    expect(sectionFor("/")).toBe("today");
    expect(sectionFor("/t/tech")).toBe("holdings");
    expect(sectionFor("/t/tech/h/NVDA")).toBe("holdings");
    expect(sectionFor("/t/tech/movements/abc")).toBe("holdings");
    expect(sectionFor("/t/tech/models/m1")).toBe("holdings");
    expect(sectionFor("/t/tech/agent/h/NVDA")).toBe("research");
    expect(sectionFor("/hoot/c1")).toBe("research");
    expect(sectionFor("/t/tech/sell-side/c2")).toBe("research");
    expect(sectionFor("/t/tech/earnings/e1")).toBe("calendar");
    expect(sectionFor("/t/fund/economic-calendar")).toBe("calendar");
    expect(sectionFor("/attribution/ledger")).toBe("portfolio");
    expect(sectionFor("/t/tech/risk")).toBe("portfolio");
    expect(sectionFor("/backtesting")).toBe("portfolio");
    expect(sectionFor("/weekly/2026-09-25")).toBe("manage");
    expect(sectionFor("/admin/pt-sheet")).toBe("manage");
  });
});

describe("navModel", () => {
  it("follows the scope and marks the active tab", () => {
    const nav = navModel({ pathname: "/t/fund/h/NVDA", ...exec });
    expect(nav.title).toBe("Holdings");
    expect(nav.rail.map((r) => r.href)).toEqual(["/", "/t/fund", "/t/fund/agent", "/t/fund/earnings", "/attribution"]);
    expect(nav.tabs.find((t) => t.active)?.key).toBe("holdings");
    expect(nav.manage?.href).toBe("/weekly");
  });

  it("keeps team book pages under the team", () => {
    const nav = navModel({ pathname: "/t/tech/risk", scope: { slug: "tech" }, fundWide: true, seesBook: true });
    expect(nav.tabs.map((t) => t.href)).toEqual(["/t/tech/attribution", "/t/tech/risk", "/t/tech/exposure", "/backtesting"]);
    expect(nav.tabs.find((t) => t.active)?.key).toBe("risk");
  });

  it("shows a general conversation under Conversations", () => {
    const nav = navModel({ pathname: "/hoot/abc", ...exec });
    expect(nav.section).toBe("research");
    expect(nav.tabs.find((t) => t.active)?.key).toBe("conversations");
  });

  it("gives analysts without the book only Backtesting, and no Manage", () => {
    const nav = navModel({ pathname: "/backtesting", scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(nav.rail.find((r) => r.key === "portfolio")?.href).toBe("/backtesting");
    expect(nav.tabs.map((t) => t.key)).toEqual(["backtesting"]);
    expect(nav.manage).toBeNull();
  });

  it("has no tabs on Today or the Calendar", () => {
    expect(navModel({ pathname: "/", ...exec }).tabs).toEqual([]);
    expect(navModel({ pathname: "/t/fund/earnings", ...exec }).tabs).toEqual([]);
  });
});

describe("destinations", () => {
  it("names pages the way Hoot's commands do", () => {
    const names = destinations(exec).map((d) => d.hoot).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["Today", "Holdings", "Hoot", "Sell-side analyzer", "Models", "Movements", "Earnings", "Economic calendar", "Attribution", "Risk", "Exposure", "Backtesting", "Weekly update", "Changelog", "Admin"]));
  });
});
