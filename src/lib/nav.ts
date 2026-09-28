// Client-safe: the rail's five destinations and each one's header tabs, worked out from the URL.
import { FUND_SCOPE_SLUG } from "@/lib/constants";

export type RailKey = "today" | "holdings" | "research" | "calendar" | "portfolio" | "manage";

export type NavTab = { key: string; label: string; href: string; active: boolean };
export type RailItem = { key: RailKey; label: string; href: string; active: boolean };

export type NavScope = { slug: string } | "fund" | null;

export type NavInput = {
  pathname: string;
  /** Whose holdings the scoped pages show: a team, the whole fund, or nobody (no team yet). */
  scope: NavScope;
  /** Execs and admins: the whole fund, and the Manage pages. */
  fundWide: boolean;
  /** Position sizes and P&L for the scope in view (Attribution, Risk, Exposure). */
  seesBook: boolean;
};

export type NavModel = { rail: RailItem[]; manage: RailItem | null; section: RailKey | null; title: string; tabs: NavTab[] };

const TITLES: Record<RailKey, string> = {
  today: "Today",
  holdings: "Holdings",
  research: "Research",
  calendar: "Calendar",
  portfolio: "Portfolio",
  manage: "Manage",
};

/** Which rail destination a URL belongs to. Every page in the app has exactly one. */
export function sectionFor(pathname: string): RailKey | null {
  if (pathname === "/") return "today";
  if (/^\/hoot(\/|$)/.test(pathname)) return "research";
  if (/^\/(attribution|risk|exposure|backtesting)(\/|$)/.test(pathname)) return "portfolio";
  if (/^\/(weekly|changelog|admin)(\/|$)/.test(pathname)) return "manage";
  const m = pathname.match(/^\/t\/[^/]+(?:\/([^/]+))?/);
  if (!m) return null;
  switch (m[1]) {
    case undefined:
    case "h":
    case "movements":
    case "models":
      return "holdings";
    case "agent":
    case "sell-side":
      return "research";
    case "earnings":
    case "economic-calendar":
      return "calendar";
    case "attribution":
    case "risk":
    case "exposure":
      return "portfolio";
    default:
      return null;
  }
}

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

export function navModel({ pathname, scope, fundWide, seesBook }: NavInput): NavModel {
  const section = sectionFor(pathname);
  const base = scope === "fund" ? `/t/${FUND_SCOPE_SLUG}` : scope ? `/t/${scope.slug}` : null;
  // The fund's own book pages live outside /t/; a team's live under it.
  const bookBase = scope === "fund" ? "" : base;

  const tabs = (key: RailKey): NavTab[] => {
    const list: Omit<NavTab, "active">[] = [];
    if (key === "holdings" && base) {
      list.push({ key: "holdings", label: "Holdings", href: base }, { key: "movements", label: "Movements", href: `${base}/movements` }, { key: "models", label: "Models", href: `${base}/models` });
    }
    if (key === "research" && base) {
      list.push({ key: "conversations", label: "Conversations", href: `${base}/agent` }, { key: "sell-side", label: "Sell-side calls", href: `${base}/sell-side` });
    }
    if (key === "portfolio") {
      if (seesBook && bookBase !== null) {
        list.push(
          { key: "attribution", label: "Attribution", href: `${bookBase}/attribution` },
          { key: "risk", label: "Risk", href: `${bookBase}/risk` },
          { key: "exposure", label: "Exposure", href: `${bookBase}/exposure` },
        );
      }
      list.push({ key: "backtesting", label: "Backtesting", href: "/backtesting" });
    }
    if (key === "manage" && fundWide) {
      list.push({ key: "weekly", label: "Weekly update", href: "/weekly" }, { key: "changelog", label: "Changelog", href: "/changelog" }, { key: "admin", label: "Admin", href: "/admin" });
    }
    return list.map((t) => ({ ...t, active: tabActive(key, t, pathname) }));
  };

  const item = (key: RailKey, href: string | null): RailItem | null => (href ? { key, label: TITLES[key], href, active: section === key } : null);
  const portfolioHref = seesBook && bookBase !== null ? `${bookBase}/attribution` : "/backtesting";
  const rail = [
    item("today", "/"),
    item("holdings", base),
    item("research", base && `${base}/agent`),
    item("calendar", base && `${base}/earnings`),
    item("portfolio", portfolioHref),
  ].filter((x): x is RailItem => !!x);

  return {
    rail,
    manage: fundWide ? item("manage", "/weekly") : null,
    section,
    title: section ? TITLES[section] : "",
    tabs: section && section !== "today" && section !== "calendar" ? tabs(section) : [],
  };
}

