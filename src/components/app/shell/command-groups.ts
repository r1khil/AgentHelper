// Client-safe and pure: what ⌘K lists for a query, and in what order. Enter runs the first item unless the member
// arrowed to another, so the order is the Enter rule: a holding, page, scope or theme the query names comes first,
// and asking Hoot comes second. ⌘/Ctrl+Enter (or Tab) always asks Hoot.
import type { CommandHolding, RecentChat } from "@/lib/nav-data";
import { fmtDay, relativeTime } from "@/lib/format";
import { HOLDING_TABS, type HoldingTab } from "@/lib/hoot/app-actions";
import { holdingHref } from "@/lib/scope";

/** `hoot` is the name Hoot's "take me to …" command knows the page by; it counts as a name here too. */
export type CommandPage = { label: string; href: string; hint?: string; keywords?: string; hoot?: string };
export type CommandScope = { label: string; href: string };

export type CommandItem =
  | { kind: "holding"; id: string; holding: CommandHolding }
  | { kind: "ask"; id: string; text: string; ticker: string | null; teamSlug: string | null }
  /** A starting question for the page in view. Choosing it fills the box to edit; it isn't sent. */
  | { kind: "suggest"; id: string; text: string }
  | { kind: "page"; id: string; page: CommandPage }
  /** A recent Hoot chat, reopened as it was. */
  | { kind: "recent"; id: string; chat: RecentChat }
  | { kind: "scope"; id: string; scope: CommandScope }
  | { kind: "theme"; id: string; theme: "dark" | "light" };

export type CommandGroup = { label: string; items: CommandItem[] };

export type CommandInput = {
  query: string;
  holdings: CommandHolding[];
  pages: CommandPage[];
  scopes: CommandScope[];
  /** The team a question not about one holding is filed under. */
  teamSlug: string | null;
  /** The scope in view (the fund's slug or a team's); holdings and boards open there. */
  scopeSlug: string | null;
  dark: boolean;
  /** On a holding page: its ticker and the scope in its URL. A typed question goes to that holding's research. */
  pageTicker?: string | null;
  pageTeamSlug?: string | null;
  /** Starting questions for the page in view, listed while nothing is typed. */
  suggestions?: string[];
  /**
   * ⌘J opens in "ask" mode: with nothing typed it lists questions about the page (`pageLabel`), recent answers and a
   * few pages. ⌘K opens in "search" mode: pages first.
   */
  mode?: "ask" | "search";
  pageLabel?: string;
  recent?: RecentChat[];
};

/** "2m ago" for a recent answer. */
export const recentWhen = (chat: RecentChat, now = Date.now()) => relativeTime(chat.at, now);

const shortDate = (iso: string) => fmtDay(iso);

/** Lowercase, hyphens as spaces ("sell side" finds "Sell-side calls"), single spaces. */
export const normalize = (s: string) => s.toLowerCase().replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();

/** The query names this page: it is the page's label or Hoot's name for it, or the start of one, or one of its keywords. */
export function namesPage(query: string, page: CommandPage): boolean {
  const q = normalize(query);
  if (q.length < 2) return false;
  if ([page.label, page.hoot].some((n) => n && normalize(n).startsWith(q))) return true;
  return normalize(page.keywords ?? "")
    .split(" ")
    .includes(q);
}

/**
 * Pages from before the five screens, by the page (its `hoot` name) that has their content now. Typing an old name
 * opens that page, and the hint says where the content went.
 */
export const FORMER_NAMES: { name: string; page: string; hint: string; label?: string; query?: string }[] = [
  { name: "Research", page: "Threads", hint: "Every conversation with Hoot. Ask a new one from Home" },
  { name: "Chats", page: "Threads", hint: "Every conversation with Hoot" },
  { name: "Conversations", page: "Threads", hint: "Every conversation with Hoot" },
  { name: "Hoot", page: "Home", hint: "Ask Hoot here. Every thread is in the sidebar" },
  { name: "Team page", page: "Portfolio", hint: "A team's page is the Portfolio filtered to the team" },
  { name: "Attribution", page: "Performance", hint: "Attribution is the Portfolio's Performance view" },
  { name: "Daily performance", page: "Performance", label: "Performance today", query: "?period=today", hint: "Today's return and what drove it, live" },
  { name: "Backtesting", page: "What if", hint: "Backtesting is the Portfolio's What if view" },
  { name: "Ledger", page: "Activity", hint: "The ledger is the Portfolio's Activity view" },
  { name: "Earnings", page: "Markets", hint: "Earnings are on Markets, and on each holding's Earnings tab" },
  { name: "Economic releases", page: "Markets", hint: "Economic releases are on Markets" },
  { name: "Economic calendar", page: "Markets", hint: "Economic releases are on Markets" },
  { name: "Calendar", page: "Markets", hint: "Earnings and economic releases are on Markets" },
];

