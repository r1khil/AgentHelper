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
    expect(sectionFor("/daily")).toBe("portfolio");
    expect(sectionFor("/t/tech/daily")).toBe("portfolio");
    expect(sectionFor("/backtesting")).toBe("portfolio");
    expect(sectionFor("/weekly/2026-09-25")).toBe("manage");
    expect(sectionFor("/admin/pt-sheet")).toBe("manage");
  });
});

describe("navModel", () => {
  it("follows the scope and marks the active tab", () => {
    const nav = navModel({ pathname: "/t/fund", ...exec });
    expect(nav.title).toBe("Holdings");
    expect(nav.rail.map((r) => r.href)).toEqual(["/", "/t/fund", "/t/fund/agent", "/t/fund/earnings", "/attribution"]);
    expect(nav.tabs.find((t) => t.active)?.key).toBe("holdings");
    expect(nav.back).toBeNull();
    expect(nav.manage?.href).toBe("/weekly");
    expect(navModel({ pathname: "/t/fund/movements", ...exec }).tabs.filter((t) => t.active).map((t) => t.key)).toEqual(["movements"]);
  });

  it("gives a holding and an earnings report a way back up in place of the section's tabs", () => {
    const holding = navModel({ pathname: "/t/fund/h/NVDA", ...exec });
    expect(holding.tabs).toEqual([]);
    expect(holding.back).toEqual({ label: "Holdings", href: "/t/fund" });
    expect(holding.section).toBe("holdings");
    expect(holding.rail.find((r) => r.active)?.key).toBe("holdings");

    const report = navModel({ pathname: "/t/fund/earnings/e1", ...exec });
    expect(report.tabs).toEqual([]);
    expect(report.back).toEqual({ label: "Calendar", href: "/t/fund/earnings" });
  });

  it("gives the ledger and the PT sheet read test a way back up to the page they hang off", () => {
    const ledger = navModel({ pathname: "/attribution/ledger", ...exec });
    expect(ledger.back).toEqual({ label: "Attribution", href: "/attribution" });
    expect(ledger.tabs).toEqual([]);
    expect(ledger.section).toBe("portfolio");
    expect(navModel({ pathname: "/admin/pt-sheet", ...exec }).back).toEqual({ label: "Admin", href: "/admin" });
    // The pages they hang off keep their tabs.
    expect(navModel({ pathname: "/attribution", ...exec }).back).toBeNull();
    expect(navModel({ pathname: "/admin", ...exec }).tabs.find((t) => t.active)?.key).toBe("admin");
  });

  it("keeps the way back in the scope in view", () => {
    const team = { scope: { slug: "tech" }, fundWide: false, seesBook: false };
    expect(navModel({ pathname: "/t/tech/h/NVDA", ...team }).back).toEqual({ label: "Holdings", href: "/t/tech" });
    expect(navModel({ pathname: "/t/tech/earnings/e1", ...team }).back?.href).toBe("/t/tech/earnings");
    expect(navModel({ pathname: "/t/tech/h/BRK.B/", ...team }).back?.href).toBe("/t/tech");
    // No scope (no team yet): nowhere to go back to, so nothing rather than a broken link.
    expect(navModel({ pathname: "/t/tech/h/NVDA", scope: null, fundWide: false, seesBook: false }).back).toBeNull();
  });

  it("keeps the section's tabs on master-detail pages, where the list is beside the item", () => {
    for (const [pathname, active] of [
      ["/t/fund/movements/m1", "movements"],
      ["/t/fund/models/m1", "models"],
      ["/t/fund/sell-side/c1", "sell-side"],
      ["/t/fund/agent/h/NVDA", "conversations"],
      ["/hoot/c1", "conversations"],
    ] as const) {
      const nav = navModel({ pathname, ...exec });
      expect(nav.back, pathname).toBeNull();
      expect(nav.tabs.find((t) => t.active)?.key, pathname).toBe(active);
    }
    // Lists and other scoped pages keep their tabs too.
    expect(navModel({ pathname: "/t/fund/earnings", ...exec }).back).toBeNull();
    expect(navModel({ pathname: "/t/fund/risk", ...exec }).back).toBeNull();
  });

  it("keeps team book pages under the team", () => {
    const nav = navModel({ pathname: "/t/tech/risk", scope: { slug: "tech" }, fundWide: true, seesBook: true });
    expect(nav.tabs.map((t) => t.href)).toEqual(["/t/tech/attribution", "/t/tech/daily", "/t/tech/risk", "/t/tech/exposure", "/backtesting"]);
    expect(nav.tabs.find((t) => t.active)?.key).toBe("risk");
  });

  it("puts Daily next to Attribution and marks it active", () => {
    const nav = navModel({ pathname: "/daily", ...exec });
    expect(nav.tabs.map((t) => t.key)).toEqual(["attribution", "daily", "risk", "exposure", "backtesting"]);
    expect(nav.tabs.find((t) => t.active)?.key).toBe("daily");
  });

  it("shows a general chat under Research › Chats", () => {
    const nav = navModel({ pathname: "/hoot/abc", ...exec });
    expect(nav.section).toBe("research");
    expect(nav.title).toBe("Research");
    expect(nav.tabs.find((t) => t.active)?.label).toBe("Chats");
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
    expect(names).toEqual(expect.arrayContaining(["Today", "Holdings", "Research", "Sell-side calls", "Models", "Movements", "Earnings", "Economic calendar", "Attribution", "Daily performance", "Risk", "Exposure", "Backtesting", "Weekly update", "Changelog", "Admin"]));
  });
});
