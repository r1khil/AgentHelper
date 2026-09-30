// Hoot's map of the app: every page, what it shows, who can open it, what its terms mean and how Hoot answers
// questions about it. Pure and client-safe. The page list is tied to the sidebar's destinations and to the page files
// by tests, so a page added to the app without an entry here fails CI instead of leaving Hoot unaware of it.
import { PREP_BUILD_TRADING_DAYS } from "@/lib/earnings-calendar";
import { PERIOD_KEYS, PERIOD_LABELS } from "@/lib/attribution/periods";
import { STRESS_WINDOWS } from "@/lib/risk/stress";
import { VAR_LEVEL } from "@/lib/risk/model";
import type { AppPage } from "./app-actions";

// Numbers and labels come from the code that computes them, so the map can't drift from the pages.
const PERIODS = PERIOD_KEYS.filter((k) => k !== "custom" && k !== "itd").map((k) => PERIOD_LABELS[k]).join(", ");
const STRESS = STRESS_WINDOWS.map((w) => w.label).join(", ");
const VAR_PCT = `${Math.round(VAR_LEVEL * 100)}%`;
const PREP_WHEN = `${PREP_BUILD_TRADING_DAYS} trading days before a report`;
/** The Risk view flags a holding whose share of risk is this multiple of its weight (ADDS_MORE in risk-sources.tsx). */
export const ADDS_MORE_MULTIPLE = 1.5;

/** all: every member; book: the team's lead analyst, execs and admins (position sizes and P&L); fund: execs and admins. */
export type PageAccess = "all" | "book" | "fund";

export type AppMapEntry = {
  key: string;
  name: string;
  /**
   * Path patterns; `:name` matches one segment. The most specific pattern that matches wins. Addresses from before
   * the five screens (Sep 29, 2026) redirect here, so they are listed too.
   */
  routes: string[];
  access: PageAccess;
  /** One line for Hoot's prompt. */
  summary: string;
  /** What the page shows, top to bottom, in the page's own words. */
  shows: string[];
  /** What a member can do there. */
  actions?: string[];
  /** How Hoot answers questions asked from this page. */
  hoot?: string;
  /** The `navigate` page that opens it. */
  navigate?: AppPage;
  /** What members called it before the five screens, so "where did Backtesting go?" finds it. */
  formerly?: string[];
};

