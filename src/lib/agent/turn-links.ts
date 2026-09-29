import { isToolPart, toolName, type Part, type ToolPart } from "./turn";

/** A page in the app that shows the same numbers a tool returned, for "Open in Performance" under an answer. */
export type TurnPageLink = { label: string; href: string };

const PAGES: Record<string, { label: string; path: (input: Record<string, unknown>) => string }> = {
  get_attribution: { label: "Performance", path: () => "/attribution" },
  get_daily_performance: { label: "Performance, today", path: () => "/daily" },
  get_portfolio_risk: { label: "Risk", path: (i) => (i.page === "exposure" ? "/exposure" : "/risk") },
  run_backtest: { label: "Backtesting", path: () => "/backtesting" },
};

const inputOf = (p: ToolPart): Record<string, unknown> => (p.input && typeof p.input === "object" ? (p.input as Record<string, unknown>) : {});

/**
 * The pages behind the lookups an answer made: one link per page, in the order the lookups ran. A team-scope lookup
 * links to that team's page (`teamSlug` is the chat's team when the tool was left to default to it); backtesting
 * lives at one address for everyone. Only lookups that finished without an error count.
 */
export function turnPageLinks(activity: Part[], teamSlug: string | null): TurnPageLink[] {
  const out = new Map<string, TurnPageLink>();
  for (const p of activity) {
    if (!isToolPart(p) || p.state !== "output-available" || p.output?.error) continue;
    const page = PAGES[toolName(p)];
    if (!page) continue;
    const input = inputOf(p);
    let path = page.path(input);
    const label = path === "/exposure" ? "Exposure" : page.label;
    if (path !== "/backtesting" && input.scope === "team") {
      const team = typeof input.team === "string" && /^[a-z0-9-]+$/.test(input.team) ? input.team : teamSlug;
      if (!team) continue;
      path = `/t/${team}${path}`;
    }
    if (!out.has(path)) out.set(path, { label, href: path });
  }
  return [...out.values()];
}
