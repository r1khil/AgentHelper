// Client-safe: the sidebar's places, the page header's default breadcrumb, and the Portfolio's views, worked out from
// the URL. The app is five screens: Home (ask), a Thread (one answer), a Holding, the Portfolio and Markets. Threads
// are listed in the sidebar; everything else a page used to be (movements, models, sell-side calls, earnings prep)
// lives on the holding it is about.
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/** Where a page sits. The sidebar marks Portfolio and Markets; the rest are reached from them or from the account menu. */
export type NavKey = "home" | "thread" | "portfolio" | "markets" | "holding" | "weekly" | "changelog" | "admin";

export type NavTab = { key: string; label: string; href: string; active: boolean };
export type NavItem = { key: NavKey; label: string; href: string; active: boolean };
export type Crumb = { label: string; href?: string };

export type NavScope = { slug: string } | "fund" | null;

export type NavInput = {
  pathname: string;
  /** Whose holdings the page in view shows: a team, the whole fund, or nobody (no team yet). */
  scope: NavScope;
  /** Where the sidebar's Portfolio opens: the whole fund for execs and admins, the member's own team otherwise. Defaults to `scope`. */
  home?: NavScope;
  /** Execs and admins: the whole fund, the Weekly update, the changelog and Admin. */
  fundWide: boolean;
  /** Position sizes and P&L for the scope in view (Performance, Risk, Exposure). */
  seesBook: boolean;
  /** Position sizes and P&L for `home` (a lead analyst's own team). Defaults to `seesBook`. */
  homeSeesBook?: boolean;
};

/** Where "up" is from a page about one item: the Portfolio it was opened from. */
export type NavBack = { label: string; href: string };

/**
 * `main` is the sidebar's places; `tabs` are the section's tabs for a page without its own header (none now: the
 * Portfolio's views are a control on the page); `crumbs` is the header's default breadcrumb.
 */
export type NavModel = { main: NavItem[]; manage: NavItem[]; section: NavKey | null; title: string; crumbs: Crumb[]; tabs: NavTab[]; back: NavBack | null };

const TITLES: Record<NavKey, string> = {
  home: "Home",
  thread: "Thread",
  portfolio: "Portfolio",
  markets: "Markets",
  holding: "Portfolio",
  weekly: "Weekly update",
  changelog: "What's new",
  admin: "Admin",
};

/** The Portfolio's views, in the order of the control on the page. `path` follows `/t/<scope>`. */
export const PORTFOLIO_VIEWS = [
  { key: "positions", label: "Positions", path: "" },
  { key: "performance", label: "Performance", path: "/performance" },
  { key: "risk", label: "Risk", path: "/risk" },
  { key: "exposure", label: "Exposure", path: "/exposure" },
  { key: "activity", label: "Activity", path: "/activity" },
  { key: "what-if", label: "What if", path: "/what-if" },
] as const;

export type PortfolioView = (typeof PORTFOLIO_VIEWS)[number]["key"];

/**
 * The views a reader gets for a scope. Activity (the ledger and tickets to review) is the fund's, for execs and admins;
 * Performance, Risk and Exposure need the book (position sizes); Positions and What if are for everyone.
 */
export function portfolioViews(scope: NavScope, { fundWide, seesBook }: { fundWide: boolean; seesBook: boolean }): { key: PortfolioView; label: string; href: string }[] {
  const base = baseOf(scope);
  if (!base) return [];
  return PORTFOLIO_VIEWS.filter((v) => {
    if (v.key === "activity") return scope === "fund" && fundWide;
    if (v.key === "performance" || v.key === "risk" || v.key === "exposure") return seesBook;
    return true;
  }).map((v) => ({ key: v.key, label: v.label, href: `${base}${v.path}` }));
}

