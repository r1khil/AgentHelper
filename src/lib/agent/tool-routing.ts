import { pageForPath } from "@/lib/hoot/app-map";
import { PROPOSAL_TOOLS, proposalToolsFor } from "@/lib/hoot/proposals";
import { pageContextBlock, type PageContext } from "./page-context";

// Which of Hoot's tools the model sees at each step of a chat turn (the AI SDK's `activeTools`). Every tool schema
// costs input tokens on every step, and a long list invites wrong picks, so a turn starts from a small CORE set plus
// the tiers its question, page and role call for. Pure and model-free: a regex router, cheap to test against every
// eval case. The full tool set stays registered, so history that used a tool outside the active set still converts,
// and a call to a registered tool outside the set makes that tool active from the next step on.

/** Always on: the everyday research lookups and operating the app. */
export const CORE = [
  "get_quote",
  "get_price_history",
  "get_relative_moves",
  "get_news",
  "get_key_financials",
  "find_documents",
  "search_documents",
  "read_document",
  "get_filings",
  "read_filing",
  "get_team_context",
  "get_earnings_calendar",
  "recall",
  "remember",
  "navigate",
  "set_theme",
  "explain_app",
  "find_tools",
] as const;

/** Tool groups unlocked together. Every native tool is in CORE, exactly one tier, WRITE or RETIRED (a test enforces it). */
export const TIERS = {
  /** The Fund's own numbers: attribution, today's performance, risk and exposure, backtests. */
  book: ["get_attribution", "get_daily_performance", "get_portfolio_risk", "run_backtest"],
  /** The app's own pages: the earnings list, the economic calendar, the ledger, to-dos, what's new. */
  workspace: ["get_upcoming_earnings", "get_economic_calendar", "get_ledger", "get_my_todos", "get_whats_new"],
  macro: ["get_macro_series", "get_market_odds"],
  /** Who owns and trades the stock, what the Street expects, and how it compares with peers. */
  ownership: ["get_insider_transactions", "get_institutional_holders", "get_analyst_estimates", "compare_peers", "get_peer_moves"],
  web: ["search_web", "read_url"],
  /** One XBRL line item beyond the standard income statement. */
  filingDetail: ["get_financials"],
  compute: ["run_python"],
  sheet: ["read_pt_sheet"],
  transcripts: ["find_call_transcripts", "read_call_transcript"],
  background: ["get_company_background"],
  /** The Screener's filing-change detector: what changed in a 10-K or 10-Q, and 8-K red flags. */
  filingChanges: ["get_filing_changes", "get_screen_hits", "get_reverse_dcf", "get_value_trap_checklist"],
} as const satisfies Record<string, readonly string[]>;

export type Tier = keyof typeof TIERS;

/** What each tier is for, in find_tools' catalog. */
export const TIER_LABELS: Record<Tier, string> = {
  book: "the Fund's or a team's own numbers: today's performance vs the benchmark, attribution over a period, risk, backtests",
  workspace: "the app's pages: upcoming earnings, the economic calendar, the trade ledger, to-dos, what's new",
  macro: "macro data (FRED series) and prediction-market odds",
  ownership: "insiders, institutional holders, analyst estimates, peer comparisons, the rest of the book's moves",
  web: "web search and reading any URL",
  filingDetail: "any XBRL line item beyond the standard income statement",
  compute: "Python for statistics",
  sheet: "the PT sheet",
  transcripts: "earnings and sell-side call transcripts",
  background: "company background (Wikipedia)",
  filingChanges: "the Screener: filing changes and 8-K red flags, the monthly screen's hits, a reverse DCF (implied growth) and the value-trap checklist",
};

/**
 * Merged into another tool and never offered again, but still registered so chats that used them keep working
 * (history conversion, and a model that calls one by habit still gets an answer): list_filing_documents is
 * get_filings with withExhibits; search_financial_concepts is get_financials' unknown-concept path.
 */
export const RETIRED = ["list_filing_documents", "search_financial_concepts"] as const;

