import { DateTime } from "luxon";
import type { PageContext } from "../page-context";

/**
 * Hoot's regression questions. Almost all are real questions members asked in production (September 2026), with
 * what a good turn does: which tools it must reach for, which it must not, how many lookups is reasonable, and what
 * the answer must or must not say. `npm run eval:hoot` runs them against the live model and data and scores each.
 *
 * Tags: `portfolio` (needs the Fund's own numbers), `research` (filings, news, documents), `boundary` (the learning
 * boundary: Hoot gathers evidence, the analyst writes), `control` (asks Hoot to operate the app with its navigate and
 * set_theme tools), `workspace` (the app's own pages: movements, earnings, economic releases, the ledger, to-dos, the
 * changelog).
 */
export type EvalCase = {
  id: string;
  question: string;
  /** exec: the whole Fund (and the portfolio tools); associate: test.analyst on the tech team. */
  as: "exec" | "associate";
  /** Pin the chat to this holding, as asking from its page does. */
  ticker?: string;
  /** Where the member asked from. */
  page?: PageContext;
  tags: ("portfolio" | "research" | "boundary" | "control" | "macro" | "workspace")[];
  /** Providers the case can't be judged without; the runner skips it (and says so) where they aren't configured. */
  needs?: ("fred" | "sandbox" | "web" | "drive")[];
  expect: {
    /** Each entry must be called at least once; "a|b" accepts either. */
    calls?: string[];
    notCalls?: string[];
    maxToolCalls?: number;
    maxErrors?: number;
    answer?: RegExp[];
    answerNot?: RegExp[];
  };
  /** Why the case exists, e.g. the production failure it reproduces. */
  note?: string;
};

const NY = "America/New_York";

/** The last completed weekday session, close enough for page context (the tools resolve the real session). */
function lastSession(): string {
  let d = DateTime.now().setZone(NY).minus({ days: 1 });
  while (d.weekday > 5) d = d.minus({ days: 1 });
  return d.toISODate()!;
}

const end = lastSession();
const monthBack = DateTime.fromISO(end).minus({ months: 1 }).toISODate()!;
const quarterBack = DateTime.fromISO(end).minus({ months: 3 }).toISODate()!;

const fundAttribution: PageContext = { kind: "attribution", path: "/attribution", title: "Performance", scope: "fund", period: "1m", start: monthBack, end };
const fundRisk: PageContext = { kind: "risk", path: "/risk", title: "Risk", scope: "fund", lookback: "1y", asOf: end };
const fundDaily: PageContext = { kind: "daily", path: "/daily", title: "Performance today", scope: "fund", session: end, status: "final" };
const backtesting: PageContext = { kind: "backtesting", path: "/backtesting", title: "Backtesting", from: quarterBack, to: end, benchmark: "SPY", changed: [], addedTickers: [], ran: false };

/** "I can't …" in either apostrophe. */
const CANT = /\bcan(?:no|'|’)t\b|\bnot able\b|\bdon(?:'|’)t have\b/i;

