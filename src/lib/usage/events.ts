/**
 * The usage events the app records (usage_events). Shared by the browser tracker, the ingest route and the Admin
 * Usage tab. Props hold ids, counts and labels only, never text a member typed.
 */
export const USAGE_EVENTS = [
  /** A page seen: { ms: time in view, vitals?: { LCP, INP, CLS, FCP, TTFB } }. Sent when the member leaves it. */
  "page_view",
  /** ⌘K or ⌘J opened: { mode: "search" | "ask", via: "shortcut" | "click" }. */
  "palette_open",
  /** A palette row chosen: { kind: "holding" | "page" | "recent" | "scope" | "theme" | "suggest" | "ask" }. */
  "palette_select",
  /** A question sent to Hoot (recorded by the server): { holding: boolean, fund: boolean, first: boolean }. */
  "hoot_ask",
  /** The sidebar hidden or shown: { collapsed }. */
  "sidebar_toggle",
  /** A click on an element marked data-track="<label>": { label }. */
  "click",
  /** An uncaught error in the browser: { message, source? }. */
  "client_error",
] as const;
export type UsageEventName = (typeof USAGE_EVENTS)[number];

export type UsageEventInput = {
  name: UsageEventName;
  /** Client time, ISO; the server keeps it when it's within a day of now. */
  at?: string;
  route?: string | null;
  team?: string | null;
  props?: Record<string, unknown>;
};

/** Segments that are followed by an id (or the page for one thing) in the URL. */
const ID_AFTER = new Set(["hoot", "earnings", "models", "movements", "sell-side", "weekly"]);

/**
 * A pathname with its ids replaced, so every holding page counts as one page: /t/tech/h/NVDA → /t/:team/h/:ticker.
 * Also returns the team slug in view, which the Admin tab groups by separately.
 */
export function usageRoute(pathname: string): { route: string; team: string | null } {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  let team: string | null = null;
  const out = parts.map((seg, i) => {
    const prev = parts[i - 1];
    if (prev === "t" && i === 1) {
      team = seg;
      return ":team";
    }
    if (prev === "h" && parts[0] === "t") return ":ticker";
    if (prev && ID_AFTER.has(prev)) return prev === "weekly" ? ":week" : ":id";
    return seg;
  });
  return { route: `/${out.join("/")}`, team };
}

const MAX_PROPS_BYTES = 2000;

/** Keeps an incoming event if it's one of ours, trimming long strings and dropping oversized props. */
export function cleanUsageEvent(raw: unknown, now = Date.now()): (UsageEventInput & { at: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.name !== "string" || !(USAGE_EVENTS as readonly string[]).includes(e.name)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);
  const t = typeof e.at === "string" ? Date.parse(e.at) : NaN;
  const at = Number.isFinite(t) && Math.abs(now - t) < 86_400_000 ? new Date(t).toISOString() : new Date(now).toISOString();
  let props: Record<string, unknown> = {};
  if (e.props && typeof e.props === "object" && !Array.isArray(e.props)) {
    const json = JSON.stringify(e.props);
    if (json.length <= MAX_PROPS_BYTES) props = e.props as Record<string, unknown>;
  }
  return { name: e.name as UsageEventName, at, route: str(e.route, 200), team: str(e.team, 64), props };
}
