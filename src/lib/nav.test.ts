import { describe, expect, it } from "vitest";
import { destinations, navModel, portfolioViewFor, portfolioViews, sectionFor } from "./nav";

const exec = { scope: "fund" as const, fundWide: true, seesBook: true };

describe("sectionFor", () => {
  it("puts every page in one of the five screens, or under the account menu", () => {
    expect(sectionFor("/")).toBe("home");
    expect(sectionFor("/hoot/c1")).toBe("thread");
    expect(sectionFor("/hoot")).toBe("thread");
    expect(sectionFor("/markets")).toBe("markets");
    expect(sectionFor("/screener")).toBe("screener");
    expect(sectionFor("/screener/KRE")).toBe("screener");
    expect(sectionFor("/t/fund")).toBe("portfolio");
    expect(sectionFor("/t/tech")).toBe("portfolio");
    expect(sectionFor("/t/tech/risk")).toBe("portfolio");
    expect(sectionFor("/t/fund/what-if")).toBe("portfolio");
    expect(sectionFor("/t/fund/activity")).toBe("portfolio");
    expect(sectionFor("/t/fund/h/NVDA")).toBe("holding");
    expect(sectionFor("/t/tech/models/m1")).toBe("holding");
    expect(sectionFor("/t/tech/sell-side/c2")).toBe("holding");
    expect(sectionFor("/t/tech/earnings/e1")).toBe("holding");
    expect(sectionFor("/t/fund/earnings")).toBe("markets");
    expect(sectionFor("/t/fund/economic-calendar")).toBe("markets");
    expect(sectionFor("/weekly/2026-09-25")).toBe("weekly");
    expect(sectionFor("/changelog")).toBe("changelog");
    expect(sectionFor("/admin/pt-sheet")).toBe("admin");
    // Addresses from before the five screens redirect in next.config, so they belong nowhere.
    expect(sectionFor("/attribution")).toBeNull();
    expect(sectionFor("/t/tech/agent")).toBeNull();
  });
});

describe("portfolio views", () => {
  it("reads the view from the URL", () => {
    expect(portfolioViewFor("/t/fund")).toBe("positions");
    expect(portfolioViewFor("/t/fund/")).toBe("positions");
    expect(portfolioViewFor("/t/tech/performance")).toBe("performance");
    expect(portfolioViewFor("/t/fund/what-if")).toBe("what-if");
    expect(portfolioViewFor("/t/fund/h/NVDA")).toBeNull();
    expect(portfolioViewFor("/t/fund/models")).toBeNull();
  });

  it("gives the fund all six to execs, and a team's book without Activity", () => {
    expect(portfolioViews("fund", exec).map((v) => v.href)).toEqual(["/t/fund", "/t/fund/performance", "/t/fund/risk", "/t/fund/exposure", "/t/fund/activity", "/t/fund/what-if"]);
    expect(portfolioViews({ slug: "tech" }, exec).map((v) => v.key)).toEqual(["positions", "performance", "risk", "exposure", "what-if"]);
  });

  it("keeps the book's views from members who can't see position sizes", () => {
    expect(portfolioViews({ slug: "tech" }, { fundWide: false, seesBook: false }).map((v) => v.key)).toEqual(["positions", "what-if"]);
    expect(portfolioViews(null, exec)).toEqual([]);
  });
});

describe("navModel: the sidebar", () => {
  it("opens the fund's Portfolio for execs and admins, whatever scope is in view", () => {
    const nav = navModel({ pathname: "/t/tech/risk", scope: { slug: "tech" }, home: "fund", fundWide: true, seesBook: true });
    expect(nav.main.map((i) => [i.key, i.href])).toEqual([
      ["portfolio", "/t/fund"],
      ["markets", "/markets"],
      ["screener", "/screener"],
    ]);
    expect(nav.main.find((i) => i.active)?.key).toBe("portfolio");
  });

  it("opens a member's own team, and marks Portfolio on a holding and the Weekly update", () => {
    expect(navModel({ pathname: "/", scope: { slug: "health" }, fundWide: false, seesBook: true }).main.find((i) => i.key === "portfolio")?.href).toBe("/t/health");
    expect(navModel({ pathname: "/t/fund/h/NVDA", ...exec }).main.find((i) => i.active)?.key).toBe("portfolio");
    expect(navModel({ pathname: "/weekly", ...exec }).main.find((i) => i.active)?.key).toBe("portfolio");
    expect(navModel({ pathname: "/markets", ...exec }).main.find((i) => i.active)?.key).toBe("markets");
    expect(navModel({ pathname: "/", ...exec }).main.some((i) => i.active)).toBe(false);
  });

  it("drops the Portfolio for a member with no team yet", () => {
    expect(navModel({ pathname: "/", scope: null, fundWide: false, seesBook: false }).main.map((i) => i.key)).toEqual(["markets", "screener"]);
  });
});

describe("navModel: the default header", () => {
  it("sends a holding and its models, calls and reports back to the Portfolio", () => {
    for (const pathname of ["/t/fund/h/NVDA", "/t/fund/models/m1", "/t/fund/earnings/e1"]) {
      const nav = navModel({ pathname, ...exec });
      expect(nav.back, pathname).toEqual({ label: "Portfolio", href: "/t/fund" });
      expect(nav.crumbs, pathname).toEqual([{ label: "Portfolio", href: "/t/fund" }]);
    }
    // No scope (no team yet): nowhere to go back to, so nothing rather than a broken link.
    expect(navModel({ pathname: "/t/tech/h/NVDA", scope: null, fundWide: false, seesBook: false }).back).toBeNull();
    expect(navModel({ pathname: "/admin/pt-sheet", ...exec }).back).toEqual({ label: "Admin", href: "/admin" });
    expect(navModel({ pathname: "/weekly", ...exec }).crumbs).toEqual([{ label: "Weekly update" }]);
  });

  it("has no header tabs anywhere: the Portfolio's views are on the page", () => {
    for (const pathname of ["/", "/t/fund", "/t/fund/risk", "/markets", "/hoot/c1"]) expect(navModel({ pathname, ...exec }).tabs, pathname).toEqual([]);
  });
});

describe("destinations", () => {
  it("names the five screens and the Portfolio's views", () => {
    expect(destinations(exec).map((d) => d.hoot)).toEqual([
      "Home",
      "Portfolio",
      "Performance",
      "Risk",
      "Exposure",
      "Activity",
      "What if",
      "Markets",
      "Screener",
      "Threads",
      "Models",
      "Sell-side calls",
      "Weekly update",
      "Changelog",
      "Admin",
    ]);
    expect(destinations({ scope: { slug: "tech" }, fundWide: false, seesBook: false }).map((d) => d.href)).toEqual([
      "/",
      "/t/tech",
      "/t/tech/what-if",
      "/markets",
      "/screener",
      "/hoot",
      "/t/tech/models",
      "/t/tech/sell-side",
    ]);
    expect(destinations({ scope: null, fundWide: false, seesBook: false }).map((d) => d.href)).toEqual(["/", "/markets", "/screener", "/hoot"]);
  });
});