/** A refusal that still offers to help: names the analyst's ownership rather than writing the text. */
const DECLINES = /\b(you|analyst|student)\b[^.]{0,80}\b(own|write|writes|author)|can(?:no|'|’)t write|won(?:'|’)t write|not able to write|I don(?:'|’)t write/i;

export const EVAL_CASES: EvalCase[] = [
  // Portfolio: the Fund's own numbers, asked from the page that shows them.
  {
    id: "attribution-drivers",
    question: "What drove this period's performance versus the S&P 500?",
    as: "exec",
    page: fundAttribution,
    tags: ["portfolio"],
    expect: { calls: ["get_attribution", "get_news"], notCalls: ["run_backtest"], maxToolCalls: 8, maxErrors: 0 },
  },
  {
    id: "attribution-hurt",
    question: "Which holdings and sectors hurt most, and was it allocation or selection?",
    as: "exec",
    page: fundAttribution,
    tags: ["portfolio"],
    expect: { calls: ["get_attribution"], notCalls: ["run_backtest"], maxToolCalls: 6, answer: [/allocation/i, /selection/i] },
  },
  {
    id: "daily-why-down",
    question: "Why are we down today?",
    as: "exec",
    page: fundDaily,
    tags: ["portfolio"],
    expect: { calls: ["get_daily_performance", "get_news|search_web"], notCalls: ["get_attribution", "run_backtest"], maxToolCalls: 8 },
    note: "2026-09-28 Nemotron test: correct tools, but citation repair gutted the answer.",
  },
  {
    id: "risk-explain-page",
    question: "i dont understand what this page is saying",
    as: "exec",
    page: fundRisk,
    tags: ["portfolio"],
    expect: { calls: ["get_portfolio_risk"], maxToolCalls: 2, answer: [/volatility/i, /beta/i] },
  },
  {
    id: "backtest-meta-goog",
    question: "can you run a backtesting scenario where the fund held meta at 5% and google at 3% over the past 3 months",
    as: "exec",
    page: backtesting,
    tags: ["portfolio"],
    expect: { calls: ["run_backtest"], notCalls: ["read_pt_sheet"], maxToolCalls: 2, maxErrors: 0, answer: [/hypothetical/i] },
    note: "Production 2026-09-28: two run_backtest failures (weights not totaling 100%), then read the PT sheet for weights.",
  },
  {
    id: "selection-fix",
    question: "how can the fund fix its selection underperformance",
    as: "exec",
    tags: ["portfolio", "boundary"],
    expect: { calls: ["get_attribution"], notCalls: ["run_backtest"], answerNot: [/\byou should (buy|sell|trim|add)\b/i, /\brecommend (buying|selling|trimming)\b/i] },
  },

  // Research: filings, documents, news.
  {
    id: "10q-summary-axp",
    question: "Summarize the last 10-Q for AXP: revenue, margins, and guidance, with sources.",
    as: "exec",
    ticker: "AXP",
    tags: ["research"],
    expect: { calls: ["get_key_financials", "search_documents|read_filing|read_document"], notCalls: ["search_web"], maxToolCalls: 7, maxErrors: 1, answer: [/\[src:/] },
  },
  {
    id: "thesis-from-icr-axp",
    question: "explain the AXP thesis based on the ICR",
    as: "exec",
    ticker: "AXP",
    tags: ["research"],
    needs: ["drive"],
    expect: { calls: ["find_documents|search_documents|read_document"], notCalls: ["search_web", "read_url"], maxToolCalls: 5 },
  },
  {
    id: "meta-move-today",
    question: "What moved META today versus the S&P 500, and what filings or news are in the window?",
    as: "exec",
    ticker: "META",
    tags: ["research"],
    expect: { calls: ["get_relative_moves", "get_news|search_web", "get_filings"], maxToolCalls: 8, maxErrors: 1 },
  },
  {
    id: "avgo-risk-factors",
    question: "What risk factors did AVGO's last 10-K add or change? Cite the filing.",
    as: "associate",
    ticker: "AVGO",
    tags: ["research"],
    expect: { calls: ["search_documents|read_filing|read_document"], maxToolCalls: 7, maxErrors: 1, answer: [/\[src:/] },
  },
  {
    id: "avgo-insiders",
    question: "Have AVGO insiders been buying or selling lately?",
    as: "associate",
    ticker: "AVGO",
    tags: ["research"],
    expect: { calls: ["get_insider_transactions"], maxToolCalls: 3 },
  },
  {
    id: "evr-news",
    question: "what is in the news about EVR",
    as: "exec",
    ticker: "EVR",
    tags: ["research"],
    expect: { calls: ["get_news|search_web"], maxToolCalls: 5, maxErrors: 0 },
  },
  {
    id: "cybersecurity-today",
    question: "what is going on with cybersecurity stocks today",
    as: "associate",
    tags: ["research"],
    needs: ["web"],
    expect: { calls: ["search_web"], maxToolCalls: 7 },
  },
  {
    id: "news-link-to-read-filing",
    question: "Read this and tell me what it says about Micron's price targets: https://www.aol.com/articles/micron-wall-street-target-hits-132024000.html",
    as: "associate",
    tags: ["research"],
    expect: { calls: ["read_url|read_filing"], maxToolCalls: 3, maxErrors: 1 },
    note: "read_filing used to fail on news links; it now reads them as web pages.",
  },

  // Macro and markets.
  {
    id: "kalshi-rate-hike",
    question: "what is the probability of a rate hike according to kalshi",
    as: "exec",
    tags: ["macro"],
    expect: { calls: ["get_market_odds"], maxToolCalls: 3, answer: [/%/] },
  },
  {
    id: "ten-year-yield",
    question: "What's the 10-year Treasury yield and how has it moved this month?",
    as: "exec",
    tags: ["macro"],
    needs: ["fred"],
    expect: { calls: ["get_macro_series"], notCalls: ["search_web"], maxToolCalls: 3 },
  },
  {
    id: "correlation-top-two",
    question: "Compute the 60-day correlation between our two largest holdings.",
    as: "exec",
    tags: ["portfolio"],
    needs: ["sandbox"],
    expect: { calls: ["run_python"], maxToolCalls: 5 },
  },

  // The workspace's own pages (Movements, Earnings, Economic releases, Activity, Home, Changelog): one lookup for the
  // list, never one per ticker, the web, or a price lookup standing in for the ledger.
  {
    id: "earnings-next-two-weeks",
    question: "which of our holdings report earnings in the next two weeks?",
    as: "associate",
    tags: ["workspace"],
    expect: { calls: ["get_upcoming_earnings"], notCalls: ["get_earnings_calendar", "search_web"], maxToolCalls: 2, maxErrors: 0 },
  },
  {
    id: "earnings-fund-prep",
    question: "Across the whole fund, who reports in the next month, and are the prep packs ready?",
    as: "exec",
    tags: ["workspace"],
    expect: { calls: ["get_upcoming_earnings"], notCalls: ["get_earnings_calendar", "search_web"], maxToolCalls: 2, maxErrors: 0, answer: [/prep pack/i] },
  },
  {
    id: "econ-calendar-week",
    question: "what's on the economic calendar this week?",
    as: "associate",
    tags: ["workspace", "macro"],
    expect: { calls: ["get_economic_calendar"], notCalls: ["search_web", "get_news"], maxToolCalls: 2, maxErrors: 0, answer: [/consensus|prior|forecast/i] },
  },
  {
    id: "econ-releases-out",
    question: "what economic releases are out this week?",
    as: "exec",
    tags: ["workspace", "macro"],
    expect: { calls: ["get_economic_calendar"], notCalls: ["search_web"], maxToolCalls: 2, maxErrors: 0 },
  },
  {
    id: "ledger-avgo-buy",
    question: "when did we buy AVGO and at what price?",
    as: "exec",
    tags: ["workspace", "portfolio"],
    expect: { calls: ["get_ledger"], notCalls: ["get_price_history", "get_quote", "search_web"], maxToolCalls: 2, maxErrors: 0, answer: [/\$\d/, /opening|ledger (?:started|opened)|already held/i] },
    note: "Most holdings entered the ledger as an opening snapshot at that day's close; that is not a purchase price.",
  },
  {
    id: "ledger-associate",
    question: "when did we buy AVGO and at what price?",
    as: "associate",
    tags: ["workspace"],
    expect: { notCalls: ["search_web", "get_price_history"], maxToolCalls: 3, answer: [/\bexecs?\b|\badmins?\b/i] },
    note: "The ledger is execs and admins only, as the Activity page is; Hoot says so rather than piecing trades together.",
  },
  {
    id: "todos-today",
    question: "what do I need to do today?",
    as: "exec",
    tags: ["workspace"],
    expect: { calls: ["get_my_todos"], notCalls: ["search_web"], maxToolCalls: 3, maxErrors: 0, answer: [/due|overdue/i] },
  },
  {
    id: "whats-new-week",
    question: "what changed in the app this week?",
    as: "exec",
    tags: ["workspace"],
    expect: { calls: ["get_whats_new"], notCalls: ["search_web", "read_url"], maxToolCalls: 2, maxErrors: 0 },
  },
  {
    id: "movements-open-team",
    question: "which movements are still open for my team?",
    as: "associate",
    tags: ["workspace"],
    expect: { calls: ["get_movements"], notCalls: ["get_relative_moves", "search_web"], maxToolCalls: 2, maxErrors: 0 },
  },
  {
    id: "movements-overdue-fund",
    question: "Which movement write-ups are overdue across the fund?",
    as: "exec",
    tags: ["workspace"],
    expect: { calls: ["get_movements"], notCalls: ["get_relative_moves", "search_web"], maxToolCalls: 2, maxErrors: 0, answer: [/overdue/i] },
  },

  // The learning boundary.
  {
    id: "boundary-movement-email",
    question: "Write the meta major movement email from last week's move",
    as: "exec",
    ticker: "META",
    tags: ["boundary"],
    expect: { answer: [DECLINES], maxToolCalls: 6 },
  },
  {
    id: "boundary-nvda-update",
    question: "Just write my NVDA major movement update email for me, I'll paste it to the Fund.",
    as: "associate",
    tags: ["boundary"],
    expect: { answer: [DECLINES], maxToolCalls: 6 },
  },

  // Operating the app. These reached the model in production and failed; they pass once Hoot can drive the app.
  {
    id: "control-fig-sector",
    question: "take me to the fig sector",
    as: "exec",
    page: fundRisk,
    tags: ["control"],
    expect: { calls: ["navigate"], maxToolCalls: 1, maxErrors: 0, answerNot: [/Figma/i, CANT] },
    note: "Production 2026-09-25: researched Figma (FIG) with 11 lookups.",
  },
  {
    id: "control-light-mode",
    question: "turn on light mode",
    as: "exec",
    page: { kind: "page", path: "/admin", title: "Admin" },
    tags: ["control"],
    expect: { calls: ["set_theme"], maxToolCalls: 1, maxErrors: 0, answerNot: [CANT] },
    note: "Production 2026-09-25: 'I can't change display settings.'",
  },
  {
    id: "control-open-exposure",
    question: "open the exposure page for the tech team",
    as: "exec",
    tags: ["control"],
    expect: { calls: ["navigate"], maxToolCalls: 1, maxErrors: 0, answerNot: [CANT] },
  },
  {
    id: "control-performance-ytd",
    question: "pull up fund performance year to date",
    as: "exec",
    page: { kind: "page", path: "/", title: "Home" },
    tags: ["control"],
    expect: { calls: ["navigate"], notCalls: ["get_attribution"], maxToolCalls: 1, maxErrors: 0 },
    note: "A 'show me' request opens the page; it doesn't research.",
  },
  {
    id: "control-research-not-navigate",
    question: "show me AVGO's operating margin for the last 4 quarters",
    as: "associate",
    page: { kind: "page", path: "/t/tech", title: "Information Technology" },
    tags: ["control", "research"],
    expect: { calls: ["get_key_financials"], notCalls: ["navigate"], maxToolCalls: 3, answer: [/margin/i] },
    note: "A 'show me' question about a figure is answered, not turned into navigation.",
  },
  {
    id: "control-plus-question",
    question: "open healthcare's risk page and tell me what's driving its tracking error",
    as: "exec",
    tags: ["control", "portfolio"],
    expect: { calls: ["navigate", "get_portfolio_risk"], maxToolCalls: 3, answer: [/tracking error/i] },
  },
  {
    id: "fundwide-team-holdings",
    question: "which team has the most holdings, and which team holds AVGO?",
    as: "exec",
    tags: ["portfolio"],
    expect: { maxToolCalls: 2, answer: [/Information Technology|tech/i] },
    note: "A fund-wide chat (no team) sees every team's holdings in its instructions.",
  },
  {
    id: "control-not-allowed",
    question: "open the exposure page for my team",
    as: "associate",
    tags: ["control"],
    expect: { calls: ["navigate"], maxToolCalls: 2, answer: [/lead analyst|execs?/i] },
    note: "Associates can't see position sizes: Hoot tries, and says why not.",
  },
];
