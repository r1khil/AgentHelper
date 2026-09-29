// Client-safe: no server imports and no date library, so the companion stays light.
import { BUBBLE_MAX_PRIORITY, type HootMood, type HootNudge } from "./types";

/** Hoot's resting face when nothing is happening: awake while the market trades, dozing otherwise. */
export function restingMood(marketOpen: boolean, nudges: HootNudge[]): HootMood {
  if (nudges.some((n) => n.priority === 1)) return "concerned";
  if (nudges.some((n) => n.kind === "earnings" && n.mood === "alert")) return "alert";
  return marketOpen ? "idle" : "sleepy";
}

// ---------------------------------------------------------------- speech bubbles

export const BUBBLES_PER_SESSION = 3;
/** Let the page settle before Hoot says anything. */
export const BUBBLE_DELAY_MS = 3000;
export const BUBBLE_VISIBLE_MS = 8000;

export type BubbleSession = { count: number; shown: string[] };

/**
 * The one thing worth interrupting for right now, or null. Helpful but never naggy: urgent items and
 * first-visit page tips only, a few per session, never the same one twice, never while the member is typing.
 */
export function pickBubble({
  nudges,
  tip,
  session,
  sinceLoadMs,
  typing,
}: {
  nudges: HootNudge[];
  tip: HootNudge | null;
  session: BubbleSession;
  sinceLoadMs: number;
  typing: boolean;
}): HootNudge | null {
  if (typing || sinceLoadMs < BUBBLE_DELAY_MS || session.count >= BUBBLES_PER_SESSION) return null;
  const fresh = (n: HootNudge) => !session.shown.includes(n.id);
  const urgent = nudges.filter((n) => n.priority <= BUBBLE_MAX_PRIORITY && fresh(n)).sort((a, b) => a.priority - b.priority);
  if (urgent[0]) return urgent[0];
  return tip && fresh(tip) ? tip : null;
}

/** Drop dismissals older than the content they refer to could plausibly come back (keeps the jsonb small). */
export function pruneDismissed(dismissed: Record<string, string>, now: Date, keepDays = 60) {
  const cutoff = now.getTime() - keepDays * 86_400_000;
  return Object.fromEntries(Object.entries(dismissed).filter(([, at]) => Date.parse(at) >= cutoff));
}

// ---------------------------------------------------------------- route awareness

