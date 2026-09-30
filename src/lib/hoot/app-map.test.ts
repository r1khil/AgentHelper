import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { destinations, sectionFor } from "@/lib/nav";
import { ADDS_MORE } from "@/components/app/risk/risk-sources";
import { APP_PAGES } from "./app-actions";
import { ADDS_MORE_MULTIPLE, APP_MAP, appMapPromptBlock, appPageContext, explainApp, GLOSSARY, pageForPath } from "./app-map";

const APP_DIR = join(process.cwd(), "src", "app", "(app)");

/**
 * Every page.tsx under the app, as a sample URL ([team] → fig, [ticker] → AXP, other params → an id; route groups
 * like (portfolio) are not in the URL). `redirects: false` leaves out pages that only redirect (addresses from before
 * the five screens).
 */
function pageUrls(dir = APP_DIR, redirects = true): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith("_") ? [] : pageUrls(full, redirects);
    if (name !== "page.tsx") return [];
    const source = readFileSync(full, "utf8");
    const redirectOnly = /\bredirect\(/.test(source) && !/return \(/.test(source);
    if (!redirects && redirectOnly) return [];
    const route = relative(APP_DIR, dir).split(sep).filter((s) => s && !/^\(.+\)$/.test(s));
    return ["/" + route.map((s) => (s === "[team]" ? "fig" : s === "[ticker]" ? "AXP" : s.startsWith("[") ? "00000000-0000-0000-0000-000000000000" : s)).join("/")];
  });
}

describe("the app map covers the app", () => {
  it("has an entry for every page in src/app/(app)", () => {
    const urls = pageUrls();
    expect(urls.length).toBeGreaterThan(20);
    // A redirect is mapped as the page it opens, except the legacy chat route (a thread by another address).
    const unmapped = urls.filter((u) => !pageForPath(u) && u !== "/t/fig/agent/00000000-0000-0000-0000-000000000000");
    expect(unmapped).toEqual([]);
  });

  it("has an entry for every page Hoot can navigate to and every sidebar destination", () => {
    const navigable = new Set(APP_MAP.flatMap((e) => (e.navigate ? [e.navigate] : [])));
    expect([...Object.keys(APP_PAGES), "holding"].filter((k) => !navigable.has(k as never))).toEqual([]);
    for (const scope of [{ slug: "fig" }, "fund"] as const)
      for (const d of destinations({ scope, fundWide: true, seesBook: true })) expect(pageForPath(d.href), d.href).not.toBeNull();
  });

  it("puts every page in a sidebar section, and uses the Risk page's own Adds-more rule", () => {
    expect(pageUrls(APP_DIR, false).filter((u) => sectionFor(u) === null)).toEqual([]);
    expect(ADDS_MORE_MULTIPLE).toBe(ADDS_MORE);
  });

  it("keeps the prompt block short, and says where the old pages went", () => {
    expect(appMapPromptBlock().length).toBeLessThan(2600);
    expect(appMapPromptBlock()).toMatch(/Backtesting is What if/);
  });
});

describe("pageForPath", () => {
  it("prefers the most specific route and reads its segments", () => {
    expect(pageForPath("/t/fig/h/axp")).toMatchObject({ entry: { key: "holding" }, params: { team: "fig", ticker: "AXP" } });
    expect(pageForPath("/t/fund")?.entry.key).toBe("portfolio");
    expect(pageForPath("/t/healthcare")?.entry.key).toBe("portfolio");
    expect(pageForPath("/t/fund/activity")?.entry.key).toBe("activity");
    expect(pageForPath("/t/fund/performance?period=today")?.entry.key).toBe("performance");
    expect(pageForPath("/t/fund/what-if")?.entry.key).toBe("what_if");
    expect(pageForPath("/markets")?.entry.key).toBe("markets");
    expect(pageForPath("/hoot/c1")?.entry.key).toBe("thread");
    expect(pageForPath("/t/tech/movements/abc")).toBeNull();
    // Addresses from before the five screens map to where they redirect.
    expect(pageForPath("/attribution/ledger")?.entry.key).toBe("activity");
    expect(pageForPath("/attribution?period=ytd")?.entry.key).toBe("performance");
    expect(pageForPath("/t/tech/daily")?.entry.key).toBe("performance");
    expect(pageForPath("/hoot")?.entry.key).toBe("threads");
    expect(pageForPath("/t/tech/agent")?.entry.key).toBe("home");
    expect(pageForPath("/t/tech/agent/h/NVDA")).toMatchObject({ entry: { key: "holding" }, params: { ticker: "NVDA" } });
    expect(pageForPath("/admin/pt-sheet")?.entry.key).toBe("pt_sheet");
    expect(pageForPath("/nowhere")).toBeNull();
  });
});

describe("appPageContext", () => {
  it("tells Hoot which company a holding page is about", () => {
    const block = appPageContext("/t/fig/h/AXP");
    expect(block).toContain("It is Holding: everything about one holding");
    expect(block).toContain('read "this company", "it" and "the stock" as AXP');
  });
});

describe("explainApp", () => {
  it("finds pages by name, key or path, and says who can open them", () => {
    expect(explainApp({ page: "Exposure", role: "associate_analyst" }).page).toMatchObject({ key: "exposure", memberCanOpen: false, whoCanOpen: "the team's lead analyst, execs and admins" });
    expect(explainApp({ page: "weekly update", role: "exec" }).page).toMatchObject({ key: "weekly", memberCanOpen: true });
    expect(explainApp({ page: "Risk", role: "lead_analyst" }).page).toMatchObject({ memberCanOpen: "own team" });
    expect(explainApp({ page: "Weekly update", role: "lead_analyst" }).page).toMatchObject({ memberCanOpen: false });
    expect(explainApp({ page: "/t/fig/economic-calendar", role: "exec" }).page?.key).toBe("markets");
    expect(explainApp({ page: "What if", role: "associate_analyst" }).page).toMatchObject({ key: "what_if", memberCanOpen: true });
    expect(explainApp({ page: "sidebar", role: "associate_analyst" }).page?.summary).toMatch(/Threads/);
  });
  it("finds a page by what it used to be called", () => {
    expect(explainApp({ page: "Backtesting", role: "exec" }).page?.key).toBe("what_if");
    expect(explainApp({ page: "research", role: "exec" }).page?.key).toBe("threads");
    expect(explainApp({ page: "economic calendar", role: "exec" }).page?.key).toBe("markets");
    expect(explainApp({ page: "attribution", role: "exec" }).page?.key).toBe("performance");
    expect(explainApp({ page: "team page", role: "exec" }).page?.key).toBe("portfolio");
    expect(explainApp({ page: "Changelog", role: "exec" }).page?.key).toBe("changelog");
  });
  it("defines terms, and lists everything when asked for nothing", () => {
    expect(explainApp({ term: "Active share", role: "exec" }).terms?.[0].meaning).toMatch(/60%/);
    expect(explainApp({ term: "selection", role: "exec" }).terms?.map((t) => t.term)).toContain("selection");
    expect(explainApp({ role: "exec" }).pages).toHaveLength(APP_MAP.length);
    expect(explainApp({ page: "moon base", role: "exec" }).error).toMatch(/^No page "moon base"/);
    expect(Object.keys(GLOSSARY).length).toBeGreaterThan(30);
  });
});