/**
 * Tools that propose a change to the member's data (a card they confirm). They are registered only when the member's
 * latest message asks for that kind of change (proposalToolsFor in @/lib/hoot/proposals), and routing applies the
 * same check, so it can never widen that gate.
 */
export const WRITE = PROPOSAL_TOOLS;

/** Once a tool has run, what it usually leads to. */
export const FOLLOW_UPS: Record<string, readonly string[]> = {
  get_filings: ["read_filing"],
  search_documents: ["read_document"],
  find_documents: ["read_document"],
  get_news: ["read_url"],
  search_web: ["read_url"],
  get_attribution: ["get_news", "get_peer_moves"],
  get_daily_performance: ["get_news", "get_peer_moves"],
  get_key_financials: ["get_financials"],
  find_call_transcripts: ["read_call_transcript"],
};

// Word lists, matched against the lowercased question. Over-including costs a few hundred tokens; missing a tool
// costs a failed call and a step, so they lean broad.
const WORDS: Record<Tier, RegExp> = {
  book: new RegExp(
    [
      /\b(?:perform\w*|attribution|allocation|selection|interaction|brinson|under ?perform\w*|out ?perform\w*|detract\w*|contribut\w*|p&l|pnl|ytd|year to date|since inception|returns?)\b/,
      /\b(?:risk(?! factor)|volatil\w*|beta|tracking error|value at risk|var|drawdown|stress(?:ed)? test\w*|stress|crisis|concentrat\w*|exposure|exposed|active share|weight\w*|overweight\w*|underweight\w*|sector bets?|factor (?:exposures?|sensitivit\w*|betas?|tilts?|loadings?)|diversif\w*)\b/,
      /\b(?:backtest\w*|back-test\w*|scenario|what[- ]if|hypothetical\w*|if (?:we|the fund) (?:had )?(?:held|bought|sold|added|trimmed))\b/,
      /\b(?:our (?:fund|portfolio|book|performance|returns?|sleeve)|(?:the|our) (?:fund|portfolio|book)(?:'s)? (?:up|down|doing|did|return\w*|perform\w*))\b/,
      // Relative to the benchmark: "why are we ahead of the benchmark", "behind the S&P", "trailing the index".
      /\b(?:benchmarks?|active return|excess return|alpha|relative return|(?:ahead of|behind|trail\w*|lagg?\w*|beat\w*|outpac\w*|under-?perform\w*|out-?perform\w*) (?:the )?(?:s&p(?: 500)?|spx|spy|index|market|dow))\b/,
    ]
      .map((r) => r.source)
      .join("|"),
  ),
  workspace:
    /\b(?:overdue|earnings|reports? (?:soon|next|this|in the)|who reports|reporting|prep packs?|economic (?:calendar|releases?|data|events?)|releases? (?:are )?out|this week'?s (?:data|releases?)|ledger|trades?|traded|bought|buy|sold|sell|purchas\w*|cost basis|cash (?:movements?|flows? in)|to-?dos?|to do|need to do|my (?:tasks|deadlines|list)|due|deadlines?|what'?s new|what changed|changelog|release notes|new features?|in the app)\b/,
  macro:
    /\b(?:macro\w*|fed|fomc|federal reserve|rates?|rate (?:hike|cut)s?|interest rates?|treasur\w*|yields?|curve|inflation|cpi|pce|ppi|jobs report|payrolls?|nfp|unemployment|jobless|gdp|recession|vix|oil|crude|brent|wti|dollar|dxy|credit spreads?|spreads?|kalshi|polymarket|odds|probabilit\w*|chances?|betting|traders (?:expect|price|bet)|priced in|election|shutdown|tariffs?|economic\w*|economy)\b/,
  ownership:
    /\b(?:insiders?|form 4|buying or selling|who owns|owners?|ownership|institution\w*|holders?|13f|stakes?|consensus|estimates?|street|analysts? (?:expect|think|rate|rating)|price targets?|target price|ratings?|upgrade\w*|downgrade\w*|expectations?|compare\w*|comparison|compared|peers?|competitors?|rivals?|comps|versus|vs\.?|industry|rest of the book|other holdings|move[ds]?|moving|(?:is|are|was|were|went|gone|goes|going|trading|traded|closed|opened|been) (?:up|down|higher|lower)|up or down|rall\w*|drop\w*|fell|fall\w*|jump\w*|surg\w*|sell-?off|slid|sank|tank\w*|soar\w*)\b/,
  web: /\b(?:today|tonight|this morning|right now|currently|breaking|news|headlines?|going on|happening|happened|latest|rumou?rs?|announc\w*|why (?:is|are|did|was|were)\b[^?]{0,60}\b(?:up|down|higher|lower|moving|moved|fall\w*|drop\w*|jump\w*|surg\w*|rall\w*)|search the web|web search|look (?:it|that) up online|google it|online|article|website|link)\b|https?:\/\/|www\./,
  filingDetail:
    /\b(?:xbrl|concepts?|line items?|segments?|capex|capital expenditures?|free cash flow|fcf|debt|borrowings?|buybacks?|repurchas\w*|share count|shares outstanding|dividends?|r&d|research and development|sg&a|inventor(?:y|ies)|balance sheet|cash flow statement|leases?|goodwill|deferred revenue|backlog|rpo|remaining performance|stock-based comp\w*|sbc|interest expense|tax rate|effective tax|depreciation|amortization|ebitda|assets|liabilities|equity|book value|working capital|receivables|payables)\b/,
  compute:
    /\b(?:correlat\w*|regress\w*|standard deviation|stdev|std dev|sharpe|sortino|covariance|z-?scores?|percentiles?|distribution|monte carlo|simulat\w*|rolling|moving average|cagr|annuali[sz]\w*|compute|calculate|statistic\w*|python|screen)\b/,
  sheet: /\b(?:pt sheet|price targets? sheet|price targets?|target price|cost basis|off (?:its |the )?target|% off|mag ?7|mag-7|magnificent 7|the sheet|google sheet|spreadsheet)\b/,
  transcripts: /\b(?:calls?|transcripts?|sell-?side|conference|management (?:said|says|say|comment\w*|discuss\w*)|prepared remarks|q&a|analyst day|investor day|brokers?|bank notes?)\b/,
  background:
    /\b(?:founders?|founded|ceo|cfo|chair\w*|leadership|management team|executives?|headquarter\w*|hq|history|background|parent company|parent|subsidiar\w*|who runs|what does (?:it|the company|\w+) do|business model|overview|spun off|spin-?off|acquired by|owned by|wikipedia)\b/,
  filingChanges:
    /\b(?:red flags?|flag(?:s|ged)?|risk factors?|filing changes?|what(?:'s| has| have)? changed|changes? (?:in|to) (?:the |its |their )?(?:latest |last |new )?(?:10-?k|10-?q|filings?|disclosures?|risk factors?)|new (?:risks?|disclosures?)|material weakness\w*|going concern|restat\w*|non-reliance|auditor|impairment|non-gaap|customer concentration|lazy prices|screener|screens?|screened|worth a look|reverse dcf|implied growth|priced in|value traps?|cheap for a reason|garp)\b/,
};

/** Page keys (app map) that unlock a tier on their own. */
const PAGE_TIERS: Record<string, Tier[]> = {
  home: ["workspace", "book"],
  portfolio: ["book"],
  performance: ["book"],
  risk: ["book"],
  exposure: ["book"],
  what_if: ["book"],
  write_up: ["workspace"],
  sell_side: ["transcripts"],
  markets: ["workspace", "macro"],
  earnings_report: ["workspace", "transcripts"],
  activity: ["workspace"],
  changelog: ["workspace"],
  sell_side_call: ["transcripts"],
  pt_sheet: ["sheet"],
  screener: ["filingChanges"],
};

const KIND_TIERS: Record<Exclude<PageContext["kind"], "page">, Tier[]> = {
  attribution: ["book"],
  daily: ["book"],
  risk: ["book"],
  exposure: ["book"],
  backtesting: ["book"],
};

export type McpServerRef = { name: string; prefix: string };

export type RoutingInput = {
  /** The member's latest message. */
  question: string;
  page?: PageContext | null;
  /** The viewer can see the Fund's book (exec or admin); a lead sees their team's. */
  seesBook?: boolean;
  /** The chat is pinned to one holding. */
  pinnedHolding?: boolean;
  /** Every tool registered for this turn. */
  availableTools: readonly string[];
  stepNumber: number;
  /** Tools called earlier in this turn (valid calls or not). */
  usedTools?: readonly string[];
  /** Tools the previous answer in this chat used, so a short follow-up ("and for tech?") keeps them. */
  priorTools?: readonly string[];
  /** Tools the model asked for this turn through find_tools, when the router didn't offer them. */
  requestedTools?: readonly string[];
  mcpServers?: readonly McpServerRef[];
};

const native = new Set<string>([...CORE, ...Object.values(TIERS).flat(), ...RETIRED, ...WRITE]);

/** Curly quotes straightened and lowercased, so "what’s" matches "what's". */
const normalize = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/** "vs the S&P 500" is a benchmark, not a peer comparison. */
const withoutBenchmark = (q: string) => q.replace(/\b(?:vs\.?|versus|against|relative to|compared (?:to|with))\s+(?:the\s+)?(?:s&p(?: 500)?|spx|spy|index|benchmark|market)\b/g, " ");

/** The tiers a question, page and role call for. */
export function tiersFor(input: Pick<RoutingInput, "question" | "page" | "seesBook" | "pinnedHolding">): Set<Tier> {
  const q = normalize(input.question);
  const tiers = new Set<Tier>();
  for (const tier of Object.keys(WORDS) as Tier[]) {
    const text = tier === "ownership" ? withoutBenchmark(q) : q;
    if (WORDS[tier].test(text)) tiers.add(tier);
  }
  // A lead, exec or admin asking how "we" did means the book even without a performance word.
  if (input.seesBook && /\b(?:we|we're|us|our)\b/.test(q) && /\b(?:up|down|do|doing|did|lose|lost|losing|gain\w*|make money|made money|beat\w*|lag\w*|trail\w*|ahead|behind|leading|winning|outpac\w*|perform\w*|return\w*|green|red|p&l|pnl)\b/.test(q)) tiers.add("book");
  const page = input.page;
  if (page && page.kind !== "page") for (const t of KIND_TIERS[page.kind]) tiers.add(t);
  const key = page ? pageForPath(page.path.split("?")[0])?.entry.key : undefined;
  for (const t of (key && PAGE_TIERS[key]) || []) tiers.add(t);
  return tiers;
}

/** Tool names the page-context block tells the model to call: they must be active. */
export function toolsNamedOnPage(page: PageContext | null | undefined, available: readonly string[]): string[] {
  if (!page) return [];
  const block = pageContextBlock(page);
  return available.filter((name) => new RegExp(`\\b${name}\\b`).test(block));
}

/** MCP tools whose server the question names (by name or tool prefix), or that it names outright. */
function mcpToolsFor(question: string, available: readonly string[], servers: readonly McpServerRef[]): string[] {
  const q = normalize(question);
  const external = available.filter((n) => !native.has(n));
  const named = servers.filter((s) => [s.name, s.prefix].some((w) => w.trim().length >= 2 && new RegExp(`\\b${escapeRe(normalize(w.trim()))}\\b`).test(q)));
  return external.filter((n) => named.some((s) => n.startsWith(`${s.prefix}_`)) || q.includes(n.toLowerCase()));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The tools the model may call on this step. Step 0 is CORE plus the tiers the question, page and role call for;
 * later steps add whatever the turn already called and those tools' usual follow-ups, never removing anything, so a
 * multi-part question planned on step 0 can still fire on step 1. Order follows `availableTools` (stable prompts).
 */
export function activeToolsFor(input: RoutingInput): string[] {
  const available = new Set(input.availableTools);
  const on = new Set<string>(CORE);
  for (const tier of tiersFor(input)) for (const t of TIERS[tier]) on.add(t);
  for (const t of toolsNamedOnPage(input.page, input.availableTools)) on.add(t);
  // Never a retired tool, and never a change tool: those follow only the latest message's own request.
  for (const t of input.priorTools ?? []) if (!(RETIRED as readonly string[]).includes(t) && !(WRITE as readonly string[]).includes(t)) on.add(t);
  for (const t of mcpToolsFor(input.question, input.availableTools, input.mcpServers ?? [])) on.add(t);
  for (const t of proposalToolsFor(input.question)) on.add(t);
  for (const t of input.requestedTools ?? []) if (requestable(t)) on.add(t);
  if (input.stepNumber > 0) {
    for (const t of input.usedTools ?? []) {
      on.add(t);
      for (const f of FOLLOW_UPS[t] ?? []) on.add(f);
    }
  }
  return input.availableTools.filter((t) => on.has(t) && available.has(t));
}

/** find_tools can turn on anything registered except a retired tool or a change tool (those follow the member's own words). */
const requestable = (name: string) => !(RETIRED as readonly string[]).includes(name) && !(WRITE as readonly string[]).includes(name);

/**
 * The tools find_tools can turn on: every registered tool outside CORE, by tier, then any admin-registered (MCP) ones.
 * A tier name stands for all of its tools.
 */
export function toolCatalog(available: readonly string[]): { lines: string[]; resolve: (names: readonly string[]) => { enabled: string[]; unknown: string[] } } {
  const has = new Set(available);
  const core = new Set<string>(CORE);
  const lines: string[] = [];
  const byTier: Partial<Record<Tier, string[]>> = {};
  for (const tier of Object.keys(TIERS) as Tier[]) {
    const tools = TIERS[tier].filter((t) => has.has(t));
    if (!tools.length) continue;
    byTier[tier] = tools;
    lines.push(`${tier} (${TIER_LABELS[tier]}): ${tools.join(", ")}`);
  }
  const external = available.filter((n) => !native.has(n));
  if (external.length) lines.push(`external (admin-registered): ${external.join(", ")}`);
  const resolve = (names: readonly string[]) => {
    const enabled: string[] = [];
    const unknown: string[] = [];
    for (const raw of names) {
      const name = raw.trim();
      const group = byTier[name as Tier] ?? (name === "external" ? external : undefined);
      const hits = group ?? (has.has(name) && !core.has(name) && requestable(name) ? [name] : []);
      if (!hits.length) {
        // Asking for a tool that is already on is harmless; only a name nothing has is worth reporting.
        if (!core.has(name)) unknown.push(name);
        continue;
      }
      for (const h of hits) if (!enabled.includes(h)) enabled.push(h);
    }
    return { enabled, unknown };
  };
  return { lines, resolve };
}

/** The member's latest question and the tools the previous answer used, from the chat's UI messages. */
export function routingFromMessages(messages: readonly { role: string; parts?: readonly unknown[] }[]): { question: string; priorTools: string[] } {
  let question = "";
  let last = messages.length - 1;
  for (; last >= 0; last--) {
    if (messages[last].role !== "user") continue;
    question = textOf(messages[last].parts);
    break;
  }
  const priorTools: string[] = [];
  for (let i = last - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") break;
    if (m.role !== "assistant") continue;
    for (const p of m.parts ?? []) {
      const type = (p as { type?: unknown }).type;
      if (typeof type !== "string") continue;
      const name = type === "dynamic-tool" ? (p as { toolName?: unknown }).toolName : type.startsWith("tool-") ? type.slice(5) : undefined;
      if (typeof name === "string" && !priorTools.includes(name)) priorTools.push(name);
    }
  }
  return { question, priorTools };
}

function textOf(parts: readonly unknown[] | undefined): string {
  return (parts ?? [])
    .map((p) => ((p as { type?: unknown }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
    .join(" ")
    .trim();
}
