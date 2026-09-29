import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BackLink, FilterChip, FilterChips, Segmented } from "./panel";
import { TabbedPanels, Tabs, tabIds, tabKeyTarget, tabPanelProps } from "./tabs";

const noop = () => {};

describe("Tabs", () => {
  it("renders link tabs as navigation, the current one marked as the page", () => {
    const html = renderToStaticMarkup(
      h(Tabs, {
        label: "Holding sections",
        items: [
          { key: "overview", label: "Overview", href: "/t/fund/h/NVDA", active: true },
          { key: "notes", label: "Notes", href: "/t/fund/h/NVDA?tab=notes", active: false, count: 3 },
        ],
      }),
    );
    expect(html).toMatch(/^<nav aria-label="Holding sections"/);
    expect(html).not.toContain('role="tab');
    expect(html).toContain('href="/t/fund/h/NVDA?tab=notes"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(">3</span>");
    // The one underline style.
    expect(html).toContain("shadow-[inset_0_-2px_0_var(--foreground)]");
  });

  it("renders in-place tabs as a tablist tied to their panels, only the selected one in the Tab order", () => {
    const html = renderToStaticMarkup(
      h(Tabs, {
        label: "Call views",
        idBase: "c1",
        onSelect: noop,
        items: [
          { key: "brief", label: "Brief", active: false },
          { key: "transcript", label: "Transcript", active: true },
        ],
      }),
    );
    expect(html).toMatch(/^<div role="tablist" aria-label="Call views"/);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('id="c1-tab-transcript" aria-controls="c1-panel-transcript" aria-selected="true" tabindex="0"');
    expect(html).toContain('id="c1-tab-brief" aria-controls="c1-panel-brief" aria-selected="false" tabindex="-1"');
  });

  it("keeps the first tab reachable when none is selected", () => {
    const html = renderToStaticMarkup(h(Tabs, { label: "x", onSelect: noop, items: [{ key: "a", label: "A", active: false }, { key: "b", label: "B", active: false }] }));
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.indexOf('tabindex="0"')).toBeLessThan(html.indexOf('tabindex="-1"'));
  });

  it("shows only the chosen panel of TabbedPanels, labelled by its tab", () => {
    const html = renderToStaticMarkup(
      h(TabbedPanels, {
        label: "Ledger tables",
        idBase: "ledger",
        initial: "cash",
        tabs: [
          { key: "trades", label: "Trades" },
          { key: "cash", label: "Cash" },
        ],
        panels: { trades: h("p", null, "TRADES"), cash: h("p", null, "CASH") },
      }),
    );
    expect(html).toContain('<div role="tabpanel" id="ledger-panel-cash" aria-labelledby="ledger-tab-cash"');
    expect(html).toContain("CASH");
    expect(html).not.toContain("TRADES");
  });
});

