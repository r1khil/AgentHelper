import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamsPanel as TodayTeams } from "@/app/(app)/_today/teams-panel";
import { JobRunsLive } from "./admin/job-runs-live";
import { ResearchBoards } from "./agent/research-boards";
import { TeamBars as AttributionTeams } from "./attribution/attribution-panels";
import { HoldingsColumn } from "./attribution/holdings-columns";
import { DayTable } from "./attribution/sector-breakdown";
import { SectorsPanel } from "./attribution/sectors-panel";
import { ActiveBetsPanel, SectorWeightsPanel } from "./exposure/exposure-panels";
import { HoldingsTable } from "./holdings/holdings-table";
import { EarningsTab } from "./holdings/tab-panels";
import { StressPanelFallback } from "./risk/stress-panel";
import type { Exposure } from "@/lib/risk/exposure";
import type { RiskReport } from "@/lib/risk/model";

// Div grids that read as tables: a table (with a name) around rows, rows of cells, and every row with as many cells
// as the table has column headers. Checked on the rendered markup, so a row that loses its cells or a header that
// loses its role fails here.

type Node = { tag: string; attrs: Record<string, string>; children: Node[]; parent: Node | null; text: string };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function parse(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], parent: null, text: "" };
  let cur = root;
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[5] !== undefined) {
      cur.text += m[5];
      continue;
    }
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) {
      if (cur.parent) cur = cur.parent;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rawAttrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    const node: Node = { tag, attrs, children: [], parent: cur, text: "" };
    cur.children.push(node);
    if (!selfClose && !VOID.has(tag)) cur = node;
  }
  return root;
}

const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
const role = (n: Node) => n.attrs.role ?? (n.tag === "table" ? "table" : n.tag === "tr" ? "row" : n.tag === "th" ? "columnheader" : n.tag === "td" ? "cell" : undefined);
const hidden = (n: Node) => "aria-hidden" in n.attrs || "hidden" in n.attrs;
const CELL = new Set(["cell", "columnheader", "rowheader"]);

/** Roughly what a screen reader reads for a node: its aria-label, or its text without hidden parts. */
const spoken = (n: Node): string => (hidden(n) ? "" : (n.attrs["aria-label"] ?? n.text + n.children.map(spoken).join("")));

/** The nearest ancestor (not the node itself) with one of the given roles. */
function nearest(n: Node, roles: Set<string>): Node | null {
  for (let p = n.parent; p; p = p.parent) if (roles.has(role(p) ?? "")) return p;
  return null;
}

/** A row's own cells: descendants with a cell role, not inside a nested table or an aria-hidden subtree. */
function cellsOf(row: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    for (const c of n.children) {
      if (hidden(c) || role(c) === "table") continue;
      if (CELL.has(role(c) ?? "")) out.push(c);
      else walk(c);
    }
  };
  walk(row);
  return out;
}

function checkTables(html: string) {
  const nodes = all(parse(html));
  const tables = nodes.filter((n) => role(n) === "table");
  expect(tables.length, "no table rendered").toBeGreaterThan(0);
  for (const n of nodes) {
    const r = role(n);
    if (r === "row") expect(nearest(n, new Set(["table", "grid"])), "a row outside a table").not.toBeNull();
    if (r && CELL.has(r)) expect(role(nearest(n, new Set(["row", "table", "grid"]))!), `a ${r} outside a row`).toBe("row");
  }
  for (const t of tables) {
    expect(t.attrs["aria-label"] ?? t.attrs["aria-labelledby"], "a table without a name").toBeTruthy();
    const rows = all(t).filter((n) => n !== t && role(n) === "row" && nearest(n, new Set(["table", "grid"])) === t);
    const headers = rows.flatMap(cellsOf).filter((c) => role(c) === "columnheader");
    expect(headers.length, "a table without column headers").toBeGreaterThan(0);
    for (const row of rows) {
      const width = cellsOf(row).reduce((s, c) => s + Number(c.attrs["aria-colspan"] ?? c.attrs.colspan ?? 1), 0);
      expect(width, `a row with the wrong number of cells in "${t.attrs["aria-label"]}"`).toBe(headers.length);
    }
  }
  // Every header says something (an empty one leaves its column or row unnamed).
  for (const n of nodes) if (role(n) === "columnheader" || role(n) === "rowheader") expect(spoken(n).trim(), `an empty ${role(n)}`).not.toBe("");
  // Nothing that only shows a status (a pill or a badge) is a tab stop.
  for (const n of nodes) if (n.attrs.tabindex === "0" && n.tag === "span") expect(n.attrs.class ?? "").toContain("cursor-help");
  return nodes;
}

const render = (el: ReactElement) => renderToStaticMarkup(el);

const holdingRow = (ticker: string, company: string, flags: { label: string; tone: "hoot" | "caution" | "neutral"; href?: string }[] = []) => ({
  id: ticker,
  ticker,
  company,
  href: `/h/${ticker}`,
  weightPct: 4.2,
  shares: 100,
  spark: [1, 2, 3],
  nextReport: "Nov 18",
  flags,
});