/** The Portfolio view a URL shows, or null when it isn't a Portfolio page. */
export function portfolioViewFor(pathname: string): PortfolioView | null {
  const m = pathname.match(/^\/t\/[^/]+(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  if (m[1] === undefined) return "positions";
  return (PORTFOLIO_VIEWS.find((v) => v.path === `/${m[1]}`)?.key as PortfolioView | undefined) ?? null;
}

/** Which place a URL belongs to. */
export function sectionFor(pathname: string): NavKey | null {
  if (pathname === "/") return "home";
  if (/^\/hoot(\/|$)/.test(pathname)) return "thread";
  if (/^\/markets(\/|$)/.test(pathname)) return "markets";
  // Backtesting from before the five screens, until its redirect moves to next.config.
  if (/^\/backtesting(\/|$)/.test(pathname)) return "portfolio";
  if (/^\/weekly(\/|$)/.test(pathname)) return "weekly";
  if (/^\/changelog(\/|$)/.test(pathname)) return "changelog";
  if (/^\/admin(\/|$)/.test(pathname)) return "admin";
  const m = pathname.match(/^\/t\/[^/]+(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!m) return null;
  if (portfolioViewFor(pathname)) return "portfolio";
  switch (m[1]) {
    case "h":
      return "holding";
    // One write-up, model, call or report belongs to its holding; the old lists were the Portfolio's and Markets'.
    case "movements":
    case "models":
    case "sell-side":
      return m[2] ? "holding" : "portfolio";
    case "earnings":
      return m[2] ? "holding" : "markets";
    case "economic-calendar":
      return "markets";
    default:
      return null;
  }
}

/** Where a page about one holding (or one of its write-ups, models, calls or reports) goes up to: the Portfolio in its scope. */
export function backFor(pathname: string, base: string | null): NavBack | null {
  if (/^\/admin\/pt-sheet\/?$/.test(pathname)) return { label: "Admin", href: "/admin" };
  if (!base) return null;
  if (/^\/t\/[^/]+\/(h|movements|models|sell-side|earnings)\/[^/]+/.test(pathname)) return { label: TITLES.portfolio, href: base };
  return null;
}

const baseOf = (scope: NavScope) => (scope === "fund" ? `/t/${FUND_SCOPE_SLUG}` : scope ? `/t/${scope.slug}` : null);

/** Where the sidebar's Portfolio opens: the fund for execs and admins, the member's own team for everyone else. */
export function portfolioHref(home: NavScope, fundWide: boolean): string | null {
  return fundWide ? `/t/${FUND_SCOPE_SLUG}` : baseOf(home);
}

export function navModel({ pathname, scope, home = scope, fundWide }: NavInput): NavModel {
  const section = sectionFor(pathname);
  const base = baseOf(scope);

  const item = (key: NavKey, href: string | null, active: boolean): NavItem | null => (href ? { key, label: TITLES[key], href, active } : null);
  const main = [
    // The Weekly update and a holding sit under Portfolio.
    item("portfolio", portfolioHref(home, fundWide), section === "portfolio" || section === "holding" || section === "weekly"),
    item("markets", "/markets", section === "markets"),
  ].filter((x): x is NavItem => !!x);

  const back = backFor(pathname, base);
  const title = section && section !== "holding" ? TITLES[section] : "";
  return {
    main,
    manage: [],
    section,
    title,
    crumbs: back ? [{ label: back.label, href: back.href }] : title ? [{ label: title }] : [],
    tabs: [],
    back,
  };
}

/** A page by name: for ⌘K's "Go to" and for Hoot's "take me to …" commands (`hoot` is the name Hoot knows it by). */
export type Destination = { label: string; hoot?: string; href: string; hint: string; keywords?: string };

/** Every page this member can open in the current scope. */
export function destinations({ scope, fundWide, seesBook }: Omit<NavInput, "pathname" | "home" | "homeSeesBook">): Destination[] {
  const base = baseOf(scope);
  const out: Destination[] = [{ label: "Home", hoot: "Home", href: "/", hint: "Ask Hoot a question", keywords: "today start ask new thread" }];
  if (base) {
    const views = portfolioViews(scope, { fundWide, seesBook });
    const hint: Record<PortfolioView, { hoot: string; hint: string; keywords?: string }> = {
      positions: { hoot: "Portfolio", hint: "Fund value, chart and positions by team", keywords: "overview holdings positions team page" },
      performance: { hoot: "Performance", hint: "Where the return came from, today to all time", keywords: "attribution daily today intraday live" },
      risk: { hoot: "Risk", hint: "Volatility, tracking error, stress tests", keywords: "var beta stress drawdown" },
      exposure: { hoot: "Exposure", hint: "Sector tilts and look-through", keywords: "sectors factors etf" },
      activity: { hoot: "Activity", hint: "Trades, cash and tickets to review", keywords: "ledger trades tickets" },
      "what-if": { hoot: "What if", hint: "Replay a weight change", keywords: "backtesting backtest scenario" },
    };
    for (const v of views) out.push({ label: v.key === "positions" ? "Portfolio" : v.label, href: v.href, ...hint[v.key] });
  }
  out.push({ label: "Markets", hoot: "Markets", href: "/markets", hint: "Earnings and economic releases on one schedule", keywords: "calendar earnings economic macro cpi jobs reports" });
  out.push({ label: "All threads", hoot: "Threads", href: "/hoot", hint: "Every conversation with Hoot", keywords: "research chats conversations history" });
  // The lists behind a holding's tabs, across the scope.
  if (base) {
    out.push(
      { label: "Write-ups", hoot: "Write-ups", href: `${base}/movements`, hint: "Major movements and the team's write-ups", keywords: "movements movement investigations overdue" },
      { label: "Models", hoot: "Models", href: `${base}/models`, hint: "Excel models and values to approve", keywords: "model xbrl spreadsheet" },
      { label: "Sell-side calls", hoot: "Sell-side calls", href: `${base}/sell-side`, hint: "Recorded broker calls and Hoot's briefs", keywords: "calls broker analyzer transcripts" },
    );
  }
  if (fundWide) {
    out.push(
      { label: "Weekly update", hoot: "Weekly update", href: "/weekly", hint: "The Sunday pack for Aadi", keywords: "weekly pack email" },
      { label: "What's new", hoot: "Changelog", href: "/changelog", hint: "Every change merged into the app", keywords: "changelog" },
      { label: "Admin", hoot: "Admin", href: "/admin", hint: "Members, jobs and connections, PT sheet", keywords: "administration settings members" },
    );
  }
  return out;
}
