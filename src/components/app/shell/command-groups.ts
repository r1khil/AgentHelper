// Client-safe and pure: what ⌘K lists for a query, and in what order. Enter runs the first item unless the member
// arrowed to another, so the order is the Enter rule: a holding, page, scope or theme the query names comes first,
// and asking Hoot comes second. ⌘/Ctrl+Enter (or Tab) always asks Hoot.
import type { CommandHolding } from "@/lib/nav-data";
import { fmtDay } from "@/lib/format";
import { boardHref, holdingHref } from "@/lib/scope";

/** `hoot` is the name Hoot's "take me to …" command knows the page by; it counts as a name here too. */
export type CommandPage = { label: string; href: string; hint?: string; keywords?: string; hoot?: string };
export type CommandScope = { label: string; href: string };

export type CommandItem =
  | { kind: "holding"; id: string; holding: CommandHolding }
  | { kind: "ask"; id: string; text: string; ticker: string | null; teamSlug: string | null }
  /** A starting question for the page in view. Choosing it fills the box to edit; it isn't sent. */
  | { kind: "suggest"; id: string; text: string }
  | { kind: "page"; id: string; page: CommandPage }
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
};

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

export function commandGroups({ query, holdings, pages, scopes, teamSlug, scopeSlug, dark, pageTicker = null, pageTeamSlug = null, suggestions = [] }: CommandInput): CommandGroup[] {
  const q = normalize(query);
  const words = q.split(" ").filter(Boolean);
  const matches = (text: string) => words.every((w) => normalize(text).includes(w));

  if (!q) {
    return [
      { label: "Go to", items: pages.slice(0, 8).map((p): CommandItem => ({ kind: "page", id: `page:${p.href}:${p.label}`, page: p })) },
      { label: "Ask Hoot", items: suggestions.map((text): CommandItem => ({ kind: "suggest", id: `suggest:${text}`, text })) },
    ].filter((g) => g.items.length);
  }

  // Items the query names outright. Their groups move ahead of the question for Hoot, and they lead their group.
  const named = new Set<string>();

  const holdingHits = holdings
    .map((h) => ({ h, rank: h.ticker.toLowerCase() === q ? 0 : h.ticker.toLowerCase().startsWith(q) ? 1 : matches(`${h.ticker} ${h.company} ${h.team}`) ? 2 : 9 }))
    .filter((x) => x.rank < 9)
    .sort((a, b) => a.rank - b.rank || a.h.ticker.localeCompare(b.h.ticker))
    .slice(0, 5)
    .map((x) => x.h);
  // The query starts with a ticker ("nvda", "nvda earnings"): that holding is what it names.
  const top = holdingHits[0] && holdingHits[0].ticker.toLowerCase().startsWith(words[0] ?? "") ? holdingHits[0] : null;
  if (top) named.add(`holding:${top.ticker}`);

  const ask: CommandItem[] = [];
  if (top) {
    ask.push(
      { kind: "ask", id: `ask:moved:${top.ticker}`, text: `What moved ${top.ticker} in the last session vs the S&P 500?`, ticker: top.ticker, teamSlug: top.teamSlug },
      { kind: "ask", id: `ask:10q:${top.ticker}`, text: `Summarize ${top.ticker}'s last 10-Q, with sources`, ticker: top.ticker, teamSlug: top.teamSlug },
    );
  } else if (q.length > 2) {
    ask.push({ kind: "ask", id: "ask:free", ...typedQuestionTarget({ teamSlug, pageTicker, pageTeamSlug }), text: query.trim() });
  }

  const go: CommandItem[] = [];
  if (top) {
    // In the scope in view: the fund shows every team's holdings, a team its own (⌘K lists only those).
    go.push(
      { kind: "page", id: `go:board:${top.ticker}`, page: { label: `${top.ticker} research`, href: boardHref(scopeSlug, top.teamSlug, top.ticker), hint: "Hoot's chats about this holding" } },
      { kind: "page", id: `go:earnings:${top.ticker}`, page: { label: `${top.ticker} earnings`, href: holdingHref(scopeSlug, top.teamSlug, top.ticker, "?tab=earnings"), hint: top.nextReport ? `${shortDate(top.nextReport)}${top.nextReportEstimated ? " est." : ""}` : "No report scheduled" } },
    );
  }
  const namedPages = pages.filter((p) => namesPage(q, p));
  const otherPages = pages.filter((p) => !namesPage(q, p) && matches(`${p.label} ${p.hoot ?? ""} ${p.keywords ?? ""} ${p.hint ?? ""}`));
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