describe("div grids read as tables", () => {
  it("Holdings: header row, team row groups with a spanning collapse button, ticker row headers", () => {
    const groups = [
      { id: "t", name: "Tech", navPct: 20, rows: [holdingRow("NVDA", "NVIDIA Corporation", [{ label: "Movement open", tone: "caution" }, { label: "Report soon", tone: "neutral" }]), holdingRow("AAPL", "AAPL")] },
      { id: "e", name: "Energy", navPct: 5, rows: [holdingRow("XOM", "Exxon Mobil")] },
    ];
    for (const quotes of [undefined, { NVDA: { price: 100, changePct: 1, relativePp: -0.4 } }]) {
      const html = render(h(HoldingsTable, { groups, quotes }));
      const nodes = checkTables(html);
      const button = nodes.find((n) => n.tag === "button")!;
      expect(button.attrs["aria-expanded"]).toBe("true");
      expect(role(button.parent!)).toBe("cell");
      expect(button.parent!.attrs["aria-colspan"]).toBe("9");
      const links = nodes.filter((n) => n.tag === "a" && role(n.parent!) === "rowheader");
      expect(links.map((a) => a.attrs["aria-label"])).toEqual(["NVDA, NVIDIA Corporation", "AAPL", "XOM, Exxon Mobil"]);
      // The row's pending overlay is decorative.
      expect(links.every((a) => a.children.some((c) => c.attrs.class === "row-pending" && "aria-hidden" in c.attrs))).toBe(true);
    }
    const html = render(h(HoldingsTable, { groups }));
    expect(html).toContain("Day versus S&amp;P 500, basis points");
    expect(html).toContain("Also: Report soon");
  });

  it("Holdings with nothing in it still has a named table and a spanning message", () => {
    checkTables(render(h(HoldingsTable, { groups: [], empty: "No holdings match." })));
  });

  it("Today's teams, with and without the book", () => {
    const teams = [
      { id: "a", name: "Tech", holdings: [], stats: { ret: 0.01, contribution: 0.002 }, mover: { ticker: "NVDA", pct: 2 } },
      { id: "b", name: "Energy", holdings: [], stats: null, mover: null },
    ];
    for (const withBook of [true, false]) {
      const nodes = checkTables(render(h(TodayTeams, { title: "Teams", teams, withBook, live: true, holdingsHref: "/holdings" })));
      const toggles = nodes.filter((n) => n.tag === "button");
      expect(toggles.map((b) => [b.attrs["aria-expanded"], role(b.parent!)])).toEqual([
        ["false", "rowheader"],
        ["false", "rowheader"],
      ]);
    }
  });

  it("Attribution teams, holdings columns and sectors", () => {
    const teams = new Map([["a", { name: "Tech", slug: "tech" }]]);
    checkTables(
      render(
        h(AttributionTeams, {
          rows: [
            { teamId: "a", avgWeight: 0.2, ret: 0.01, contribution: 0.002 },
            { teamId: null, avgWeight: 0.01, ret: 0, contribution: 0 },
          ],
          teams,
          cashContribution: 0,
          portfolioReturn: 0.012,
          query: "?period=ytd",
        }),
      ),
    );
    const html = render(
      h(HoldingsColumn, {
        rows: [{ ticker: "NVDA", name: "NVIDIA Corporation", sector: null, teamId: "a", avgWeight: 0.05, ret: 0.1, contribution: 0.004 }],
        teams,
        label: "Helped most",
        caption: "Helped most · team, avg weight",
      }),
    );
    checkTables(html);
    expect(html).toContain('aria-label="NVDA, NVIDIA Corporation"');
    const sector = { key: "information_technology" as const, avgPortfolioWeight: 0.3, avgBenchmarkWeight: 0.28, portfolioReturn: 0.02, benchmarkReturn: 0.01, contribution: 0.006, total: 0.001, allocation: 0, selection: 0.001, interaction: 0 };
    const totals = { portfolioReturn: 0.02, benchmarkReturn: 0.01, effects: { allocation: 0, selection: 0.001, interaction: 0 }, activeReturn: 0.001 };
    for (const hasBench of [true, false]) checkTables(render(h(SectorsPanel, { rows: [sector], hasBench, totals })));
  });

  it("Exposure: sector weights and largest active bets have column headers", () => {
    const sectors = [
      { key: "tech", label: "Technology", weight: 0.3, benchWeight: 0.28, active: 0.02, tickers: ["NVDA"], etf: "XLK" },
      { key: "energy", label: "Energy", weight: 0.02, benchWeight: 0.04, active: -0.02, tickers: [], etf: "XLE" },
    ];
    const x = { throughEtfs: false, hasBenchmark: true, sectors } as unknown as Exposure;
    // The weights are visible figures in their own cells, not screen-reader text inside the bars.
    const weights = checkTables(render(h(SectorWeightsPanel, { x, benchShort: "S&P 500" })));
    const cellText = (n: Node) => all(n).map((c) => c.text).join("").trim();
    expect(weights.filter((n) => role(n) === "columnheader").map(cellText).slice(0, 3)).toEqual(["Sector", "Fund", "S&amp;P 500"]);
    expect(weights.filter((n) => role(n) === "cell").map(cellText).slice(0, 3)).toEqual(["30.0%", "28.0%", "200"]);
    expect(weights.some((n) => (n.attrs.class ?? "").split(" ").includes("sr-only") && /%/.test(cellText(n)))).toBe(false);
    const bets = render(h(ActiveBetsPanel, { report: { holdings: [] } as unknown as RiskReport, x, lookthrough: null, teams: new Map(), benchShort: "S&P 500" }));
    const nodes = checkTables(bets);
    expect(nodes.filter((n) => role(n) === "columnheader").map((n) => all(n).map((c) => c.text).join("").trim())).toEqual(["ETF", "Sector", "Fund", "S&amp;P 500", "ActiveActive weight, basis points"]);
  });

  it("Stress tests, research boards and a holding's earnings", () => {
    checkTables(render(h(StressPanelFallback, {})));
    const boards = render(
      h(ResearchBoards, {
        holdings: [{ id: "1", ticker: "NVDA", name: "NVIDIA Corporation", href: "/h/NVDA/research", chats: 2, sources: 3, lastActivity: null, earnings: { reportDate: "2026-11-18", dateStatus: "estimated", hasExpectations: false } }],
        market: Promise.resolve({}),
        showTeam: false,
      }),
    );
    const nodes = checkTables(boards);
    expect(nodes.find((n) => role(n) === "columnheader" && n.attrs["aria-sort"])?.attrs["aria-sort"]).toBe("other");
    checkTables(
      render(
        h(EarningsTab, {
          rows: [{ id: "e", href: "/e", date: "2026-11-18", when: "after close", period: "Q3", status: "upcoming", expectations: "none", eps: "$1.20" }],
          calendarHref: "/calendar",
        }),
      ),
    );
  });
});

