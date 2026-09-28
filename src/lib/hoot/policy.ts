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

/** Ticker in the URL, for holding pages and holding research boards. */
export function tickerFromPath(pathname: string) {
  const m = pathname.match(/^\/t\/[^/]+(?:\/agent)?\/h\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toUpperCase() : null;
}

export function teamSlugFromPath(pathname: string) {
  return pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
}

/**
 * One Hoot per screen: the corner companion steps aside where the page shows Hoot in its content. That's Today
 * (the greeter), Research conversations (the thinking sprite) and the Calendar (sleeping Hoot on an empty day).
 */
export function companionHiddenOn(pathname: string) {
  return (
    pathname === "/" ||
    /^\/t\/[^/]+\/agent(\/|$)/.test(pathname) ||
    /^\/hoot(\/|$)/.test(pathname) ||
    /^\/t\/[^/]+\/(earnings|economic-calendar)(\/?$)/.test(pathname)
  );
}

type Tip = { id: string; match: RegExp; title: string; detail: string };

const TIPS: Tip[] = [
  { id: "tip:today", match: /^\/$/, title: "Hi, I'm Hoot!", detail: "I'll flag deadlines and earnings as they come up. Press ⌘K any time to ask me a research question." },
  { id: "tip:holdings", match: /^\/t\/[^/]+$/, title: "Every holding has a research board", detail: "Open a ticker to see its thesis, notes and a board where the agent cites every fact." },
  { id: "tip:holding", match: /^\/t\/[^/]+\/h\/[^/]+$/, title: "Ask about this holding", detail: "Press ⌘K and ask: on this page, the question goes to this ticker's research board." },
  { id: "tip:movements", match: /^\/t\/[^/]+\/movements$/, title: "Movements", detail: "A holding lands here when it moves 4pp or more against the S&P 500. The owner writes up why by noon the next trading day." },
  { id: "tip:earnings", match: /^\/t\/[^/]+\/earnings$/, title: "Earnings calendar", detail: "Write down expectations before the report. The prep pack gathers evidence, and the reflection afterwards checks your thesis." },
  { id: "tip:sell-side", match: /^\/t\/[^/]+\/sell-side$/, title: "Sell-side analyzer", detail: "Record a call, and you'll get a transcript, a brief and cross-checks against your team's files. I'll tell you when it's ready." },
  { id: "tip:models", match: /^\/t\/[^/]+\/models$/, title: "Models", detail: "Upload a model and map its cells. New filings are proposed as updates for you to approve, never written silently." },
  { id: "tip:attribution", match: /^(\/t\/[^/]+)?\/attribution$/, title: "Reading attribution", detail: "Allocation is about which sectors we over- or under-weighted. Selection is about the stocks we picked within a sector." },
  { id: "tip:backtesting", match: /^\/backtesting$/, title: "Backtesting", detail: "Try weights on past prices. It's a sandbox and never changes the real portfolio." },
];

export function tipFor(pathname: string, seen: string[]): HootNudge | null {
  const tip = TIPS.find((t) => t.match.test(pathname));
  if (!tip || seen.includes(tip.id)) return null;
  return { id: tip.id, kind: "tip", priority: 9, title: tip.title, detail: tip.detail, href: pathname, mood: "wave" };
}

/** Three starting questions that fit the page, listed in ⌘K before anything is typed. They only fill the box; the member edits and sends. */
export function suggestionsFor(pathname: string, ticker: string | null): string[] {
  if (ticker) {
    return [
      `What changed for ${ticker} since its last earnings report?`,
      `Summarize ${ticker}'s latest 10-Q: revenue, margins and guidance, with sources.`,
      `What filings or news hit ${ticker} in the last week?`,
    ];
  }
  if (/\/earnings/.test(pathname)) {
    return [
      "Which of our holdings report in the next two weeks, and what did each guide to last quarter?",
      "Pull the key questions for our next earnings report, with the prior quarter's release.",
      "Which recent reports from our holdings surprised versus consensus?",
    ];
  }
  if (/\/attribution$/.test(pathname)) {
    return [
      "What drove this period's performance versus the S&P 500?",
      "Which holdings and sectors hurt most, and was it allocation or selection?",
      "Explain allocation, selection and interaction using these numbers.",
    ];
  }
  if (/^\/backtesting$/.test(pathname)) {
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
