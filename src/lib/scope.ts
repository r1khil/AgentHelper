// Client-safe: which scope (the whole fund or one sector team) a page is in, and where a team's item opens from it.
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/** The scope of the last scoped page viewed (see pathScope), so pages outside /t/ (Today, a Hoot chat) keep showing it. */
export const SCOPE_COOKIE = "owl_scope";

type ScopeTeam = { id: string; slug: string };

/** The scope segment of a /t/<slug>/… URL, or null for pages outside /t/. */
export function scopeSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/t\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** The fund's own book pages (Attribution, Risk, Exposure and the ledger) live outside /t/ and are always the fund. */
export function isFundBookPath(pathname: string): boolean {
  return /^\/(attribution|risk|exposure)(\/|$)/.test(pathname);
}

/** Whether this member can view `slug`: the fund for execs and admins, or one of their teams. */
export function canViewScope(slug: string | null | undefined, teams: readonly ScopeTeam[], fundWide: boolean): slug is string {
  if (!slug) return false;
  return slug === FUND_SCOPE_SLUG ? fundWide : teams.some((t) => t.slug === slug);
}

/**
 * The scope an item owned by team `owner` opens in, seen from scope `current`. The fund shows every team's items and
 * a team shows its own, so those stay put; only a different team's item needs that team's scope.
 */
export function scopeFor(current: string | null | undefined, owner: string): string {
  return current === FUND_SCOPE_SLUG || current === owner ? current : owner;
}

/** Whether opening an item owned by `owner` from `current` changes the scope. */
export function switchesScope(current: string | null | undefined, owner: string): boolean {
  return !!current && scopeFor(current, owner) !== current;
}

/** `/t/<scope>/<path>` for an item owned by `owner`, opened from `current` (see scopeFor). */
export function scopedHref(current: string | null | undefined, owner: string, path = ""): string {
  const rest = path && !path.startsWith("/") && !path.startsWith("?") ? `/${path}` : path;
  return `/t/${scopeFor(current, owner)}${rest}`;
}

const t = (ticker: string) => encodeURIComponent(ticker);

/** A holding's page. */
export const holdingHref = (current: string | null | undefined, owner: string, ticker: string, query = "") => scopedHref(current, owner, `/h/${t(ticker)}${query}`);
/** A holding's research board, optionally with one of its chats open. */
export const boardHref = (current: string | null | undefined, owner: string, ticker: string, chatId?: string | null) =>
  scopedHref(current, owner, `/agent/h/${t(ticker)}${chatId ? `?chat=${encodeURIComponent(chatId)}` : ""}`);
/** One report's earnings page. */
export const earningsHref = (current: string | null | undefined, owner: string, id: string) => scopedHref(current, owner, `/earnings/${id}`);
/** One movement write-up. */
export const movementHref = (current: string | null | undefined, owner: string, id: string) => scopedHref(current, owner, `/movements/${id}`);
/** One model. */
export const modelHref = (current: string | null | undefined, owner: string, id: string) => scopedHref(current, owner, `/models/${id}`);
/** One sell-side call. */
export const sellSideHref = (current: string | null | undefined, owner: string, id: string) => scopedHref(current, owner, `/sell-side/${id}`);

/**
 * The scope a URL is in by itself: /t/<slug> is that scope, and the fund's book pages are the fund. Null for pages
 * outside /t/ (Today, a general Hoot chat, Backtesting, Manage), and for a scope this member can't view.
 */
export function pathScope(pathname: string, teams: readonly ScopeTeam[], fundWide: boolean): string | null {
  const slug = scopeSlugFromPath(pathname);
  if (slug) return canViewScope(slug, teams, fundWide) ? slug : null;
  return fundWide && isFundBookPath(pathname) ? FUND_SCOPE_SLUG : null;
}

/**
 * The scope the app chrome shows for a URL: the URL's own scope (see pathScope); otherwise the one the member was last
 * in (`remembered`), so opening Today or a Hoot chat never changes it; and only without either, the fund for execs
 * and admins, else the member's team.
 */
export function resolveScope<T extends ScopeTeam>({
  pathname,
  remembered,
  teams,
  fundWide,
  userTeamId,
}: {
  pathname: string;
  remembered: string | null | undefined;
  teams: readonly T[];
  fundWide: boolean;
  userTeamId: string | null;
}): T | "fund" | null {
  const slug = pathScope(pathname, teams, fundWide) ?? (canViewScope(remembered, teams, fundWide) ? remembered : null);
  if (slug === FUND_SCOPE_SLUG) return "fund";
  if (slug) return teams.find((x) => x.slug === slug) ?? null;
  if (fundWide) return "fund";
  return teams.find((x) => x.id === userTeamId) ?? teams[0] ?? null;
}

/** The URL slug for a resolved scope. */
export function scopeSlug(scope: ScopeTeam | "fund" | null): string | null {
  return scope === "fund" ? FUND_SCOPE_SLUG : (scope?.slug ?? null);
}