export const APP_MAP: AppMapEntry[] = [
  {
    key: "sidebar",
    name: "Sidebar",
    routes: [],
    access: "all",
    summary: "on every page: New (Home, to ask Hoot), Portfolio, Markets, Threads (recent conversations), the account menu (What's new, Admin, preferences) and the bell (what needs the member); ⌘K searches, ⌘J asks Hoot about the page in view",
    shows: [
      "Search (⌘K): a ticker opens the holding, a page's name opens it, anything else asks Hoot; Hide sidebar (⌘\\); ⌘J asks Hoot about the page in view",
      "New: Home, to ask Hoot a new question; Portfolio (the whole fund for execs and admins, the member's team otherwise); Markets",
      "Threads: recent conversations with Hoot, general and about a holding, newest first; All threads lists every one",
      "Account menu (name and role): What's new and Admin for execs and admins, theme, Hoot in the corner, replay the tour, sign out",
      "The bell: what needs the member (expectations to set, model values and sell-side briefs to review, the weekly pack), each with a link",
    ],
    formerly: ["Menu", "Rail"],
  },
  {
    key: "home",
    name: "Home",
    routes: ["/", "/t/:team/agent"],
    access: "all",
    summary: "the ask box, with the market clock, one line on how the fund is doing against its benchmark today, and questions about today",
    shows: [
      "Market open or closed and when it next changes; prices delayed 15 min",
      "A greeting and one line on the fund today (or the member's team): return and bp ahead of or behind the benchmark",
      "Ask Hoot box: scope (Whole fund or a team), web and filings sources; a few questions about today under it",
    ],
    actions: ["ask Hoot a question, which opens a thread"],
    hoot: '"Today" means the live session; get_daily_performance has the numbers (execs and leads).',
    navigate: "home",
    formerly: ["Today"],
  },
  {
    key: "thread",
    name: "Thread",
    routes: ["/hoot/:chatId"],
    access: "all",
    summary: "one conversation with Hoot: the answer with numbered citations, its sources, the steps Hoot took, and follow-ups",
    shows: [
      "The question as the title, with the scope it was asked in; Trace (execs and admins: every step and tool call), Pin to a holding, Delete, Share",
      "Tabs: Answer (cited prose and live tables), Sources (every source cited, numbered), Steps (the tools Hoot used)",
      "Related questions and the follow-up box",
    ],
    actions: ["ask a follow-up", "pin to a holding", "share", "delete", "open the trace (execs and admins)"],
    formerly: ["Hoot conversation", "Research chat"],
  },
  {
    key: "threads",
    name: "All threads",
    routes: ["/hoot"],
    access: "all",
    summary: "every conversation with Hoot, general and about a holding, newest first",
    shows: ["Each thread's question, the holding it is about, when it was last asked"],
    actions: ["open a thread (a new question starts from New in the sidebar, which goes Home)"],
    navigate: "threads",
    formerly: ["Research", "Chats", "Conversations"],
  },
  {
    key: "portfolio",
    name: "Portfolio",
    routes: ["/t/:team"],
    access: "all",
    summary: "the book: value, day P&L, chart, headline stats and positions grouped by team, with views Performance, Risk, Exposure, Activity and What if; the scope filter narrows it to one team",
    shows: [
      "Header: Portfolio, the scope filter (Whole fund or a team; leads open on their own team), when prices are from, Weekly update (execs and admins), Record trade",
      "Value, today's P&L and %, bp ahead of or behind the benchmark today; chart 1D to All (dashed before the ledger opened: today's weights replayed)",
      "Stats: Since inception, Against the benchmark, Volatility, Tracking error, Cash (each opens its view)",
      "Views: Positions, Performance, Risk, Exposure, Activity (whole fund, execs and admins), What if",
      "Positions: team rows (holdings, Today, Market value, Weight, Total gain), then each Holding with Last, Today, Market value, Weight, Total gain; Cash. Sizes only for those who see the book",
      "Beside it: Ask about the portfolio, Moving the book today (bp to the fund), Last session (bp vs the benchmark, allocation and selection) and the evening brief",
    ],
    actions: ["switch the scope", "open a holding", "record a trade (execs and admins)", "open the Weekly update (execs and admins)"],
    hoot: "get_daily_performance (today), get_attribution (since inception), get_portfolio_risk (volatility, tracking error, tilts); get_team_context for a team's theses and notes.",
    navigate: "portfolio",
    formerly: ["Portfolio overview", "Team page", "Holdings"],
  },
  {
    key: "performance",
    name: "Performance",
    routes: ["/t/:team/performance", "/attribution", "/t/:team/attribution", "/daily", "/t/:team/daily"],
    access: "book",
    summary: "how the Fund or a team did over a period against its sector benchmark, and where the gap came from (sectors, teams, holdings); Today is live",
    shows: [
      `Period: Today (1D, live while the market is open), ${PERIODS}, since inception, custom; the gap to the sector benchmark in bp; Fund, Benchmark and S&P 500 returns`,
      "Sector weights (allocation) + Picks within sectors (selection) = Total gap",
      "By sector: weights and returns vs the benchmark, Weights and Picks effects in bp; By team: each team's share of the return",
      "Holdings by contribution: Helped most / Hurt most",
      "Today: live, provisional (closed, priced from closing quotes until the 5:00 pm price run) or final; P&L and each holding's Wt open, Wt now, Price, Today, Contribution",
    ],
    hoot: "get_attribution reproduces a period; get_daily_performance is today (say what time the prices are from).",
    navigate: "performance",
    formerly: ["Attribution", "Daily performance", "Performance today"],
  },
  {
    key: "risk",
    name: "Risk",
    routes: ["/t/:team/risk", "/risk"],
    access: "book",
    summary: "how risky today's portfolio is: volatility, tracking error, drawdowns, where the risk comes from and stress tests",
    shows: [
      "Volatility (annualized) over the lookback (6M/1Y/2Y), tracking error, S&P 500 volatility, beta; modeled drawdown",
      "Sharpe ratio, Max drawdown, Expected shortfall, Effective positions",
      `Where the risk comes from: each holding's weight vs share of risk (Adds more: share of risk ${ADDS_MORE_MULTIPLE}× its weight or more), by team and by sector`,
      `Stress tests: ${STRESS} (Fund vs benchmark, on today's value)`,
      "Where the active risk comes from; correlation heatmap; realized figures; a team is its own portfolio (scaled to 100%, no cash)",
    ],
    actions: ["export CSV", "Trim a holding: opens that trade in What if"],
    hoot: "get_portfolio_risk reproduces it; these are estimates from past returns, not forecasts.",
    navigate: "risk",
  },
  {
    key: "exposure",
    name: "Exposure",
    routes: ["/t/:team/exposure", "/exposure"],
    access: "book",
    summary: "distance from the benchmark: active share, sector tilts, concentration, ETF look-through, factors",
    shows: [
      "Active share vs the S&P 500 (or sector active share); largest tilt and most underweight sector",
      "Sector weights against the benchmark with the tilt in bp; Concentration (effective positions, top holdings, cash)",
      "Look through ETFs: each ETF replaced by the stocks it holds; largest positions and active bets after look-through",
      "Factor and macro sensitivities: Market, Size, Value, Momentum, Rates, Dollar, Oil",
    ],
    actions: ["toggle ETF look-through", "export CSV"],
    hoot: 'get_portfolio_risk with page "exposure" reproduces it; describe positioning, never recommend trades.',
    navigate: "exposure",
  },
  {
    key: "activity",
    name: "Activity",
    routes: ["/t/:team/activity", "/attribution/ledger"],
    access: "fund",
    summary: "the trade ledger, the source of truth for positions: trades, cash, dividends, held trade tickets and the PT sheet check",
    shows: [
      "To review: emailed trade tickets Hoot held back because the price is more than 5% from the market",
      "Check against the PT sheet: tickers where the sheet and the ledger differ, with the likely cause",
      "History: trades, cash and dividends by day, bought, sold, net deposits; NAV and cash at the close",
      "Entries are voided, never deleted; benchmark weights and securities' sectors are edited from here",
    ],
    actions: ["record a trade or cash flow", "upload a trade ticket", "import CSV", "void an entry", "review held tickets"],
    navigate: "activity",
    formerly: ["Ledger", "Trade ledger"],
  },
  {
    key: "what_if",
    name: "What if",
    routes: ["/t/:team/what-if", "/backtesting"],
    access: "all",
    summary: "a hypothetical replay of today's holdings over past prices with changed weights; not the Fund's realized return",
    shows: [
      "Today's weights vs the changed scenario vs a benchmark (SPY, QQQ or IWM) over chosen dates",
      "Weight changes (edit weights, trim or add a holding funded from cash or the rest pro rata, add a company)",
      "Saved scenarios (shared), What changes, Risk impact, contributors and by-day detail",
      "The whole fund for execs and admins; a team's holdings otherwise",
    ],
    actions: ["run a replay", "save or remove a scenario"],
    hoot: "run_backtest; always call it a hypothetical replay.",
    navigate: "what_if",
    formerly: ["Backtesting", "Backtest"],
  },
  {
    key: "holding",
    name: "Holding",
    routes: ["/t/:team/h/:ticker", "/t/:team/agent/h/:ticker"],
    access: "all",
    summary: "everything about one holding: price and chart, its own ask box, what's due, and tabs for its threads, model, filings and notes, and earnings",
    shows: [
      "Portfolio / TICKER; Upload model, Record trade (execs and admins); company, exchange and team; price and today's move; chart",
      "Ask about TICKER, with suggested questions; things due on it, most urgent first",
      "Tabs: All (everything, newest first), Threads (Hoot's conversations about it), Model (the Excel model and values to approve), Filings & notes (SEC filings, documents, sell-side calls, team notes), Earnings (past and next reports, expectations, prep pack)",
      "Right rail: the team's thesis (and any proposed update to review); Fund position for those who see the book (Market value, Weight, Today, Total gain, Team, Lead); Next report (Date, Time, EPS estimate, Expectations)",
    ],
    actions: ["ask Hoot about it", "upload a model", "edit the thesis or add a note", "record a trade (execs and admins)"],
    hoot: 'The page is about one company: treat "this company", "it" and "the stock" as that ticker.',
    navigate: "holding",
    formerly: ["Holding page", "Research board", "Holding research board"],
  },
  {
    key: "models",
    name: "Models",
    routes: ["/t/:team/models"],
    access: "all",
    summary: "every holding's Excel model in the scope, the values waiting for approval, and holdings with no model yet; each holding's is on its Model tab",
    shows: ["Models per holding (version, who uploaded, line items mapped) and holdings with no model yet"],
    actions: ["upload an .xlsx", "open a model"],
    navigate: "models",
  },
  {
    key: "sell_side",
    name: "Sell-side calls",
    routes: ["/t/:team/sell-side"],
    access: "all",
    summary: "recorded broker (sell-side) analyst calls in the scope, with Hoot's briefs; each holding's are on its Filings & notes tab",
    shows: ["Saved calls; record a call (team, company, ticker, title)"],
    actions: ["record a call", "open a call"],
    hoot: "find_call_transcripts and read_call_transcript read the saved calls.",
    navigate: "sell_side",
    formerly: ["Sell-side analyzer"],
  },
  {
    key: "model",
    name: "Model",
    routes: ["/t/:team/models/:modelId"],
    access: "all",
    summary: "one holding's Excel model and the values reported in new SEC filings waiting to be approved into it; on the holding's Model tab",
    shows: [
      "Version, who uploaded it, line items mapped",
      "Proposed values: line item and cell, period, model shows, reported, source (XBRL tag), decision; exceptions that need judgment",
      "Mappings: model line to XBRL concept, unit and scale, periods, rationale (carried forward to each new version)",
      "Values come straight from SEC filings (XBRL), not written by AI; formula cells are never written",
    ],
    actions: ["upload an .xlsx", "generate proposals", "approve or reject values", "write approved values into a new version", "map a line item"],
  },
  {
    key: "sell_side_call",
    name: "Sell-side call",
    routes: ["/t/:team/sell-side/:callId"],
    access: "all",
    summary: "one recorded broker (sell-side) analyst call: Hoot's transcript and cited call brief; listed on the holding's Filings & notes tab",
    shows: [
      "Call brief: what was said; important numbers checked against the team's files (Matches, Differs, Not in files); questions to ask next; positives, risks and watch points, themes, catalysts",
      "Transcript (searchable) and Discuss this call; the analysis is for execs and admins because it draws on the price target sheet",
    ],
    actions: ["record, pause, stop and analyze a call", "discuss it with Hoot"],
    hoot: "find_call_transcripts and read_call_transcript read the saved calls; never attribute a statement to a speaker.",
    formerly: ["Sell-side call brief"],
  },
  {
    key: "earnings_report",
    name: "Earnings report",
    routes: ["/t/:team/earnings/:id"],
    access: "all",
    summary: "one report: the team's expectations before it, sourced results after it, and the post-earnings reflection; from the holding's Earnings tab or Markets",
    shows: [
      "When it reports (confirmed or estimated), consensus EPS and revenue, when expectations lock",
      "Before the report: what you expect, key questions, what would change the thesis (locks automatically on the report date)",
      "After the report: sourced results (Actual, Prior year, Guidance, Estimate, Source)",
      "Post-earnings reflection, with Hoot's feedback; the prep pack (last quarter, guidance, filing and sell-side changes, questions, all cited)",
    ],
    actions: ["save and lock expectations", "gather results", "save the reflection", "ask for feedback", "mark reviewed", "build or rebuild the prep pack (lead, execs, admins)"],
    hoot: "Expectations and the reflection are the analyst's; gather evidence and give feedback, never write them.",
    formerly: ["Earnings prep"],
  },
  {
    key: "markets",
    name: "Markets",
    routes: ["/markets", "/t/:team/earnings", "/t/:team/economic-calendar"],
    access: "all",
    summary: "earnings and economic releases on one schedule: the Fund's holdings' reports (optionally sector bellwethers) and the week's releases, with prep packs",
    shows: [
      "Fund holdings (or one team's, from its Portfolio or ?team=), with Sector bellwethers to add; the next five weeks day by day",
      "Earnings: holding, company, time (before the open, after the close; est. = date not confirmed by the company), expectations status",
      "Economic releases: time, importance, previous, consensus, market-implied odds and the result once out",
      `Prep packs: which reports have one built and when the next builds (${PREP_WHEN})`,
    ],
    hoot: "get_upcoming_earnings and get_earnings_calendar for reports; get_economic_calendar for releases, get_macro_series for the data behind one, get_market_odds for what traders price in.",
    navigate: "markets",
    formerly: ["Calendar", "Earnings", "Earnings calendar", "Economic releases", "Economic calendar"],
  },
  {
    key: "weekly",
    name: "Weekly update",
    routes: ["/weekly", "/weekly/:week"],
    access: "fund",
    summary: "the Sunday update pack for Aadi: the week's performance, performers, highlights, agenda, email (a button on the Portfolio's header)",
    shows: [
      "Week ended, the Fund's week vs the S&P 500; the pack builds every Sunday at 12:00 New York",
      "Tabs: Summary (top and worst 3, highlights, why they moved, process updates, next week), Email, Highlights (AUM, YTD, SPXTR YTD, deck chart), Agenda, Checks",
    ],
    actions: ["build or rebuild the pack", "refresh from the PT sheet", "edit fields", "lock or reopen", "send the email"],
    navigate: "weekly",
  },
  {
    key: "changelog",
    name: "What's new",
    routes: ["/changelog"],
    access: "fund",
    summary: "every change merged into the app, newest first, with short summaries (in the account menu)",
    shows: ["Merged in the last 7 days; entries by day with headline, summary and author"],
    navigate: "changelog",
    formerly: ["Changelog"],
  },
  {
    key: "admin",
    name: "Admin",
    routes: ["/admin"],
    access: "fund",
    summary: "members, invitations, scheduled jobs and connections; admins change them, execs view (in the account menu)",
    shows: ["Members: role, team, sign-in, last active; invitations", "Jobs and connections: prices (5:00 PM ET), evening brief, morning sweep, bellwethers, prep packs, weekly pack; weekly email recipients; Drive; research agent model; external tools (MCP)"],
    navigate: "admin",
  },
  {
    key: "pt_sheet",
    name: "PT sheet read test",
    routes: ["/admin/pt-sheet"],
    access: "fund",
    summary: "exactly what Hoot sees from the execs' price target sheet, read-only",
    shows: ["Tabs of the sheet Hoot may read, as cell grids; when it was last edited"],
  },
];