/** The pages the query names by what they used to be called, each once, with a hint that says where it went. */
export function formerPages(query: string, pages: CommandPage[]): CommandPage[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const out: CommandPage[] = [];
  for (const f of FORMER_NAMES) {
    if (!normalize(f.name).startsWith(q)) continue;
    const p = pages.find((x) => (x.hoot ?? x.label) === f.page);
    const label = f.label ?? p?.label;
    if (p && label && !out.some((o) => o.label === label)) out.push({ ...p, label, href: `${p.href}${f.query ?? ""}`, hint: f.hint });
  }
  return out;
}

/** The query names this scope: the start of its name or of a word in it ("tech" → Technology, "fund" → Whole fund). */
export function namesScope(query: string, scope: CommandScope): boolean {
  const q = normalize(query);
  if (q.length < 2) return false;
  const name = normalize(scope.label);
  return name.startsWith(q) || name.includes(` ${q}`);
}

const THEME_WORDS = ["dark", "light", "mode", "theme"];

/** Every word is the start of "dark", "light", "mode" or "theme" ("dark mo", "light", "theme"). */
function themeQuery(words: string[]) {
  return words.length > 0 && words.every((w) => THEME_WORDS.some((t) => t.startsWith(w)));
}

export function commandGroups({ query, holdings, pages, scopes, teamSlug, scopeSlug, dark, pageTicker = null, pageTeamSlug = null, suggestions = [], mode = "search", pageLabel, recent = [] }: CommandInput): CommandGroup[] {
  const q = normalize(query);
  const words = q.split(" ").filter(Boolean);
  const matches = (text: string) => words.every((w) => normalize(text).includes(w));

  if (!q && mode === "ask") {
    return [
      { label: pageLabel ? `Ask about ${pageLabel}` : "Ask Hoot", items: suggestions.map((text): CommandItem => ({ kind: "suggest", id: `suggest:${text}`, text })) },
      { label: "Recent answers", items: recent.map((chat): CommandItem => ({ kind: "recent", id: `recent:${chat.href}`, chat })) },
      { label: "Go to", items: pages.slice(0, 3).map((p): CommandItem => ({ kind: "page", id: `page:${p.href}:${p.label}`, page: p })) },
    ].filter((g) => g.items.length);
  }

  if (!q) {
    return [
      { label: "Go to", items: pages.slice(0, 8).map((p): CommandItem => ({ kind: "page", id: `page:${p.href}:${p.label}`, page: p })) },
      { label: "Ask Hoot", items: suggestions.map((text): CommandItem => ({ kind: "suggest", id: `suggest:${text}`, text })) },
    ].filter((g) => g.items.length);
  }

  // Items the query names outright. Their groups move ahead of the question for Hoot, and they lead their group.
  const named = new Set<string>();

  // A ticker then more words ("nvda model") names the holding too: the rest says which of its tabs, or asks about it.
  const holdingHits = holdings
    .map((h) => ({ h, rank: h.ticker.toLowerCase() === q ? 0 : h.ticker.toLowerCase().startsWith(q) || h.ticker.toLowerCase() === words[0] ? 1 : matches(`${h.ticker} ${h.company} ${h.team}`) ? 2 : 9 }))
    .filter((x) => x.rank < 9)
    .sort((a, b) => a.rank - b.rank || a.h.ticker.localeCompare(b.h.ticker))
    .slice(0, 5)
    .map((x) => x.h);
  // The query starts with a ticker ("nvda", "nvda earnings"): that holding is what it names.
  const top = holdingHits[0] && holdingHits[0].ticker.toLowerCase().startsWith(words[0] ?? "") ? holdingHits[0] : null;
  if (top) named.add(`holding:${top.ticker}`);

  const ask: CommandItem[] = [];
  if (top) {
    if (words.length > 1 && q.length > 2) ask.push({ kind: "ask", id: "ask:free", text: query.trim(), ticker: top.ticker, teamSlug: top.teamSlug });
    ask.push(
      { kind: "ask", id: `ask:moved:${top.ticker}`, text: `What moved ${top.ticker} in the last session vs the S&P 500?`, ticker: top.ticker, teamSlug: top.teamSlug },
      { kind: "ask", id: `ask:10q:${top.ticker}`, text: `Summarize ${top.ticker}'s last 10-Q, with sources`, ticker: top.ticker, teamSlug: top.teamSlug },
    );
  } else if (q.length > 2) {
    ask.push({ kind: "ask", id: "ask:free", ...typedQuestionTarget({ teamSlug, pageTicker, pageTeamSlug }), text: query.trim() });
  }

  const go: CommandItem[] = [];
  if (top) {
    // The holding's tabs, in the scope in view: the fund shows every team's holdings, a team its own (⌘K lists only
    // those). "nvda model" lists the tab the rest of the query names; the ticker alone, Threads and Earnings.
    const rest = words.slice(1);
    const tabs = (Object.keys(HOLDING_TABS) as HoldingTab[]).filter((t) => (rest.length ? rest.some((w) => normalize(HOLDING_TABS[t]).split(" ").some((x) => x.startsWith(w))) : t === "threads" || t === "earnings"));
    for (const t of tabs) {
      const hint =
        t === "earnings" ? (top.nextReport ? `${shortDate(top.nextReport)}${top.nextReportEstimated ? " est." : ""}` : "No report scheduled") : t === "threads" ? "Hoot's conversations about this holding" : undefined;
      go.push({ kind: "page", id: `go:${t}:${top.ticker}`, page: { label: `${top.ticker} ${HOLDING_TABS[t].toLowerCase()}`, href: holdingHref(scopeSlug, top.teamSlug, top.ticker, `?tab=${t}`), hint } });
      if (rest.length) named.add(`go:${t}:${top.ticker}`);
    }
  }
  // A page's own name first, then an old name (Attribution, Backtesting) unless it opens a page already named. An old
  // name that opens a view of a page ("daily": Performance for today) beats the page itself.
  const direct = pages.filter((p) => namesPage(q, p));
  const former = formerPages(q, pages).filter((f) => !direct.some((p) => p.href === f.href));
  const namedPages = [...former.filter((f) => f.href.includes("?")), ...direct, ...former.filter((f) => !f.href.includes("?"))];
  const otherPages = pages.filter((p) => !namedPages.some((n) => n.href === p.href) && matches(`${p.label} ${p.hoot ?? ""} ${p.keywords ?? ""} ${p.hint ?? ""}`));
  for (const p of [...namedPages, ...otherPages].slice(0, 6)) {
    const id = `page:${p.href}:${p.label}`;
    if (namedPages.includes(p)) named.add(id);
    go.push({ kind: "page", id, page: p });
  }

  const doItems: CommandItem[] = [];
  const namedScopes = scopes.filter((s) => namesScope(q, s));
  const otherScopes = scopes.filter((s) => !namesScope(q, s) && (matches(s.label) || s.label === top?.team));
  for (const s of [...namedScopes, ...otherScopes].slice(0, 3)) {
    const id = `scope:${s.href}`;
    if (namedScopes.includes(s)) named.add(id);
    doItems.push({ kind: "scope", id, scope: s });
  }
  if (themeQuery(words)) {
    // "dark mode" means dark whatever is on now; "theme" or "mode" alone flips it.
    const asked = words.some((w) => "dark".startsWith(w)) ? "dark" : words.some((w) => "light".startsWith(w)) ? "light" : null;
    doItems.push({ kind: "theme", id: "theme", theme: asked ?? (dark ? "light" : "dark") });
    if (q.length >= 2) named.add("theme");
  }

  const groups: CommandGroup[] = [
    { label: "Holding", items: holdingHits.map((h): CommandItem => ({ kind: "holding", id: `holding:${h.ticker}`, holding: h })) },
    { label: "Ask Hoot", items: ask },
    { label: "Go to", items: go },
    { label: "Do", items: doItems },
  ]
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, items: [...g.items.filter((i) => named.has(i.id)), ...g.items.filter((i) => !named.has(i.id))] }));
  const naming = (g: CommandGroup) => g.items.some((i) => named.has(i.id));
  // ⌘J is for asking: a typed question goes to Hoot on Enter, with what it names listed after.
  if (mode === "ask") return [...groups.filter((g) => g.label === "Ask Hoot"), ...groups.filter((g) => g.label !== "Ask Hoot")];
  return [...groups.filter(naming), ...groups.filter((g) => !naming(g))];
}

/** What Enter runs when the member hasn't arrowed anywhere. */
export function enterItem(groups: CommandGroup[]): CommandItem | null {
  return groups[0]?.items[0] ?? null;
}

/** Where a typed question goes: on a holding page, that holding's research; anywhere else a general chat. */
export function typedQuestionTarget({ teamSlug, pageTicker = null, pageTeamSlug = null }: Pick<CommandInput, "teamSlug" | "pageTicker" | "pageTeamSlug">): { ticker: string | null; teamSlug: string | null } {
  return pageTicker ? { ticker: pageTicker, teamSlug: pageTeamSlug } : { ticker: null, teamSlug };
}
