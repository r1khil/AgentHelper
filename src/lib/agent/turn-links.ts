import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { isToolPart, toolName, type Part, type ToolPart } from "./turn";

/** A page in the app that shows the same numbers a tool returned, for "Open in Performance" under an answer. */
export type TurnPageLink = { label: string; href: string };

/** `scoped`: the page lives under /t/<scope>/, for one team or the whole fund alike. */
const PAGES: Record<string, { label: string; path: (input: Record<string, unknown>) => string; scoped?: boolean }> = {
  get_attribution: { label: "Performance", path: () => "/attribution" },
  get_daily_performance: { label: "Performance, today", path: () => "/daily" },
  get_portfolio_risk: { label: "Risk", path: (i) => (i.page === "exposure" ? "/exposure" : "/risk") },
  run_backtest: { label: "Backtesting", path: () => "/backtesting" },
  get_movements: { label: "Movements", path: () => "/movements", scoped: true },
  get_upcoming_earnings: { label: "Earnings", path: () => "/earnings", scoped: true },
  get_economic_calendar: { label: "Economic releases", path: (i) => `/economic-calendar${typeof i.from === "string" ? `?day=${i.from}` : ""}`, scoped: true },
  get_ledger: { label: "Activity", path: () => "/attribution/ledger" },
  get_my_todos: { label: "Home", path: () => "/" },
  get_whats_new: { label: "Changelog", path: () => "/changelog" },
};

const inputOf = (p: ToolPart): Record<string, unknown> => (p.input && typeof p.input === "object" ? (p.input as Record<string, unknown>) : {});
const slugLike = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]+$/.test(v);

/**
 * The pages behind the lookups an answer made: one link per page, in the order the lookups ran. A team-scope lookup
 * links to that team's page (`teamSlug` is the chat's team when the tool was left to default to it); backtesting
 * lives at one address for everyone. A scoped page (Movements, Earnings) opens in the team the lookup named, else the
 * chat's team, else the whole fund. Only lookups that finished without an error count.
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
    if (page.scoped) {
      // A team named rather than slugged ("Healthcare") could be any team; skip the link rather than guess.
      if (input.team !== undefined && !slugLike(input.team)) continue;
      path = `/t/${input.team ?? teamSlug ?? FUND_SCOPE_SLUG}${path}`;
    } else if (path !== "/backtesting" && input.scope === "team") {
      const team = slugLike(input.team) ? input.team : teamSlug;
      if (!team) continue;
      path = `/t/${team}${path}`;
    }
    if (!out.has(path)) out.set(path, { label, href: path });
  }
  return [...out.values()];
}
