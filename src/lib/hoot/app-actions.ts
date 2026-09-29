// What Hoot may do to the app for a member: open a page (with the period, lookback, trade or holding tab it shows) or
// change the theme. Pure and client-safe: the agent's tools resolve a request here against the member's own pages, and the
// browser applies the resulting action once, when it streams in.
import { PERIOD_KEYS } from "@/lib/attribution/periods";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { destinations, type NavScope } from "@/lib/nav";
import { holdingHref, isFundBookPath, scopeSlugFromPath } from "@/lib/scope";
import { tradeParam, type Funding } from "@/lib/backtesting/trade";

export type HootAction = { kind: "navigate"; href: string; label: string } | { kind: "theme"; theme: "light" | "dark" | "system" };

/** Pages Hoot can open, by the name the model uses; each maps to the destination Hoot knows by that name (see nav.ts). */
export const APP_PAGES = {
  home: "Home",
  portfolio: "Portfolio",
  performance: "Performance",
  risk: "Risk",
  exposure: "Exposure",
  activity: "Activity",
  what_if: "What if",
  markets: "Markets",
  threads: "Threads",
  write_ups: "Write-ups",
  models: "Models",
  sell_side: "Sell-side calls",
  weekly: "Weekly update",
  changelog: "Changelog",
  admin: "Admin",
} as const;
type CurrentPage = keyof typeof APP_PAGES;

/** A holding page's tabs besides All (`?tab=`), and what the page calls them. */
export const HOLDING_TABS = { threads: "Threads", "write-ups": "Write-ups", model: "Model", filings: "Filings & notes", earnings: "Earnings" } as const;
export type HoldingTab = keyof typeof HOLDING_TABS;

/** Lists across a scope whose one holding's share is a tab on that holding: "AVGO's write-ups" is AVGO's Write-ups tab. */
const TICKER_TABS: Partial<Record<CurrentPage, HoldingTab>> = { threads: "threads", write_ups: "write-ups", models: "model", sell_side: "filings" };

/**
 * Pages from before the five screens, still understood when a member or the model names one: each opens where its
 * content lives now (with a ticker, `tab` on that holding's page instead).
 */
export const FORMER_PAGES = {
  team: { page: "portfolio" },
  research: { page: "threads" },
  movements: { page: "write_ups" },
  earnings: { page: "markets", tab: "earnings" },
  economic_calendar: { page: "markets" },
  attribution: { page: "performance" },
  performance_today: { page: "performance", today: true },
  backtesting: { page: "what_if" },
  ledger: { page: "activity" },
} as const satisfies Record<string, { page: CurrentPage; tab?: HoldingTab; today?: true }>;
type FormerPage = keyof typeof FORMER_PAGES;

export type AppPage = CurrentPage | FormerPage | "holding";

/** Performance's periods: the attribution periods, plus today (live while the market is open). */
export const NAV_PERIODS = ["today", ...PERIOD_KEYS] as const;

export type AppTeam = { id: string; slug: string; name: string };
export type AppViewer = { role: string; teamId: string | null };

export type NavigateRequest = {
  page: AppPage;
  /** A team by slug, name or abbreviation ("fig", "tech", "Healthcare", "C&CS"), or "fund" for the whole Fund. */
  team?: string;
  ticker?: string;
  /** For page "holding": the tab to open. */
  tab?: HoldingTab;
  period?: (typeof NAV_PERIODS)[number];
  from?: string;
  to?: string;
  lookback?: "6m" | "1y" | "2y";
  trade?: { ticker: string; changePp: number; fundFrom: string };
};

export type NavigateContext = {
  viewer: AppViewer;
  /** Every team the member can open (all of them for execs and admins). */
  teams: AppTeam[];
  /** Where the member asked from, so "here" and an unnamed team mean the scope they are in. */
  path?: string | null;
  /** Active holdings the member can open, for page "holding". */
  holdings?: { ticker: string; teamSlug: string }[];
};

const fundWideRole = (role: string) => role === "exec" || role === "admin";
const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const FILLER = new Set(["and", "the", "of", "team", "sector", "services"]);

/** Every way a member might name a team: slug, name, first word, and initials ("C&CS", "IT"). */
function aliases(t: AppTeam): string[] {
  const w = words(t.name);
  const initials = w.filter((x) => x !== "and" && x !== "the" && x !== "of").map((x) => x[0]).join("");
  const initialsWithAnd = t.name.replace(/[^A-Za-z& ]/g, "").split(/\s+/).map((x) => (x === "&" ? "&" : x[0] ?? "")).join("").toLowerCase();
  return [...new Set([t.slug.toLowerCase(), w.join(" "), w.filter((x) => !FILLER.has(x)).join(" "), w[0], initials, initialsWithAnd].filter((x): x is string => Boolean(x)))];
}