describe("expandable rows open from the keyboard", () => {
  // The row still opens on a click anywhere; a real button in its first cell is the keyboard's way in.
  const expanders = (nodes: Node[]) => nodes.filter((n) => n.tag === "button" && "aria-expanded" in n.attrs);

  it("Attribution's per-day breakdown: a button for each day with positions", () => {
    const pos = { ticker: "NVDA", weight: 0.05, ret: 0.01, contribution: 0.0005, pnl: 120, priced: "close" as const };
    const day = (date: string, positions: (typeof pos)[]) => ({ date, wp: 0.3, rp: 0.01, growth: 1, contributionRaw: 0.003, contributionScaled: 0.003, positions, bench: null });
    for (const hasBench of [true, false]) {
      const nodes = checkTables(render(h(DayTable, { days: [day("2026-09-24", [pos]), day("2026-09-25", [])], hasBench })));
      const buttons = expanders(nodes);
      expect(buttons).toHaveLength(1);
      expect(buttons[0].attrs["aria-expanded"]).toBe("false");
      expect(buttons[0].attrs["aria-controls"]).toBeTruthy();
      expect(buttons[0].attrs["aria-label"]).toMatch(/^Positions on /);
      expect(role(buttons[0].parent!)).toBe("cell");
    }
  });

  it("Admin job runs: a step-log button in transparency mode, for runs with steps", () => {
    const step = { at: "2026-09-27T12:00:00.000Z", kind: "step" as const, name: "fetch" };
    const run = (id: string, progress: (typeof step)[]) => ({ id, job: "morning", startedAt: "2026-09-27T12:00:00.000Z", finishedAt: "2026-09-27T12:01:00.000Z", ok: true, summary: {}, current: step, progress });
    const runs = [run("a", [step]), run("b", [])];
    const nodes = checkTables(render(h(JobRunsLive, { initial: runs, transparency: true })));
    const buttons = expanders(nodes);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].attrs["aria-expanded"]).toBe("false");
    expect(buttons[0].attrs["aria-controls"]).toBeTruthy();
    expect(buttons[0].attrs["aria-label"]).toMatch(/^Step log, morning, /);
    expect(role(buttons[0].parent!)).toBe("cell");
    expect(expanders(checkTables(render(h(JobRunsLive, { initial: runs, transparency: false }))))).toHaveLength(0);
  });
});

describe("definitions are text, not only tooltips", () => {
  it("a Tip label's definition is its description, hidden from view and from the header's name", () => {
    const nodes = all(parse(render(h(AttributionTeams, { rows: [], teams: new Map(), cashContribution: 0, portfolioReturn: 0, query: "" }))));
    const tips = nodes.filter((n) => n.attrs["aria-describedby"]);
    expect(tips.length).toBe(2);
    for (const t of tips) {
      const def = nodes.find((n) => n.attrs.id === t.attrs["aria-describedby"])!;
      expect("hidden" in def.attrs).toBe(true);
      expect(def.text.length).toBeGreaterThan(10);
    }
  });
});

describe("guard", () => {
  // Any file that draws rows with role="row" must also draw the table around them.
  it("role=row only in files that also render role=table", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx")) files.push(p);
      }
    };
    walk(root);
    const offenders = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /role="(row|cell|columnheader|rowheader)"/.test(s) && !/role="(table|grid)"/.test(s);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