function tabActive(section: RailKey, tab: Omit<NavTab, "active">, pathname: string) {
  if (section === "holdings" && tab.key === "holdings") return pathname === tab.href || under(pathname, `${tab.href}/h`);
  // A general conversation lives at /hoot/<id>, a holding board at /t/<scope>/agent/h/<ticker>.
  if (section === "research" && tab.key === "conversations") return under(pathname, tab.href) || under(pathname, "/hoot");
  if (section === "portfolio") return new RegExp(`/${tab.key}(/|$)`).test(pathname);
  return under(pathname, tab.href);
}

/** A page by name: for ⌘K's "Go to" and for Hoot's "take me to …" commands (`hoot` is the name Hoot knows it by). */
export type Destination = { label: string; hoot?: string; href: string; hint: string; keywords?: string };

/** Every page this member can open in the current scope, in rail order. */
export function destinations({ scope, fundWide, seesBook }: Omit<NavInput, "pathname">): Destination[] {
  const base = scope === "fund" ? `/t/${FUND_SCOPE_SLUG}` : scope ? `/t/${scope.slug}` : null;
  const bookBase = scope === "fund" ? "" : base;
  const out: Destination[] = [{ label: "Today", hoot: "Today", href: "/", hint: "Hoot's list, last session, coming up", keywords: "home dashboard" }];
  if (base) {
    out.push(
      { label: "Holdings", hoot: "Holdings", href: base, hint: "Every holding in scope", keywords: "portfolio positions" },
      { label: "Movements", hoot: "Movements", href: `${base}/movements`, hint: "400 bp moves and their write-ups" },
      { label: "Models", hoot: "Models", href: `${base}/models`, hint: "Proposed values from new filings", keywords: "xlsx excel" },
      { label: "Conversations", hoot: "Hoot", href: `${base}/agent`, hint: "Research chats with Hoot", keywords: "hoot chat research agent" },
      { label: "Sell-side calls", hoot: "Sell-side analyzer", href: `${base}/sell-side`, hint: "Record a call, get a brief", keywords: "sell side analyzer record" },
      { label: "Calendar", hoot: "Earnings", href: `${base}/earnings`, hint: "Earnings and economic releases", keywords: "earnings reports" },
      { label: "Economic releases", hoot: "Economic calendar", href: `${base}/economic-calendar`, hint: "CPI, jobs, rates", keywords: "economic calendar macro cpi" },
    );
  }
  if (seesBook && bookBase !== null) {
    out.push(
      { label: "Attribution", hoot: "Attribution", href: `${bookBase}/attribution`, hint: "Where the return came from", keywords: "performance" },
      { label: "Risk", hoot: "Risk", href: `${bookBase}/risk`, hint: "Volatility, tracking error, stress tests", keywords: "var beta stress" },
      { label: "Exposure", hoot: "Exposure", href: `${bookBase}/exposure`, hint: "Sector weights and factor tilts", keywords: "sectors factors etf" },
    );
  }
  out.push({ label: "Backtesting", hoot: "Backtesting", href: "/backtesting", hint: "Replay different weights", keywords: "what if scenario backtest" });
  if (fundWide) {
    out.push(
      { label: "Ledger", href: "/attribution/ledger", hint: "Trades and cash flows", keywords: "trades tickets" },
      { label: "Weekly update", hoot: "Weekly update", href: "/weekly", hint: "The Sunday pack for Aadi", keywords: "weekly pack email" },
      { label: "Changelog", hoot: "Changelog", href: "/changelog", hint: "Every change merged into the app", keywords: "what's new" },
      { label: "Admin", hoot: "Admin", href: "/admin", hint: "Members, connections, jobs", keywords: "administration settings members" },
    );
  }
  return out;
}
