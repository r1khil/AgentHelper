// Client-safe: the Screener's URL state.

export const SCREENER_TABS = [
  { key: "look", label: "Worth a look" },
  { key: "changes", label: "Filing changes" },
  { key: "pitches", label: "Pitches" },
  { key: "watchlist", label: "Watchlist" },
] as const;
export type ScreenerTab = (typeof SCREENER_TABS)[number]["key"];

export type Track = "all" | "value" | "garp";

/**
 * `?tab=` picks the list; `?team=` a team's slug or `all` (members start on their own team, execs and admins on the
 * whole fund); `?track=` narrows Worth a look to Value or GARP; `?show=all` lists filing changes already marked.
 */
export type ScreenerQuery = { tab: ScreenerTab; team: string | null; track: Track; showAll: boolean };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseScreenerQuery(sp: SearchParams): ScreenerQuery {
  const tab = one(sp.tab);
  const track = one(sp.track);
  return {
    tab: SCREENER_TABS.some((t) => t.key === tab) ? (tab as ScreenerTab) : "look",
    team: one(sp.team)?.trim() || null,
    track: track === "value" || track === "garp" ? track : "all",
    showAll: one(sp.show) === "all",
  };
}

/** The Screener's address with some of its state changed; defaults are left out of the URL. */
export function screenerHref(q: ScreenerQuery, change: Partial<ScreenerQuery> = {}): string {
  const n = { ...q, ...change };
  const p = new URLSearchParams();
  if (n.tab !== "look") p.set("tab", n.tab);
  if (n.team) p.set("team", n.team);
  if (n.tab === "look" && n.track !== "all") p.set("track", n.track);
  if (n.tab === "changes" && n.showAll) p.set("show", "all");
  const s = p.toString();
  return s ? `/screener?${s}` : "/screener";
}
