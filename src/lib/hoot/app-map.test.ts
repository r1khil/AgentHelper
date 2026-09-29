import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { destinations, sectionFor } from "@/lib/nav";
import { ADDS_MORE } from "@/components/app/risk/risk-sources";
import { APP_PAGES } from "./app-actions";
import { ADDS_MORE_MULTIPLE, APP_MAP, appMapPromptBlock, appPageContext, explainApp, GLOSSARY, pageForPath } from "./app-map";

const APP_DIR = join(process.cwd(), "src", "app", "(app)");

/** Every page.tsx under the app, as a sample URL ([team] → fig, [ticker] → AXP, other params → an id). */
function pageUrls(dir = APP_DIR): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith("_") ? [] : pageUrls(full);
    if (name !== "page.tsx") return [];
    const route = relative(APP_DIR, dir).split(sep).filter(Boolean);
    return ["/" + route.map((s) => (s === "[team]" ? "fig" : s === "[ticker]" ? "AXP" : s.startsWith("[") ? "00000000-0000-0000-0000-000000000000" : s)).join("/")];
  });
}

describe("the app map covers the app", () => {
  it("has an entry for every page in src/app/(app)", () => {
    const urls = pageUrls();
    expect(urls.length).toBeGreaterThan(25);
    // The legacy chat route only redirects to /hoot/<id>.
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
    expect(pageUrls().filter((u) => !u.startsWith("/t/fig/agent/0") && sectionFor(u) === null)).toEqual([]);
    expect(ADDS_MORE_MULTIPLE).toBe(ADDS_MORE);
  });

  it("keeps the prompt block short", () => {
    expect(appMapPromptBlock().length).toBeLessThan(2600);
  });
});

describe("pageForPath", () => {
  it("prefers the most specific route and reads its segments", () => {
    expect(pageForPath("/t/fig/h/axp")).toMatchObject({ entry: { key: "holding" }, params: { team: "fig", ticker: "AXP" } });
    expect(pageForPath("/t/fund")?.entry.key).toBe("portfolio");
    expect(pageForPath("/t/healthcare")?.entry.key).toBe("team");
    expect(pageForPath("/attribution/ledger")?.entry.key).toBe("activity");
    expect(pageForPath("/attribution?period=ytd")?.entry.key).toBe("performance");
    expect(pageForPath("/t/tech/movements/abc")).toMatchObject({ entry: { key: "movements" }, params: { id: "abc" } });
    expect(pageForPath("/admin/pt-sheet")?.entry.key).toBe("pt_sheet");
    expect(pageForPath("/nowhere")).toBeNull();
  });
});

describe("appPageContext", () => {
  it("tells Hoot which company a holding page is about", () => {
    const block = appPageContext("/t/fig/h/AXP");
    expect(block).toContain("It is Holding page");
    expect(block).toContain('read "this company", "it" and "the stock" as AXP');
  });
  it("explains the movement rule on Movements", () => {
    expect(appPageContext("/t/tech/movements")).toContain("400 bp or more");
  });
});

describe("explainApp", () => {
  it("finds pages by name, key or path, and says who can open them", () => {
    expect(explainApp({ page: "Exposure", role: "associate_analyst" }).page).toMatchObject({ key: "exposure", memberCanOpen: false, whoCanOpen: "the team's lead analyst, execs and admins" });
    expect(explainApp({ page: "weekly update", role: "exec" }).page).toMatchObject({ key: "weekly", memberCanOpen: true });
    expect(explainApp({ page: "Risk", role: "lead_analyst" }).page).toMatchObject({ memberCanOpen: "own team" });
    expect(explainApp({ page: "Weekly update", role: "lead_analyst" }).page).toMatchObject({ memberCanOpen: false });
    expect(explainApp({ page: "/t/fig/economic-calendar", role: "exec" }).page?.key).toBe("economic_calendar");
  });
  it("defines terms, and lists everything when asked for nothing", () => {
    expect(explainApp({ term: "Active share", role: "exec" }).terms?.[0].meaning).toMatch(/60%/);
    expect(explainApp({ term: "selection", role: "exec" }).terms?.map((t) => t.term)).toContain("selection");
    expect(explainApp({ role: "exec" }).pages).toHaveLength(APP_MAP.length);
    expect(explainApp({ page: "moon base", role: "exec" }).error).toMatch(/^No page "moon base"/);
    expect(Object.keys(GLOSSARY).length).toBeGreaterThan(30);
  });
});
