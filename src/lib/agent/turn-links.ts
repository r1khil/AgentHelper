import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { isToolPart, toolName, type Part, type ToolPart } from "./turn";

/** A page in the app that shows the same numbers a tool returned, for "Open in Performance" under an answer. */
export type TurnPageLink = { label: string; href: string };

/**
 * `path` follows `/t/<scope>`: `book` pages are the Portfolio's views, the team's when the lookup was for a team (else
 * the whole fund); `scoped` pages open in the team the lookup named, else the chat's team, else the whole fund. The
 * rest live at one address.
 */
const PAGES: Record<string, { label: string; path: (input: Record<string, unknown>) => string; book?: boolean; scoped?: boolean }> = {
  get_attribution: { label: "Performance", path: () => "/performance", book: true },
  get_daily_performance: { label: "Performance, today", path: () => "/performance?period=today", book: true },
  get_portfolio_risk: { label: "Risk", path: (i) => (i.page === "exposure" ? "/exposure" : "/risk"), book: true },
  // What if replays the chat's team (the member's own, for everyone but execs and admins) or the whole fund.
  run_backtest: { label: "What if", path: () => "/what-if", scoped: true },
  // Across a team, write-ups have their own list; reports are on Markets.
  get_movements: { label: "Write-ups", path: () => "/movements", scoped: true },
  get_upcoming_earnings: { label: "Markets", path: () => "/markets" },
  get_economic_calendar: { label: "Markets", path: () => "/markets" },
  get_ledger: { label: "Activity", path: () => `/t/${FUND_SCOPE_SLUG}/activity` },
  get_my_todos: { label: "Home", path: () => "/" },
  get_whats_new: { label: "What's new", path: () => "/changelog" },
};

const inputOf = (p: ToolPart): Record<string, unknown> => (p.input && typeof p.input === "object" ? (p.input as Record<string, unknown>) : {});
const slugLike = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]+$/.test(v);

/**
 * The pages behind the lookups an answer made: one link per page, in the order the lookups ran. A team-scope lookup
 * links to that team's view (`teamSlug` is the chat's team when the tool was left to default to it). Only lookups
 * that finished without an error count.
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
    // A team named rather than slugged ("Healthcare") could be any team; skip the link rather than guess.
    if (page.scoped) {
      if (input.team !== undefined && !slugLike(input.team)) continue;
      path = `/t/${input.team ?? teamSlug ?? FUND_SCOPE_SLUG}${path}`;
    } else if (page.book) {
      if (input.scope !== "team") path = `/t/${FUND_SCOPE_SLUG}${path}`;
      else {
        const team = slugLike(input.team) ? input.team : input.team === undefined ? teamSlug : null;
        if (!team) continue;
        path = `/t/${team}${path}`;
      }
    }
    if (!out.has(path)) out.set(path, { label, href: path });
  }
  return [...out.values()];
}
