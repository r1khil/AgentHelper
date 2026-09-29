// Hoot's map of the app: every page, what it shows, who can open it, what its terms mean and how Hoot answers
// questions about it. Pure and client-safe. The page list is tied to the sidebar's destinations by a test, so a page
// added to the app without an entry here fails CI instead of leaving Hoot unaware of it.
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { PERIOD_KEYS, PERIOD_LABELS } from "@/lib/attribution/periods";
import { STRESS_WINDOWS } from "@/lib/risk/stress";
import { VAR_LEVEL } from "@/lib/risk/model";
import type { AppPage } from "./app-actions";

// Numbers and labels come from the code that computes them, so the map can't drift from the pages.
const RULE_BP = `${Math.round(MOVEMENT_THRESHOLD_PP * 100)} bp`;
const PERIODS = PERIOD_KEYS.filter((k) => k !== "custom" && k !== "itd").map((k) => PERIOD_LABELS[k]).join(", ");
const STRESS = STRESS_WINDOWS.map((w) => w.label).join(", ");
const VAR_PCT = `${Math.round(VAR_LEVEL * 100)}%`;
/** The Risk page flags a holding whose share of risk is this multiple of its weight (ADDS_MORE in risk-sources.tsx). */
export const ADDS_MORE_MULTIPLE = 1.5;

/** all: every member; book: the team's lead analyst, execs and admins (position sizes and P&L); fund: execs and admins. */
export type PageAccess = "all" | "book" | "fund";

export type AppMapEntry = {
  key: string;
  name: string;
  /** Path patterns; `:name` matches one segment. The most specific pattern that matches wins. */
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
};