describe("tab helpers", () => {
  it("moves focus with the arrow keys, Home and End, wrapping at the ends", () => {
    expect(tabKeyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(tabKeyTarget("ArrowRight", 2, 3)).toBe(0);
    expect(tabKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(tabKeyTarget("Home", 2, 3)).toBe(0);
    expect(tabKeyTarget("End", 0, 3)).toBe(2);
    expect(tabKeyTarget("Enter", 0, 3)).toBeNull();
    expect(tabKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });

  it("ties a tab to its panel by id", () => {
    expect(tabIds("weekly-pack", "email")).toEqual({ tab: "weekly-pack-tab-email", panel: "weekly-pack-panel-email" });
    expect(tabPanelProps("weekly-pack", "email")).toEqual({ role: "tabpanel", id: "weekly-pack-panel-email", "aria-labelledby": "weekly-pack-tab-email" });
  });
});

describe("Segmented", () => {
  it("marks the chosen link segment current and button segments pressed", () => {
    const links = renderToStaticMarkup(
      h(Segmented, {
        label: "Layout",
        segments: [
          { key: "week", label: "Week", href: "/c?view=week", active: true },
          { key: "month", label: "Month", href: "/c?view=month", active: false },
        ],
      }),
    );
    expect(links).toMatch(/^<div role="group" aria-label="Layout"/);
    expect(links.match(/aria-current="true"/g)).toHaveLength(1);

    const buttons = renderToStaticMarkup(
      h(Segmented, {
        label: "Theme",
        segments: [
          { key: "light", label: "L", ariaLabel: "Light", active: false, onClick: noop },
          { key: "dark", label: "D", ariaLabel: "Dark", active: true, onClick: noop },
        ],
      }),
    );
    expect(buttons).toContain('aria-pressed="true" aria-label="Dark"');
    expect(buttons).toContain('aria-pressed="false" aria-label="Light"');
  });

  it("shows a disabled segment, and a lone static one, as text rather than a control", () => {
    const html = renderToStaticMarkup(
      h(Segmented, {
        label: "Sector weights",
        segments: [
          { key: "held", label: "Direct holdings", active: true },
          { key: "etf", label: "Through ETFs", active: false, disabled: true, title: "No lists yet" },
        ],
      }),
    );
    expect(html).not.toMatch(/<a |<button/);
    expect(html).toContain('<span aria-current="true"');
    expect(html).toContain('aria-disabled="true"');
  });
});

describe("FilterChip", () => {
  it("is a current link when the filter is in the URL and a pressed button otherwise", () => {
    const link = renderToStaticMarkup(h(FilterChip, { href: "/t/fund?filter=attention", active: true, count: 5, children: "Needs attention" }));
    expect(link).toMatch(/^<a /);
    expect(link).toContain('aria-current="true"');
    expect(link).toContain(">5</span>");
    expect(link).not.toContain("·");

    const button = renderToStaticMarkup(h(FilterChip, { active: false, count: 0, onClick: noop, children: "High" }));
    expect(button).toMatch(/^<button type="button"/);
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain(">0</span>");
  });

  it("groups a row of chips under a label", () => {
    expect(renderToStaticMarkup(h(FilterChips, { label: "Filter holdings", children: null }))).toMatch(/^<div role="group" aria-label="Filter holdings"/);
  });
});

describe("BackLink", () => {
  it("is one breadcrumb link with the arrow and a screen-reader 'Back to'", () => {
    const html = renderToStaticMarkup(h(BackLink, { href: "/attribution", label: "Attribution" }));
    expect(html).toMatch(/^<nav aria-label="Breadcrumb"><a [^>]*href="\/attribution"><svg [^>]*lucide-arrow-left/);
    expect(html).toContain('<span class="sr-only">Back to </span>Attribution');
  });
});

/*
 * One tab control and one segmented control: pages use Tabs (tabs.tsx) and Segmented (panel.tsx) rather than drawing
 * their own underline, pill track or tab list.
 */
describe("tab and segment markup lives in the shared controls", () => {
  const OWN = new Set(["src/components/app/tabs.tsx", "src/components/app/panel.tsx"]);
  const PATTERNS: [RegExp, string][] = [
    [/inset_0_-2px_0_var\(--foreground\)/, "the tab underline"],
    [/role="tablist"/, 'role="tablist"'],
    [/components\/ui\/tabs/, "@/components/ui/tabs"],
    [/rounded-full bg-muted p-0\.5/, "the segmented track"],
  ];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx$/.test(name) ? [p] : [];
    });

  it("has no hand-rolled tabs or segmented controls in pages and components", () => {
    const hits = ["src/app", "src/components"]
      .flatMap(files)
      .filter((f) => !OWN.has(f) && !f.startsWith("src/components/ui/"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return PATTERNS.filter(([re]) => re.test(text)).map(([, what]) => `${f}: ${what}`);
      });
    expect(hits).toEqual([]);
  });
});

describe("menu labels", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx$/.test(name) ? [p] : [];
    });

  // Base UI throws (error #31) when a menu's group label renders outside a group, and the page's error boundary takes over.
  it("puts every DropdownMenuLabel inside a DropdownMenuGroup", () => {
    const hits = ["src/app", "src/components"]
      .flatMap(files)
      .filter((f) => !f.startsWith("src/components/ui/"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return [...text.matchAll(/<DropdownMenuLabel\b/g)].flatMap((m) => {
          const before = text.slice(0, m.index);
          const open = (before.match(/<DropdownMenuGroup\b/g) ?? []).length - (before.match(/<\/DropdownMenuGroup>/g) ?? []).length;
          return open > 0 ? [] : [`${f}:${before.split("\n").length}`];
        });
      });
    expect(hits).toEqual([]);
  });
});