/** Words on the app's pages a student may not know, as the pages themselves explain them. */
export const GLOSSARY: Record<string, string> = {
  "active return": "The portfolio's return minus the benchmark's.",
  "sector benchmark": "The S&P 500's sector weights applied to the 11 Select Sector SPDR ETFs; a team's benchmark is the ETFs of its own sectors.",
  allocation: "The part of the gap to the benchmark from sector bets: being over- or underweight a sector that did well or badly. Holding cash shows up here. Shown as Sector weights (or Weights).",
  selection: "The part of the gap from stock picking within each sector, measured at the benchmark's sector weight. Shown as Picks within sectors (or Picks); for a team it includes interaction.",
  interaction: "The combined effect of sizing a sector differently and picking differently within it. Usually small; the app adds it to Picks.",
  contribution: "Roughly a holding's weight times its return, compounded daily: how much of the portfolio's return it produced, in bp or %.",
  "to the fund": "A team's contribution to the Fund's return, in bp.",
  "vs s&p": "A holding's or team's move minus the S&P 500's, in bp.",
  provisional: "The market has closed but the numbers are priced from closing quotes until the 5:00 pm price run stores the official closes.",
  volatility: "How much the portfolio's value swings, as the annualized standard deviation of daily returns.",
  "tracking error": "The annualized standard deviation of the return difference against the benchmark: how far the portfolio's path can stray from it.",
  beta: "How much the portfolio tends to move when the S&P 500 moves 1% (against SPY).",
  var: `Value at risk: the 1-day loss that historically wasn't exceeded on ${VAR_PCT} of days.`,
  "expected shortfall": "The average loss on the days at or beyond the value-at-risk cutoff.",
  "effective positions": "How many equal-sized positions the portfolio behaves like (1 divided by the sum of squared weights).",
  "share of risk": `How much of the portfolio's volatility a holding accounts for; Adds more flags a holding whose share of risk is ${ADDS_MORE_MULTIPLE} times its weight or more.`,
  "stress test": `How today's holdings would have done over a past crisis window (${STRESS}), bought at the window's start and held, against the benchmark.`,
  "sharpe ratio": "Return above the T-bill yield per unit of volatility.",
  "max drawdown": "The largest fall from a previous high over the window.",
  "active share": "Half the sum of the absolute differences between the portfolio's and the benchmark's weights. Above about 60% is usually called active management.",
  "look-through": "Each ETF replaced by the stocks it holds, so exposure counts what the Fund really owns.",
  tilt: "A sector's weight in the portfolio minus its weight in the benchmark: over- or underweight, in bp.",
  "factor sensitivity": "How much the portfolio has moved with a factor (market, size, value, momentum, rates, dollar, oil) from a regression on past returns; not statistically clear when |t| < 2.",
  sleeve: "A team's slice of the Fund, treated as its own portfolio (scaled to 100%, no cash).",
  expectations: "Before an earnings report, what the analyst expects, key questions and what would change the thesis. Locks on the report date.",
  reflection: "After an earnings report, what happened against what the analyst expected.",
  "prep pack": `Hoot's cited earnings prep: last quarter's numbers, guidance, what changed in filings and the sell-side, and questions to watch. Builds ${PREP_WHEN}.`,
  bellwethers: "Large companies whose results tend to signal how a sector is doing.",
  "bmo / amc": "Before market open / after market close: when a company reports.",
  consensus: "The average forecast of sell-side analysts (or of economists, for a release).",
  "est.": "An earnings date the company hasn't confirmed yet.",
  xbrl: "The machine-readable tags in SEC filings; a holding's Model tab takes reported values from them.",
  "threads": "Conversations with Hoot. Every one is listed in the sidebar; a holding's are also on its Threads tab.",
  "pt sheet": "The execs' live price target sheet (Google Sheet). Hoot can read it for execs and admins only; a chat that reads it becomes fund-only.",
  "hypothetical replay": "What if (a backtest): today's holdings (or changed weights) run over past prices, rebalanced daily. Not the Fund's realized return.",
  pp: "Percentage points: the difference between two percentages. 1 pp = 100 bp.",
  bp: "Basis points: hundredths of a percentage point.",
  nav: "Net asset value: the Fund's total value (positions plus cash).",
  voided: "A ledger entry marked as a mistake. Entries are voided, never deleted.",
  spxtr: "The S&P 500 total return index (with dividends reinvested).",
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPILED = APP_MAP.flatMap((entry) =>
  entry.routes.map((route) => {
    const names: string[] = [];
    const re = new RegExp(`^${route.split("/").map((seg) => (seg.startsWith(":") ? (names.push(seg.slice(1)), "([^/]+)") : escape(seg))).join("/")}/?$`);
    // More literal segments first, so /t/:team/h/:ticker beats /t/:team.
    return { entry, re, names, weight: route.split("/").filter((s) => s && !s.startsWith(":")).length * 10 + route.split("/").length };
  }),
).sort((a, b) => b.weight - a.weight);

export type PageMatch = { entry: AppMapEntry; params: Record<string, string> };

/** The app-map page for a pathname, with its segments (team, ticker, id). */
export function pageForPath(pathname: string): PageMatch | null {
  const path = pathname.split(/[?#]/)[0];
  for (const c of COMPILED) {
    const m = c.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(c.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    if (params.ticker) params.ticker = params.ticker.toUpperCase();
    return { entry: c.entry, params };
  }
  return null;
}

const ACCESS_LABEL: Record<PageAccess, string> = { all: "every member", book: "the team's lead analyst, execs and admins", fund: "execs and admins" };

/** Whether a member can open a page: "own team" for a lead analyst on a book page (their team's, not others'). */
export function canOpenPage(access: PageAccess, role: string): boolean | "own team" {
  if (access === "all") return true;
  const fundWide = role === "exec" || role === "admin";
  if (access === "fund" || fundWide) return fundWide;
  return role === "lead_analyst" ? "own team" : false;
}

/** Lists across a scope, reached from a holding's tabs and ⌘K: one line between them in Hoot's prompt. */
const LISTS = new Set(["threads", "models", "sell_side"]);

/** One line per screen for Hoot's prompt, and where the old pages went; the detail is one explain_app call away. */
export function appMapPromptBlock(): string {
  return [
    ...APP_MAP.filter((e) => (e.navigate && !LISTS.has(e.key)) || e.key === "sidebar" || e.key === "thread").map(
      (e) => `- ${e.name}${e.access === "all" ? "" : e.access === "book" ? " (leads, execs, admins)" : " (execs, admins)"}: ${e.summary}`,
    ),
    "- All threads, Models, Sell-side calls: every conversation, and the lists behind each holding's tabs across the scope",
    "- Gone as pages: Research is Home and All threads; a holding's model, calls and earnings prep are tabs on its page; movement write-ups no longer exist; Earnings and Economic releases are Markets; Attribution and Daily are Performance; Backtesting is What if.",
  ].join("\n");
}

/** What Hoot should know about the page a question came from, when that page didn't describe itself. */
export function appPageContext(pathname: string): string {
  const match = pageForPath(pathname);
  if (!match) return "";
  const { entry, params } = match;
  const lines = [`- It is ${entry.name}: ${entry.summary}. It shows: ${entry.shows.join("; ")}.`];
  if (params.ticker) lines.push(`- The page is about ${params.ticker}: read "this company", "it" and "the stock" as ${params.ticker}.`);
  if (params.team && params.team !== "fund") lines.push(`- Team in view: ${params.team} (slug).`);
  if (entry.hoot) lines.push(`- ${entry.hoot}`);
  lines.push('- For "what does this page mean" questions, explain what it shows and its terms (explain_app has the detail), then offer to pull the numbers.');
  return lines.join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/&+ ]/g, " ").replace(/\s+/g, " ").trim();

/** The explain_app tool: a page by key, name or path, and/or a term; with neither, the page list. */
export function explainApp(q: { page?: string; term?: string; role: string }): {
  page?: AppMapEntry & { whoCanOpen: string; memberCanOpen: boolean | "own team" };
  terms?: { term: string; meaning: string }[];
  pages?: { key: string; name: string; summary: string; whoCanOpen: string; formerly?: string[] }[];
  error?: string;
} {
  const out: ReturnType<typeof explainApp> = {};
  if (q.page) {
    const p = q.page.trim();
    const byPath = p.startsWith("/") ? pageForPath(p)?.entry : undefined;
    const n = norm(p).replace(/ page$/, "");
    const named = (name: string) => norm(name) === n || norm(name).startsWith(n) || (n.length > 3 && norm(name).includes(n));
    // Today's names first, then what a page used to be called ("Backtesting" is now What if).
    const entry =
      byPath ??
      APP_MAP.find((e) => e.key === n.replace(/ /g, "_") || named(e.name)) ??
      APP_MAP.find((e) => e.formerly?.some((f) => norm(f) === n)) ??
      APP_MAP.find((e) => e.formerly?.some(named));
    if (entry) out.page = { ...entry, whoCanOpen: ACCESS_LABEL[entry.access], memberCanOpen: canOpenPage(entry.access, q.role) };
  }
  if (q.term) {
    const t = norm(q.term);
    const hits = Object.entries(GLOSSARY).filter(([k]) => norm(k) === t || norm(k).includes(t) || (t.length > 3 && t.includes(norm(k))));
    if (hits.length) out.terms = hits.slice(0, 4).map(([term, meaning]) => ({ term, meaning }));
  }
  if (!q.page && !q.term) out.pages = APP_MAP.map((e) => ({ key: e.key, name: e.name, summary: e.summary, whoCanOpen: ACCESS_LABEL[e.access], ...(e.formerly ? { formerly: e.formerly } : {}) }));
  if ((q.page && !out.page) || (q.term && !out.terms)) {
    const missing = [q.page && !out.page ? `page "${q.page}"` : null, q.term && !out.terms ? `term "${q.term}"` : null].filter(Boolean).join(" and ");
    if (!out.page && !out.terms) return { error: `No ${missing} in the app map. Pages: ${APP_MAP.map((e) => e.name).join(", ")}. Terms: ${Object.keys(GLOSSARY).join(", ")}.` };
  }
  return out;
}