/** Edit distance, for a typo in a team name. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const FUND_WORDS = new Set(["fund", "whole fund", "the fund", "the whole fund", "all", "all teams", "everything", "portfolio"]);

/** The team a member named, or "fund", among the teams they can open. */
export function resolveTeam(query: string, teams: AppTeam[]): AppTeam | "fund" | null {
  // "the FIG sectoer": "team" and "sector", typos included, only say what kind of thing was named.
  const q = words(query)
    .filter((x, i) => !(i === 0 && (x === "the" || x === "my" || x === "our")))
    .filter((x) => !["team", "teams", "sector", "sectors"].some((n) => distance(x, n) <= (n.length > 4 ? 1 : 0)))
    .join(" ");
  if (!q) return null;
  if (FUND_WORDS.has(q)) return "fund";
  const compact = (x: string) => x.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  const exact = teams.find((t) => aliases(t).includes(q) || aliases(t).map(compact).includes(compact(q)));
  if (exact) return exact;
  // One close typo ("helthcare", "industrails") or a team whose name starts with what was typed ("consum").
  const scored = teams
    .map((t) => ({ t, d: Math.min(...aliases(t).filter((a) => a.length > 3).map((a) => distance(q, a))), prefix: aliases(t).some((a) => a.length > 3 && q.length >= 4 && a.startsWith(q)) }))
    .sort((a, b) => a.d - b.d);
  const prefixed = scored.filter((s) => s.prefix);
  if (prefixed.length === 1) return prefixed[0].t;
  const best = scored[0];
  return best && best.d <= Math.max(1, Math.floor(q.length / 5)) && scored.filter((s) => s.d === best.d).length === 1 ? best.t : null;
}

/** The scope a request lands in: the team named, else the scope of the page the member asked from, else their home. */
function scopeFor(req: NavigateRequest, ctx: NavigateContext): { scope: NavScope; slug: string | null } | { error: string } {
  const fundWide = fundWideRole(ctx.viewer.role);
  const own = ctx.teams.find((t) => t.id === ctx.viewer.teamId) ?? (fundWide ? null : ctx.teams[0] ?? null);
  if (req.team) {
    const t = resolveTeam(req.team, ctx.teams);
    if (t === "fund") return fundWide ? { scope: "fund", slug: FUND_SCOPE_SLUG } : { error: "The whole Fund's pages are for execs and admins; you can open your own team's." };
    if (!t) return { error: `No team you can open matches "${req.team}". Teams: ${ctx.teams.map((x) => x.name).join(", ") || "none"}.` };
    return { scope: { slug: t.slug }, slug: t.slug };
  }
  const here = ctx.path ? (isFundBookPath(ctx.path) ? FUND_SCOPE_SLUG : scopeSlugFromPath(ctx.path)) : null;
  if (here === FUND_SCOPE_SLUG && fundWide) return { scope: "fund", slug: FUND_SCOPE_SLUG };
  const inView = here ? ctx.teams.find((t) => t.slug === here) : undefined;
  if (inView) return { scope: { slug: inView.slug }, slug: inView.slug };
  if (fundWide) return { scope: "fund", slug: FUND_SCOPE_SLUG };
  return own ? { scope: { slug: own.slug }, slug: own.slug } : { error: "You're not on a team yet, so there is nothing to open." };
}

const WHY_NOT: Partial<Record<CurrentPage, string>> = {
  performance: "Performance shows position sizes and P&L, which only the team's lead analyst, execs and admins see.",
  risk: "Risk shows position sizes, which only the team's lead analyst, execs and admins see.",
  exposure: "Exposure shows position sizes, which only the team's lead analyst, execs and admins see.",
  portfolio: "The Fund's Portfolio page is for execs and admins.",
  activity: "Activity (the trade ledger) is the whole Fund's, for execs and admins.",
  weekly: "The weekly update is for execs and admins.",
  changelog: "What's new (the changelog) is for execs and admins.",
  admin: "Admin is for execs and admins.",
};

/**
 * Where a request goes for this member, only ever to a page their own sidebar would offer (never a URL the model
 * wrote), with the view settings the page reads from its address.
 */
