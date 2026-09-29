// Client-safe: the sidebar's destinations, and the page header's breadcrumb and section tabs, worked out from the URL.
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/** Where a page sits in the sidebar. Every page in the app has at most one. */
export type NavKey = "home" | "portfolio" | "research" | "movements" | "models" | "calendar" | "team" | "weekly" | "changelog" | "admin";

export type NavTab = { key: string; label: string; href: string; active: boolean };
export type NavItem = { key: NavKey; label: string; href: string; active: boolean };
export type Crumb = { label: string; href?: string };

export type NavScope = { slug: string } | "fund" | null;

export type NavInput = {
  pathname: string;
  /** Whose holdings the page in view shows: a team, the whole fund, or nobody (no team yet). Sets the section tabs. */
  scope: NavScope;
  /**
   * Where the sidebar's Research, Movements, Models and Calendar open: the whole fund for execs and admins, the
   * member's own team for everyone else. Defaults to `scope`.
   */
  home?: NavScope;
  /** Execs and admins: the whole fund, and the Manage pages. */
  fundWide: boolean;
  /** Position sizes and P&L for the scope in view (Performance, Risk, Exposure). */
  seesBook: boolean;
  /** Position sizes and P&L for `home` (a lead analyst's own team). Defaults to `seesBook`. */
  homeSeesBook?: boolean;
};

/** Where "up" is from a page about one item: the list it was opened from, in the scope in view. */
export type NavBack = { label: string; href: string };

/**
 * `main` and `manage` are the sidebar; `tabs` are the section's pages for the page header; `crumbs` is the header's
 * default breadcrumb (a page that renders its own PageHead replaces it).
 */
export type NavModel = { main: NavItem[]; manage: NavItem[]; section: NavKey | null; title: string; crumbs: Crumb[]; tabs: NavTab[]; back: NavBack | null };

const TITLES: Record<NavKey, string> = {
  home: "Home",
  portfolio: "Portfolio",
  research: "Research",
  movements: "Movements",
  models: "Models",
  calendar: "Calendar",
  team: "Teams",
  weekly: "Weekly update",
  changelog: "Changelog",
  admin: "Admin",
};