/** Ticker in the URL, for holding pages (and the research boards they replaced, which redirect to them). */
export function tickerFromPath(pathname: string) {
  const m = pathname.match(/^\/t\/[^/]+(?:\/agent)?\/h\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toUpperCase() : null;
}

export function teamSlugFromPath(pathname: string) {
  return pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
}

/**
 * Hoot's corner button is on every page except those with their own ask box (one Hoot per screen): Home, a thread,
 * the Portfolio's Positions and a holding, and a movement write-up (which asks him for feedback in place).
 */
export function companionHiddenOn(pathname: string) {
  return pathname === "/" || /^\/hoot(\/|$)/.test(pathname) || /^\/t\/[^/]+\/?$/.test(pathname) || /^\/t\/[^/]+\/(agent|h|movements)(\/|$)/.test(pathname);
}

type Tip = { id: string; match: RegExp; title: string; detail: string };

// Keyed by the page's address. A tip keeps its id when its page only moved (Attribution is Performance now), so a member
// who read it once doesn't get it again.
const TIPS: Tip[] = [
  { id: "tip:today", match: /^\/$/, title: "Hi, I'm Hoot!", detail: "Ask me anything in the box. On any other page, press ⌘J to ask about what's on it." },
  { id: "tip:portfolio", match: /^\/t\/[^/]+$/, title: "Every holding has its own page", detail: "Open a row for its threads, write-ups, model, filings and earnings in one place." },
  { id: "tip:holding", match: /^\/t\/[^/]+\/h\/[^/]+$/, title: "Ask about this holding", detail: "Use the box under the price: the question goes to this ticker, and the thread lands on its Threads tab." },
  { id: "tip:movements", match: /^\/t\/[^/]+\/movements$/, title: "Write-ups", detail: "A holding lands here when it moves 400 bp or more against the S&P 500. Anyone on the team can write up why, by noon the next trading day." },
  { id: "tip:markets", match: /^\/markets$/, title: "Markets", detail: "Our holdings' reports and the economic releases on one schedule. Write down expectations before a report; the prep pack builds two weeks ahead." },
  { id: "tip:sell-side", match: /^\/t\/[^/]+\/sell-side$/, title: "Sell-side calls", detail: "Record a call, and you'll get a transcript, a brief and cross-checks against your team's files. I'll tell you when it's ready." },
  { id: "tip:models", match: /^\/t\/[^/]+\/models$/, title: "Models", detail: "Upload a model and map its cells. New filings are proposed as updates for you to approve, never written silently." },
  { id: "tip:attribution", match: /^\/t\/[^/]+\/performance$/, title: "Reading performance", detail: "Allocation is about which sectors we over- or under-weighted. Selection is about the stocks we picked within a sector." },
  { id: "tip:backtesting", match: /^\/t\/[^/]+\/what-if$/, title: "What if", detail: "Try weights on past prices. It's a sandbox and never changes the real portfolio." },
];

export function tipFor(pathname: string, seen: string[]): HootNudge | null {
  const tip = TIPS.find((t) => t.match.test(pathname));
  if (!tip || seen.includes(tip.id)) return null;
  return { id: tip.id, kind: "tip", priority: 9, title: tip.title, detail: tip.detail, href: pathname, mood: "wave" };
}

/** Three starting questions that fit the page, listed in ⌘K and ⌘J before anything is typed. They only fill the box; the member edits and sends. */
export function suggestionsFor(pathname: string, ticker: string | null): string[] {
  if (ticker) {
    return [
      `What changed for ${ticker} since its last earnings report?`,
      `Summarize ${ticker}'s latest 10-Q: revenue, margins and guidance, with sources.`,
      `What filings or news hit ${ticker} in the last week?`,
    ];
  }
  if (/^\/markets$/.test(pathname) || /\/earnings/.test(pathname)) {
    return [
      "Which of our holdings report in the next two weeks, and what did each guide to last quarter?",
      "Pull the key questions for our next earnings report, with the prior quarter's release.",
      "Which recent reports from our holdings surprised versus consensus?",
    ];
  }
  if (/^\/t\/fund\/?$/.test(pathname)) {
    return [
      "What moved the fund today, and which holdings drove it?",
      "Why are we ahead of or behind the benchmark since Sep 17?",
      "Which positions have grown the most since the ledger opened?",
    ];
  }
  if (/\/risk$/.test(pathname)) {
    return [
      "Which holdings add the most risk for their size?",
      "What would trimming our largest risk source do to tracking error?",
      "How would the book have done in the 2022 rate shock, and why?",
    ];
  }
  if (/\/exposure$/.test(pathname)) {
    return [
      "Where are we most overweight against the S&P 500, and since when?",
      "What do our ETFs hold underneath, and where does that overlap our stocks?",
      "Which sector tilt cost us the most this month?",
    ];
  }
  if (/\/activity$/.test(pathname)) {
    return [
      "Which trades changed the book the most since the ledger opened?",
      "Check the last week's trades against the closing prices.",
      "How much cash came in or went out this month, and why?",
    ];
  }
  if (/\/performance$/.test(pathname)) {
    return [
      "What drove this period's performance versus the S&P 500?",
      "Which holdings and sectors hurt most, and was it allocation or selection?",
      "Explain allocation, selection and interaction using these numbers.",
    ];
  }
  if (/\/what-if$/.test(pathname)) {
    return [
      "What did my scenario change, and which holdings drove the difference?",
      "What would today's weights have returned against SPY over the last year?",
      "What would doubling our largest position have done over the last six months?",
    ];
  }
  if (/\/movements/.test(pathname)) {
    return [
      "Which of our holdings moved most versus the S&P 500 this week, and what news is in the window?",
      "What filings or news could explain today's biggest move in our holdings?",
      "Summarize the open movement investigations and what evidence each is missing.",
    ];
  }
  return [
    "What moved our holdings today versus the S&P 500, and why?",
    "Which holdings report earnings soon, and what should we watch for?",
    "Any new SEC filings for our holdings this week?",
  ];
}