export function resolveNavigation(req: NavigateRequest, ctx: NavigateContext): { action: Extract<HootAction, { kind: "navigate" }> } | { error: string } {
  const fundWide = fundWideRole(ctx.viewer.role);
  const former: { page: CurrentPage; tab?: HoldingTab; today?: true } | null = req.page in FORMER_PAGES ? FORMER_PAGES[req.page as FormerPage] : null;
  const page: CurrentPage = former?.page ?? (req.page as CurrentPage);
  // "AVGO's write-ups" is AVGO's Write-ups tab.
  const tickerTab = former?.tab ?? TICKER_TABS[page];
  const tab = req.page === "holding" ? req.tab : req.ticker && tickerTab ? tickerTab : undefined;
  if (req.page === "holding" || tab) {
    if (!req.ticker) return { error: "Name the holding's ticker to open its page." };
    const t = req.ticker.trim().toUpperCase();
    const h = ctx.holdings?.find((x) => x.ticker.toUpperCase() === t);
    if (!h) return { error: `${t} isn't an active holding in a team you can open.` };
    // Opened from the scope the member is in when it shows this holding (the fund shows every team's).
    const here = (ctx.path ? (isFundBookPath(ctx.path) ? FUND_SCOPE_SLUG : scopeSlugFromPath(ctx.path)) : null) ?? (fundWide ? FUND_SCOPE_SLUG : null);
    return { action: { kind: "navigate", href: holdingHref(here, h.teamSlug, t, tab ? `?tab=${tab}` : ""), label: tab ? `${t}, ${HOLDING_TABS[tab]}` : t } };
  }
  const where = scopeFor(req, ctx);
  if ("error" in where) return where;
  const ownTeam = ctx.teams.find((t) => t.id === ctx.viewer.teamId);
  const lead = ctx.viewer.role === "lead_analyst" && where.scope !== "fund" && where.scope !== null && ownTeam?.slug === where.scope.slug;
  const seesBook = where.scope === "fund" || fundWide || lead;
  const label = APP_PAGES[page];
  const dest = destinations({ scope: where.scope, fundWide, seesBook }).find((d) => d.hoot === label);
  if (!dest) return { error: WHY_NOT[page] ?? `${label} isn't available to you here.` };

  const params = new URLSearchParams();
  const period = former?.today ? "today" : req.period;
  if (page === "performance" && period) {
    params.set("period", period);
    if (period === "custom") {
      if (req.from) params.set("from", req.from);
      if (req.to) params.set("to", req.to);
    }
  }
  if ((page === "risk" || page === "exposure") && req.lookback) params.set("lookback", req.lookback);
  if (page === "what_if") {
    if (req.trade) {
      const f = req.trade.fundFrom.toLowerCase();
      const funding: Funding = f === "cash" ? { kind: "cash" } : f === "pro_rata" ? { kind: "pro_rata" } : { kind: "ticker", ticker: req.trade.fundFrom.toUpperCase() };
      params.set("trade", tradeParam({ ticker: req.trade.ticker.toUpperCase(), changePp: req.trade.changePp, funding }));
    }
    if (req.from) params.set("from", req.from);
    if (req.to) params.set("to", req.to);
  }
  const team = where.scope === "fund" || where.scope === null ? null : ctx.teams.find((t) => t.slug === (where.scope as { slug: string }).slug);
  // Markets is one page for everyone; a team named ("earnings for tech") filters it to that team's holdings.
  if (page === "markets" && req.team && team) params.set("team", team.slug);
  const query = params.toString();
  const scoped = team && (dest.href.startsWith(`/t/${team.slug}`) || params.has("team")) ? ` for ${team.name}` : "";
  const shown = page === "performance" && period === "today" ? "Performance today" : dest.label;
  return { action: { kind: "navigate", href: query ? `${dest.href}?${query}` : dest.href, label: `${shown}${scoped}` } };
}

type PartLike = { type: string; toolCallId?: string; state?: string; output?: unknown };

/** The action a finished navigate or set_theme call carries, if any. */
export function actionOfPart(p: PartLike): HootAction | null {
  if ((p.type !== "tool-navigate" && p.type !== "tool-set_theme") || p.state !== "output-available") return null;
  const action = (p.output as { data?: { action?: HootAction } } | null)?.data?.action;
  if (!action) return null;
  if (action.kind === "navigate") return typeof action.href === "string" && /^\/(?!\/)[^\s\\]*$/.test(action.href) ? action : null;
  return action.kind === "theme" && ["light", "dark", "system"].includes(action.theme) ? action : null;
}

/**
 * Actions that finished since the last look, in order, marking each seen. Seed `seen` with the chat's saved actions
 * (`seenActions`) so reopening a chat never replays them; the caller applies only what arrives while it is streaming.
 */
export function takeNewActions(messages: { parts: PartLike[] }[], seen: Set<string>): HootAction[] {
  const out: HootAction[] = [];
  for (const m of messages)
    for (const p of m.parts) {
      const action = actionOfPart(p);
      if (!action || !p.toolCallId || seen.has(p.toolCallId)) continue;
      seen.add(p.toolCallId);
      out.push(action);
    }
  return out;
}

export const seenActions = (messages: { parts: PartLike[] }[]) => {
  const seen = new Set<string>();
  takeNewActions(messages, seen);
  return seen;
};