/** Which sidebar destination a URL belongs to. */
export function sectionFor(pathname: string): NavKey | null {
  if (pathname === "/") return "home";
  if (/^\/hoot(\/|$)/.test(pathname)) return "research";
  if (/^\/(attribution|daily|risk|exposure|backtesting)(\/|$)/.test(pathname)) return "portfolio";
  if (/^\/weekly(\/|$)/.test(pathname)) return "weekly";
  if (/^\/changelog(\/|$)/.test(pathname)) return "changelog";
  if (/^\/admin(\/|$)/.test(pathname)) return "admin";
  const m = pathname.match(/^\/t\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return null;
  const fund = m[1] === FUND_SCOPE_SLUG;
  switch (m[2]) {
    // The fund's own page is the Portfolio overview; a team's is its team page. A holding opens under either.
    case undefined:
    case "h":
      return fund ? "portfolio" : "team";
    case "movements":
      return "movements";
    case "models":
      return "models";
    case "agent":
    case "sell-side":
      return "research";
    case "earnings":
    case "economic-calendar":
      return "calendar";
    case "attribution":
    case "daily":
    case "risk":
    case "exposure":
      return "portfolio";
    default:
      return null;
  }
}

/**
 * The pages that stand on their own under another page, and the page each goes up to: a holding goes up to the
 * portfolio or team it was opened from, one earnings report to the calendar, the PT sheet read test to Admin.
 */
export function backFor(pathname: string, base: string | null): NavBack | null {
  if (/^\/admin\/pt-sheet\/?$/.test(pathname)) return { label: "Admin", href: "/admin" };
  const m = pathname.match(/^\/t\/([^/]+)\/(h|earnings)\/[^/]+\/?$/);
  if (!m || !base) return null;
  if (m[2] === "earnings") return { label: TITLES.calendar, href: `${base}/earnings` };
  return { label: m[1] === FUND_SCOPE_SLUG ? TITLES.portfolio : TITLES.team, href: base };
}

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
const baseOf = (scope: NavScope) => (scope === "fund" ? `/t/${FUND_SCOPE_SLUG}` : scope ? `/t/${scope.slug}` : null);

/** The Portfolio tabs for a scope: the fund's six, a team's four (its book lives under /t/<team>/). */
function portfolioTabs(scope: NavScope, fundWide: boolean, seesBook: boolean): Omit<NavTab, "active">[] {
  const list: Omit<NavTab, "active">[] = [];
  if (seesBook && scope === "fund") {
    list.push({ key: "overview", label: "Overview", href: `/t/${FUND_SCOPE_SLUG}` });
    if (fundWide) list.push({ key: "activity", label: "Activity", href: "/attribution/ledger" });
    list.push(
      { key: "performance", label: "Performance", href: "/attribution" },
      { key: "risk", label: "Risk", href: "/risk" },
      { key: "exposure", label: "Exposure", href: "/exposure" },
    );
  } else if (seesBook && scope) {
    const base = baseOf(scope)!;
    list.push(
      { key: "performance", label: "Performance", href: `${base}/attribution` },
      { key: "risk", label: "Risk", href: `${base}/risk` },
      { key: "exposure", label: "Exposure", href: `${base}/exposure` },
    );
  }
  list.push({ key: "backtesting", label: "Backtesting", href: "/backtesting" });
  return list;
}

function portfolioActive(key: string, pathname: string) {
  switch (key) {
    case "overview":
      return pathname === `/t/${FUND_SCOPE_SLUG}` || pathname === `/t/${FUND_SCOPE_SLUG}/`;
    case "activity":
      return under(pathname, "/attribution/ledger");
    // Daily is the Today period of Performance.
    case "performance":
      return /^(\/t\/[^/]+)?\/(attribution|daily)(\/|$)/.test(pathname) && !under(pathname, "/attribution/ledger");
    default:
      return new RegExp(`^(/t/[^/]+)?/${key}(/|$)`).test(pathname);
  }
}

export function navModel({ pathname, scope, home = scope, fundWide, seesBook, homeSeesBook = seesBook }: NavInput): NavModel {
  const section = sectionFor(pathname);
  const base = baseOf(scope);
  const homeBase = baseOf(home);

  const tabs = (key: NavKey): NavTab[] => {
    let list: Omit<NavTab, "active">[] = [];
    let active = (t: Omit<NavTab, "active">) => under(pathname, t.href);
    // A holding's page has a breadcrumb, not the section's tabs.
    if (/^\/t\/[^/]+\/h\//.test(pathname)) return [];
    if (key === "portfolio") {
      list = portfolioTabs(scope, fundWide, seesBook);
      active = (t) => portfolioActive(t.key, pathname);
    }
    if (key === "research" && base) {
      list = [
        { key: "chats", label: "Chats and boards", href: `${base}/agent` },
        { key: "sell-side", label: "Sell-side calls", href: `${base}/sell-side` },
      ];
      // A general chat lives at /hoot/<id>, a holding's research at /t/<scope>/agent/h/<ticker>.
      active = (t) => under(pathname, t.href) || (t.key === "chats" && under(pathname, "/hoot"));
    }
    // One report's page has a breadcrumb back to the calendar instead.
    if (key === "calendar" && base && !/\/earnings\/[^/]+/.test(pathname)) {
      list = [
        { key: "earnings", label: "Earnings", href: `${base}/earnings` },
        { key: "economic-calendar", label: "Economic releases", href: `${base}/economic-calendar` },
      ];
    }
    return list.length > 1 ? list.map((t) => ({ ...t, active: active(t) })) : [];
  };

  const item = (key: NavKey, href: string | null): NavItem | null => (href ? { key, label: TITLES[key], href, active: section === key } : null);
  const portfolioHref = fundWide ? `/t/${FUND_SCOPE_SLUG}` : homeSeesBook && homeBase ? `${homeBase}/attribution` : "/backtesting";
  const main = [
    item("home", "/"),
    item("portfolio", portfolioHref),
    item("research", homeBase && `${homeBase}/agent`),
    item("movements", homeBase && `${homeBase}/movements`),
    item("models", homeBase && `${homeBase}/models`),
    item("calendar", homeBase && `${homeBase}/earnings`),
  ].filter((x): x is NavItem => !!x);
  const manage = fundWide ? [item("weekly", "/weekly")!, item("changelog", "/changelog")!, item("admin", "/admin")!] : [];

  const back = backFor(pathname, base);
  const title = section ? TITLES[section] : "";
  return {
    main,
    manage,
    section,
    title,
    crumbs: back ? [{ label: back.label, href: back.href }] : title ? [{ label: title }] : [],
    tabs: section ? tabs(section) : [],
    back,
  };
}

/** A page by name: for ⌘K's "Go to" and for Hoot's "take me to …" commands (`hoot` is the name Hoot knows it by). */
export type Destination = { label: string; hoot?: string; href: string; hint: string; keywords?: string };

/** Every page this member can open in the current scope, in sidebar order. */
export function destinations({ scope, fundWide, seesBook }: Omit<NavInput, "pathname" | "home" | "homeSeesBook">): Destination[] {
  const base = baseOf(scope);
  const bookBase = scope === "fund" ? "" : base;
  const out: Destination[] = [{ label: "Home", hoot: "Home", href: "/", hint: "Ask Hoot, and what needs you", keywords: "today dashboard start" }];
  const book = seesBook && bookBase !== null;
  // The team in view's holdings come before the fund's, so "holdings" opens the team you're looking at.
  if (base && scope !== "fund") out.push({ label: "Team page", hoot: "Holdings", href: base, hint: "The team's holdings and what needs attention", keywords: "holdings positions team" });
  if (fundWide) out.push({ label: "Portfolio", hoot: "Portfolio", href: `/t/${FUND_SCOPE_SLUG}`, hint: "Fund value, chart and positions", keywords: "overview holdings positions" });
  if (base) {
    out.push(
      { label: "Movements", hoot: "Movements", href: `${base}/movements`, hint: "400 bp moves and their write-ups" },
      { label: "Models", hoot: "Models", href: `${base}/models`, hint: "Values to decide from new filings", keywords: "xlsx excel" },
      { label: "Research", hoot: "Research", href: `${base}/agent`, hint: "Chats with Hoot and holding boards", keywords: "hoot ask chat chats conversations agent boards research boards holding boards" },
      { label: "Sell-side calls", hoot: "Sell-side calls", href: `${base}/sell-side`, hint: "Record a call, get a brief", keywords: "sell side analyzer record" },
      { label: "Earnings", hoot: "Earnings", href: `${base}/earnings`, hint: "Reports coming up and just in", keywords: "calendar earnings reports" },
      { label: "Economic releases", hoot: "Economic calendar", href: `${base}/economic-calendar`, hint: "CPI, jobs, rates", keywords: "economic calendar macro cpi" },
    );
  }
  if (book) {
    out.push(
      { label: "Performance", hoot: "Attribution", href: `${bookBase}/attribution`, hint: "Where the return came from", keywords: "attribution portfolio performance" },
      { label: "Performance today", hoot: "Daily performance", href: `${bookBase}/daily`, hint: "Today's return and attribution, live", keywords: "today intraday live daily delta pt sheet" },
      { label: "Risk", hoot: "Risk", href: `${bookBase}/risk`, hint: "Volatility, tracking error, stress tests", keywords: "var beta stress" },
      { label: "Exposure", hoot: "Exposure", href: `${bookBase}/exposure`, hint: "Sector tilts and look-through", keywords: "sectors factors etf" },
    );
  }
  out.push({ label: "Backtesting", hoot: "Backtesting", href: "/backtesting", hint: "Replay a weight change", keywords: `what if scenario backtest${book ? "" : " portfolio"}` });
  if (fundWide) {
    out.push(
      { label: "Activity", hoot: "Activity", href: "/attribution/ledger", hint: "Trades, cash and tickets to review", keywords: "ledger trades tickets" },
      { label: "Weekly update", hoot: "Weekly update", href: "/weekly", hint: "The Sunday pack for Aadi", keywords: "weekly pack email" },
      { label: "Changelog", hoot: "Changelog", href: "/changelog", hint: "Every change merged into the app", keywords: "what's new" },
      { label: "Admin", hoot: "Admin", href: "/admin", hint: "Members, jobs and connections, PT sheet", keywords: "administration settings members" },
    );
  }
  return out;
}