export const APP_MAP: AppMapEntry[] = [
  {
    key: "home",
    name: "Home",
    routes: ["/"],
    access: "all",
    summary: "Ask Hoot, what needs the member, today's movers, this week, last session and the teams",
    shows: [
      "Ask Hoot box and a few recent chats (\"Pick up where you left off\")",
      "Needs you: nudges tagged Overdue, Failed, Ready, Due, Soon, Review, Weekly, New, Note",
      "Moving the book today (with bp to the Fund) or Moving your holdings today (associates, no sizes)",
      "This week: earnings in the next 7 days (est. = date not confirmed) and, for execs, the Sunday weekly pack",
      "With a book: Last session (bp vs the benchmark; Fund, S&P 500, vs sectors), Helped most / Hurt most, Hoot's evening brief (fund)",
      "Teams table: Return, To the Fund (contribution in bp), Biggest mover; rows expand to holdings",
    ],
    actions: ["ask Hoot", "dismiss a nudge", "open any item"],
    hoot: "\"Today\" means the live session; the book line is the Daily performance numbers (get_daily_performance for execs and leads).",
    navigate: "home",
  },
  {
    key: "portfolio",
    name: "Portfolio overview",
    routes: ["/t/fund"],
    access: "fund",
    summary: "the Fund's value, day P&L, chart, six headline stats, what needs attention, this week and all positions",
    shows: [
      "Owl Fund value, day P&L and %, bp ahead of or behind the benchmark today",
      "Chart 1D/1W/1M/3M/1Y/All; stat cells Since inception, Against the benchmark, Volatility, Tracking error, Largest tilt, Cash (each opens its tab)",
      "Needs you (held tickets, data issues, nudges); This week (earnings and economic releases)",
      "Positions: Name, Intraday, Last, Today, Market value, Weight, Total gain (since the ledger opened, realized and unrealized)",
    ],
    actions: ["record a trade (execs and admins)"],
    hoot: "Numbers here come from get_daily_performance (today), get_attribution (since inception) and get_portfolio_risk (volatility, tracking error, tilts).",
    navigate: "portfolio",
  },
  {
    key: "team",
    name: "Team page",
    routes: ["/t/:team"],
    access: "all",
    summary: "a team's holdings with today's moves vs the S&P, next reports and what needs attention",
    shows: [
      "Team, N holdings, % of the Fund; value and day P&L for the lead, execs and admins, day % for others",
      "Stats: Members, Open write-ups (overdue/open, due dates), Next report",
      "Holdings (All / Needs attention / Reporting in 2 weeks): 5-day sparkline, Price, Today, vs S&P (bp), Weight (book only), Next report, Needs attention",
      "Attention flags: Write-up overdue/due, Expectations due, model updates, Thesis proposed",
    ],
    actions: ["add a holding"],
    hoot: "get_team_context for theses, notes and open investigations; get_peer_moves for today's moves.",
    navigate: "team",
  },
  {
    key: "holding",
    name: "Holding page",
    routes: ["/t/:team/h/:ticker"],
    access: "all",
    summary: "one holding: price, position (book only), key stats, thesis, notes, documents, filings, earnings",
    shows: [
      "Tabs: Overview, Research, Documents & filings, Earnings, Notes",
      "Price and today's move, bp against the S&P 500; chart vs the S&P",
      "Fund position for the book (Shares, Market value, Weight in fund, Average cost, Today's and Total gain, Total return, Contribution today); Coverage otherwise",
      "Key statistics: Market cap, P/E next 12 months, 52-week range, Avg volume, Dividend yield, Beta, Next earnings",
      "Thesis (with any proposal from the initiating report awaiting review), Team notes, Research list, Latest filings, news and Drive",
      "Documents: team documents, models, SEC filings indexed for Hoot, recent filings, news; Earnings: past and next reports with expectations",
    ],
    actions: ["edit the thesis", "add or delete a note", "accept or dismiss a thesis proposal", "upload to Drive", "ask Hoot about it", "mark exited (book)", "record a trade (execs)"],
    hoot: "The page is about one company: treat \"this company\", \"it\" and \"the stock\" as that ticker.",
    navigate: "holding",
  },
  {
    key: "movements",
    name: "Movements",
    routes: ["/t/:team/movements", "/t/:team/movements/:id"],
    access: "all",
    summary: `major-movement investigations: a holding moved ${RULE_BP} or more against the S&P 500; the team writes up why`,
    shows: [
      "List of movements: ticker, bp, status (Overdue, In progress, Open, Completed, Data problem), session date",
      `Opened when a holding's daily return differs from the S&P 500's by ${RULE_BP} or more on official closes; due noon the next trading day; checked nightly after the close`,
      "The movement: bp vs the S&P 500, the stock's and the S&P's move, team, leads, due, status",
      "Team update: the write-up anyone on the team can draft; Hoot's feedback on the draft (Unsupported, Missing, Alternative, Thesis, Question)",
      "Evidence Hoot gathered (possible catalysts, not the explanation): prices, news, SEC filings, peer moves the same session, calendar, company releases",
    ],
    actions: ["save a draft", "mark complete / reopen", "ask Hoot for feedback on the draft", "re-gather evidence", "cite evidence in the draft"],
    hoot: "Explain the evidence and the rule; never write the team update. Feedback on a draft is allowed.",
    navigate: "movements",
  },
  {
    key: "models",
    name: "Models",
    routes: ["/t/:team/models", "/t/:team/models/:modelId"],
    access: "all",
    summary: "the team's Excel models and the values reported in new SEC filings waiting to be approved into them",
    shows: [
      "Models per holding (version, who uploaded, line items mapped) and holdings with no model yet",
      "Proposed values: line item and cell, period, model shows, reported, source (XBRL tag), decision; exceptions that need judgment",
      "Mappings: model line to XBRL concept, unit and scale, periods, rationale (carried forward to each new version)",
      "Values come straight from SEC filings (XBRL), not written by AI; formula cells are never written",
    ],
    actions: ["upload an .xlsx", "generate proposals", "approve or reject values", "write approved values into a new version", "map a line item"],
    navigate: "models",
  },
  {
    key: "research",
    name: "Research",
    routes: ["/t/:team/agent"],
    access: "all",
    summary: "Hoot's home: ask across the Fund or a team, recent chats, and every holding's research board",
    shows: ["Ask box with scope and holding pin", "Recent chats", "Holding boards, needs attention first: Day vs S&P, Next report, Expectations, Research, Status"],
    actions: ["start a chat", "open a holding's board"],
    navigate: "research",
  },
  {
    key: "board",
    name: "Holding research board",
    routes: ["/t/:team/agent/h/:ticker"],
    access: "all",
    summary: "every Hoot chat about one holding, its sources and research log, what Hoot remembers, and the earnings prep pack",
    shows: ["Chats about the holding and the open thread", "Sources and research log; What Hoot remembers", "Earnings prep (the prep pack builds two weeks before a report)", "A banner when a movement is open or overdue"],
    actions: ["new chat", "clear a chat", "delete a remembered fact (lead, execs, admins)"],
    hoot: "The board is about one company: treat \"this company\" as that ticker.",
  },
  {
    key: "hoot_chat",
    name: "Hoot conversation",
    routes: ["/hoot/:chatId"],
    access: "all",
    summary: "one general conversation with Hoot",
    shows: ["The conversation with sources and suggested next questions", "Pin to research board files it under a holding"],
    actions: ["ask a follow-up", "pin to a holding's board", "delete", "share"],
  },
  {
    key: "sell_side",
    name: "Sell-side calls",
    routes: ["/t/:team/sell-side", "/t/:team/sell-side/:callId"],
    access: "all",
    summary: "record broker (sell-side) analyst calls; Hoot transcribes them and writes a cited call brief",
    shows: [
      "Saved calls; record a call (team, company, ticker, title)",
      "Call brief: what was said; important numbers checked against the team's files (Matches, Differs, Not in files); questions to ask next; positives, risks and watch points, themes, catalysts",
      "Transcript (searchable) and Discuss this call; the analysis is for execs and admins because it draws on the price target sheet",
    ],
    actions: ["record, pause, stop and analyze a call", "discuss it with Hoot"],
    hoot: "find_call_transcripts and read_call_transcript read the saved calls; never attribute a statement to a speaker.",
    navigate: "sell_side",
  },
  {
    key: "earnings",
    name: "Earnings calendar",
    routes: ["/t/:team/earnings"],
    access: "all",
    summary: "holdings' upcoming and recent earnings reports, with sector bellwethers and economic releases",
    shows: [
      "Scope Fund / Sector / Industry, layout Week / Month / List; show Fund holdings, Sector bellwethers, Economic releases",
      "Upcoming: Date, Holding, Team, Time (bmo before the open, amc after the close), EPS est., Expectations, Prep pack; (est.) = not confirmed by the company",
      "Reported: Date, Holding, Team, Time, EPS est., Expectations, Reflection",
    ],
    hoot: "get_earnings_calendar gives one ticker's next date and consensus.",
    navigate: "earnings",
  },
  {
    key: "earnings_report",
    name: "Earnings report",
    routes: ["/t/:team/earnings/:id"],
    access: "all",
    summary: "one report: the team's expectations before it, sourced results after it, and the post-earnings reflection",
    shows: [
      "When it reports (confirmed or estimated), consensus EPS and revenue, when expectations lock",
      "1 · Before the report: what you expect, key questions, what would change the thesis (locks automatically on the report date)",
      "2 · After the report: sourced results (Actual, Prior year, Guidance, Estimate, Source)",
      "3 · Post-earnings reflection, with Hoot's feedback; the prep pack (last quarter, guidance, filing and sell-side changes, questions, all cited)",
    ],
    actions: ["save and lock expectations", "gather results", "save the reflection", "ask for feedback", "mark reviewed", "build or rebuild the prep pack (lead, execs, admins)"],
    hoot: "Expectations and the reflection are the analyst's; gather evidence and give feedback, never write them.",
  },
  {
    key: "economic_calendar",
    name: "Economic releases",
    routes: ["/t/:team/economic-calendar"],
    access: "all",
    summary: "the week's economic releases and speakers with impact, previous, consensus, market-implied odds and results",
    shows: [
      "Week of …, coverage Verified or Partial; filter by importance (High, Medium+) or search a release or speaker",
      "When, Release, Impact, Previous, Consensus, Market price (prediction-market odds), Result; Ask Hoot on each row",
      "Factor-sensitive releases: how the Fund has co-moved with them (past co-movement, not a forecast)",
    ],
    hoot: "get_macro_series for the data series behind a release, get_market_odds for what traders price in.",
    navigate: "economic_calendar",
  },
  {
    key: "performance",
    name: "Performance (attribution)",
    routes: ["/attribution", "/t/:team/attribution"],
    access: "book",
    summary: "how the Fund or a team did over a period against its sector benchmark, and where the gap came from (sectors, teams, holdings)",
    shows: [
      `Gap against the sector benchmark in bp for the period (Today, ${PERIODS}, since inception, custom); Fund, Benchmark and S&P 500 returns`,
      "Sector weights (allocation) + Picks within sectors (selection) = Total gap",
      "By sector: weights and returns vs the benchmark, Weights and Picks effects in bp; By team: each team's share of the return",
      "Holdings by contribution: Helped most / Hurt most",
      "Today (period=today): live or provisional session with P&L, a holdings table (Wt open, Wt now, Price, Today, Contribution, P&L)",
    ],
    hoot: "get_attribution reproduces the page for a period; get_daily_performance for today.",
    navigate: "performance",
  },
  {
    key: "performance_today",
    name: "Performance today",
    routes: ["/daily", "/t/:team/daily"],
    access: "book",
    summary: "today's return and attribution, live while the market is open (opens Performance with period Today)",
    shows: ["Live, provisional (closed, priced from closing quotes until the 5:00 pm price run) or final", "P&L, benchmark, S&P 500, the sector bridge and each holding's contribution today"],
    hoot: "get_daily_performance; say what time the prices are from.",
    navigate: "performance_today",
  },
  {
    key: "activity",
    name: "Activity (trade ledger)",
    routes: ["/attribution/ledger"],
    access: "fund",
    summary: "the trade ledger, the source of truth for positions: trades, cash, dividends, held trade tickets and the PT sheet check",
    shows: [
      "To review: emailed trade tickets Hoot held back because the price is more than 5% from the market",
      "Check against the PT sheet: tickers where the sheet and the ledger differ, with the likely cause",
      "History: trades, cash and dividends by day, bought, sold, net deposits; NAV and cash at the close",
      "Entries are voided, never deleted; benchmark weights and securities/team sectors are edited from here",
    ],
    actions: ["record a trade or cash flow", "upload a trade ticket", "import CSV", "void an entry", "review held tickets"],
    navigate: "activity",
  },
  {
    key: "risk",
    name: "Risk",
    routes: ["/risk", "/t/:team/risk"],
    access: "book",
    summary: "how risky today's portfolio is: volatility, tracking error, drawdowns, where the risk comes from and stress tests",
    shows: [
      "Volatility (annualized) over the lookback (6M/1Y/2Y), tracking error, S&P 500 volatility, beta; modeled drawdown",
      "Sharpe ratio, Max drawdown, Expected shortfall, Effective positions",
      `Where the risk comes from: each holding's weight vs share of risk (Adds more: share of risk ${ADDS_MORE_MULTIPLE}× its weight or more), by team and by sector`,
      `Stress tests: ${STRESS} (Fund vs benchmark, on today's value)`,
      "Where the active risk comes from; correlation heatmap; realized figures; a team page shows the team as its own portfolio (scaled to 100%, no cash)",
    ],
    actions: ["export CSV", "Trim 2 pp → opens that trade in Backtesting"],
    hoot: "get_portfolio_risk reproduces the page; these are estimates from past returns, not forecasts.",
    navigate: "risk",
  },
  {
    key: "exposure",
    name: "Exposure",
    routes: ["/exposure", "/t/:team/exposure"],
    access: "book",
    summary: "distance from the benchmark: active share, sector tilts, concentration, ETF look-through, factors",
    shows: [
      "Active share vs the S&P 500 (or sector active share); largest tilt and most underweight sector",
      "Sector weights against the benchmark with the tilt in bp; Concentration (effective positions, top holdings, cash)",
      "Look through ETFs: each ETF replaced by the stocks it holds; largest positions and active bets after look-through",
      "Factor and macro sensitivities: Market, Size, Value, Momentum, Rates, Dollar, Oil",
    ],
    actions: ["toggle ETF look-through", "export CSV"],
    hoot: "get_portfolio_risk with page \"exposure\" reproduces it; describe positioning, never recommend trades.",
    navigate: "exposure",
  },
  {
    key: "backtesting",
    name: "Backtesting",
    routes: ["/backtesting"],
    access: "all",
    summary: "a hypothetical replay of today's holdings over past prices with changed weights; not the Fund's realized return",
    shows: [
      "Today's weights vs the modified scenario vs a benchmark (SPY, QQQ or IWM) over chosen dates",
      "Weight changes (edit weights, trim or add a holding funded from cash or the rest pro rata, add a company)",
      "Saved scenarios (shared), What changes, Risk impact, contributors and by-day detail",
      "Execs and admins replay the Fund; everyone else their team's holdings",
    ],
    actions: ["run a replay", "save or remove a scenario", "switch to the classic layout"],
    hoot: "run_backtest; always call it a hypothetical replay.",
    navigate: "backtesting",
  },
  {
    key: "weekly",
    name: "Weekly update",
    routes: ["/weekly", "/weekly/:week"],
    access: "fund",
    summary: "the Sunday update pack for Aadi: the week's performance, performers, highlights, agenda, email",
    shows: [
      "Week ended …, the Fund's week vs the S&P 500; the pack builds every Sunday at 12:00 New York",
      "Tabs: Summary (top and worst 3, highlights, why they moved, movements opened, process updates, next week), Email, Highlights (AUM, YTD, SPXTR YTD, deck chart), Agenda, Checks",
    ],
    actions: ["build or rebuild the pack", "refresh from the PT sheet", "edit fields", "lock or reopen", "send the email"],
    navigate: "weekly",
  },
  {
    key: "changelog",
    name: "Changelog",
    routes: ["/changelog"],
    access: "fund",
    summary: "every change merged into the app, newest first, with short summaries",
    shows: ["Merged in the last 7 days; entries by day with headline, summary and author"],
    navigate: "changelog",
  },
  {
    key: "admin",
    name: "Admin",
    routes: ["/admin"],
    access: "fund",
    summary: "members, invitations, scheduled jobs and connections; admins change them, execs view",
    shows: ["Members: role, team, sign-in, last active; invitations", "Jobs and connections: close check (5:00 PM ET, opens movements), prices, evening brief, morning sweep, bellwethers, prep packs, weekly pack; weekly email recipients; Drive; research agent model; external tools (MCP)"],
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
  [`${RULE_BP} rule`]: `A holding opens a major-movement investigation when its daily return differs from the S&P 500's by ${RULE_BP} (${MOVEMENT_THRESHOLD_PP} percentage points) or more, on official closes, either direction. The team's update is due noon the next trading day.`,
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
  "write-up": "The team update on a major movement: what happened and what the evidence supports. The analyst writes it; Hoot can give feedback.",
  expectations: "Before an earnings report, what the analyst expects, key questions and what would change the thesis. Locks on the report date.",
  reflection: "After an earnings report, what happened against what the analyst expected.",
  "prep pack": "Hoot's cited earnings prep: last quarter's numbers, guidance, what changed in filings and the sell-side, and questions to watch. Builds two weeks before a report.",
  bellwethers: "Large companies whose results tend to signal how a sector is doing.",
  "bmo / amc": "Before market open / after market close: when a company reports.",
  consensus: "The average forecast of sell-side analysts (or of economists, for a release).",
  "est.": "An earnings date the company hasn't confirmed yet.",
  xbrl: "The machine-readable tags in SEC filings; Models takes reported values from them.",
  "research board": "A holding's page in Research that collects every chat about it, its sources and what Hoot remembers.",
  "pt sheet": "The execs' live price target sheet (Google Sheet). Hoot can read it for execs and admins only; a chat that reads it becomes fund-only.",
  "hypothetical replay": "A backtest: today's holdings (or changed weights) run over past prices, rebalanced daily. Not the Fund's realized return.",
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

/** The app-map page for a pathname, with its segments (team, ticker, id). The Fund's own /t/fund is the Portfolio overview. */
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

/** One line per page for Hoot's prompt; the detail is one explain_app call away. */
export function appMapPromptBlock(): string {
  return APP_MAP.filter((e) => e.navigate || e.key === "board")
    .map((e) => `- ${e.name}${e.access === "all" ? "" : e.access === "book" ? " (leads, execs, admins)" : " (execs, admins)"}: ${e.summary}`)
    .join("\n");
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
  pages?: { key: string; name: string; summary: string; whoCanOpen: string }[];
  error?: string;
} {
  const out: ReturnType<typeof explainApp> = {};
  if (q.page) {
    const p = q.page.trim();
    const byPath = p.startsWith("/") ? pageForPath(p)?.entry : undefined;
    const n = norm(p).replace(/ page$/, "");
    const entry = byPath ?? APP_MAP.find((e) => e.key === n.replace(/ /g, "_") || norm(e.name) === n || norm(e.name).startsWith(n) || (n.length > 3 && norm(e.name).includes(n)));
    if (entry) out.page = { ...entry, whoCanOpen: ACCESS_LABEL[entry.access], memberCanOpen: canOpenPage(entry.access, q.role) };
  }
  if (q.term) {
    const t = norm(q.term);
    const hits = Object.entries(GLOSSARY).filter(([k]) => norm(k) === t || norm(k).includes(t) || (t.length > 3 && t.includes(norm(k))));
    if (hits.length) out.terms = hits.slice(0, 4).map(([term, meaning]) => ({ term, meaning }));
  }
  if (!q.page && !q.term) out.pages = APP_MAP.map((e) => ({ key: e.key, name: e.name, summary: e.summary, whoCanOpen: ACCESS_LABEL[e.access] }));
  if ((q.page && !out.page) || (q.term && !out.terms)) {
    const missing = [q.page && !out.page ? `page "${q.page}"` : null, q.term && !out.terms ? `term "${q.term}"` : null].filter(Boolean).join(" and ");
    if (!out.page && !out.terms) return { error: `No ${missing} in the app map. Pages: ${APP_MAP.map((e) => e.name).join(", ")}. Terms: ${Object.keys(GLOSSARY).join(", ")}.` };
  }
  return out;
}
