import { z } from "zod";
import { PERIOD_KEYS, PERIOD_LABELS } from "@/lib/attribution/periods";

// What the member was looking at when they asked Hoot. It rides on the question's message metadata, is
// re-validated on the server, and only ever steers which tools the agent reaches for first: every number the agent
// quotes still comes from a tool run on the server.

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const path = z.string().max(300).regex(/^\//);
const title = z.string().max(160);
const ticker = z.string().max(12).regex(/^[A-Za-z0-9.\-^]+$/);

const attribution = z.object({
  kind: z.literal("attribution"),
  path,
  title,
  scope: z.enum(["fund", "team"]),
  /** Team slug for a team page. */
  team: z.string().max(60).optional(),
  period: z.enum(PERIOD_KEYS),
  // Straight from the URL: a malformed date drops itself, not the whole context.
  from: iso.optional().catch(undefined),
  to: iso.optional().catch(undefined),
  /** The dates the page showed, so "today" can be pinned to a session. */
  start: iso,
  end: iso,
});

/** The Daily page: today's performance, live during market hours. */
const daily = z.object({
  kind: z.literal("daily"),
  path,
  title,
  scope: z.enum(["fund", "team"]),
  team: z.string().max(60).optional(),
  /** The session shown and whether it was live, provisional (after the bell) or final. */
  session: iso,
  status: z.enum(["live", "provisional", "final"]),
});

const backtesting = z.object({
  kind: z.literal("backtesting"),
  path,
  title,
  from: iso,
  to: iso,
  benchmark: z.enum(["SPY", "QQQ", "IWM"]),
  /** Weights the member changed from the saved portfolio, in percent. */
  changed: z.array(z.object({ ticker, savedPct: z.number().min(0).max(100), scenarioPct: z.number().min(0).max(100) })).max(60),
  addedTickers: z.array(ticker).max(12).default([]),
  /** Whether a result is on screen and still matches the inputs above. */
  ran: z.boolean(),
});

const risk = z.object({
  kind: z.literal("risk"),
  path,
  title,
  scope: z.enum(["fund", "team"]),
  team: z.string().max(60).optional(),
  lookback: z.enum(["6m", "1y", "2y"]),
  /** Close the positions were valued at. */
  asOf: iso,
});

/** The Exposure page: the same risk report as Risk, read as sector weights against the benchmark. */
const exposure = risk.extend({ kind: z.literal("exposure") });

const page = z.object({ kind: z.literal("page"), path, title });

export const pageContextSchema = z.discriminatedUnion("kind", [attribution, daily, backtesting, risk, exposure, page]);
export type PageContext = z.infer<typeof pageContextSchema>;

export function parsePageContext(value: unknown): PageContext | null {
  const r = pageContextSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** The page attached to the newest user message that carries one: where the member asked from. */
export function pageContextFromMessages(messages: { role: string; metadata?: unknown }[]): PageContext | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !m.metadata || typeof m.metadata !== "object") continue;
    const ctx = parsePageContext((m.metadata as { page?: unknown }).page);
    if (ctx) return ctx;
  }
  return null;
}

/** A few words for the chip on the question and in Hoot's panel. */
export function pageContextLabel(ctx: PageContext): string {
  if (ctx.kind === "attribution") return `${ctx.title} · ${ctx.period === "itd" ? "All" : PERIOD_LABELS[ctx.period]}`;
  if (ctx.kind === "daily") return `${ctx.title} · ${ctx.status === "final" ? ctx.session : ctx.status === "live" ? "live" : "closed, provisional"}`;
  if (ctx.kind === "risk") return `${ctx.title} · ${ctx.lookback} window`;
  if (ctx.kind === "exposure") return `${ctx.title} · ${ctx.asOf} close`;
  if (ctx.kind === "backtesting") return `Backtesting · ${ctx.from} to ${ctx.to}${ctx.changed.length ? ` · ${ctx.changed.length} weight${ctx.changed.length === 1 ? "" : "s"} changed` : ""}`;
  return ctx.title;
}

const q = (s: string) => JSON.stringify(s);

/** The prompt block that tells the agent what is on the member's screen and which call reproduces it. */
export function pageContextBlock(ctx: PageContext): string {
  const head = `\n\nWHAT THE MEMBER IS LOOKING AT: they asked from ${ctx.path} ("${ctx.title}"). Read "this", "here", "today" and "the page" against it.`;
  if (ctx.kind === "attribution") {
    const args = [`scope: ${q(ctx.scope)}`, ...(ctx.team ? [`team: ${q(ctx.team)}`] : []), `period: ${q(ctx.period)}`, ...(ctx.period === "custom" && ctx.from ? [`from: ${q(ctx.from)}`] : []), ...(ctx.period === "custom" && ctx.to ? [`to: ${q(ctx.to)}`] : [])].join(", ");
    return `${head}
- The page shows ${ctx.scope === "fund" ? "whole-fund" : `the ${ctx.team ?? "team"} team's`} attribution for ${PERIOD_LABELS[ctx.period]} (returns from the ${ctx.start} close through the ${ctx.end} close).
- For questions about it (why the Fund under- or outperformed, what drove a number, which holdings or sectors hurt), call get_attribution with { ${args} } first: it returns the page's numbers. Explain them in plain language: lead with the headline versus the S&P 500, then the sector-benchmark bridge (allocation, selection, interaction), then the holdings and sectors that moved it most. End every line or bullet that uses one of its figures with its [src:ID], table rows included in the table's last column.
- Attribution shows where the result came from, not why those stocks moved. A question about why or the cause needs both: as soon as get_attribution returns, call get_news (and get_peer_moves when a whole sector moved) for the two or three biggest detractors (or contributors, for outperformance) over that window, then connect the two. Say plainly when the news does not explain a move; do not offer to look it up later instead.
- Attribution uses closing prices, so "today" before the close means the last completed session (${ctx.end}); say so. For today's live numbers during market hours, call get_daily_performance instead.`;
  }
  if (ctx.kind === "daily") {
    const args = [`scope: ${q(ctx.scope)}`, ...(ctx.team ? [`team: ${q(ctx.team)}`] : [])].join(", ");
    return `${head}
- The page shows ${ctx.scope === "fund" ? "the whole Fund's" : `the ${ctx.team ?? "team"} team's`} performance for ${ctx.session}, ${ctx.status === "live" ? "live: priced from quotes during the session, refreshed every minute" : ctx.status === "provisional" ? "after the bell, priced from closing quotes until the 5:00 pm price run" : "final, from stored closes"}.
- For questions about it (how the Fund is doing today, why it is up or down, what is driving it, stocks vs ETFs), call get_daily_performance with { ${args} } first: the numbers move through the day, so never reuse figures from earlier in the chat. Lead with the return and P&L versus the S&P 500, then the sector-benchmark bridge (allocation, selection, interaction), then the holdings that moved it most. Say what time the prices are from while the market is open, and end every line or bullet that uses one of its figures with its [src:ID].
- For why those holdings moved, call get_news (and get_peer_moves when a whole sector moved) for the two or three biggest detractors (or contributors) as soon as get_daily_performance returns, then connect the two. Say plainly when the news does not explain a move.`;
  }
  if (ctx.kind === "backtesting") {
    const weights = ctx.changed.length ? `{ ${ctx.changed.map((c) => `${q(c.ticker)}: ${c.scenarioPct}`).join(", ")} }` : null;
    const addedTickers = ctx.addedTickers.length ? `, addedTickers: [${ctx.addedTickers.map(q).join(", ")}]` : "";
    return `${head}
- Their scenario: ${ctx.from} to ${ctx.to} against ${ctx.benchmark}${ctx.changed.length ? `, with ${ctx.changed.map((c) => `${c.ticker} ${c.savedPct}% → ${c.scenarioPct}%`).join(", ")}` : ", saved weights unchanged"}.${ctx.ran ? "" : " They have not run it with these inputs yet."}
- For questions about it, call run_backtest with { from: ${q(ctx.from)}, to: ${q(ctx.to)}, benchmark: ${q(ctx.benchmark)}${addedTickers}${weights ? `, weights: ${weights}` : ""} } first, then explain what changed and why in plain language (which holdings' contributions moved), ending every line that uses one of its figures with its [src:ID]. A backtest is a hypothetical replay of a current holding snapshot with any scenario additions, not realized performance: say so, never present it as a recommendation, and answer questions about how the portfolio actually did with get_attribution instead.`;
  }
  if (ctx.kind === "risk") {
    const args = [`scope: ${q(ctx.scope)}`, ...(ctx.team ? [`team: ${q(ctx.team)}`] : []), `lookback: ${q(ctx.lookback)}`].join(", ");
    return `${head}
- The page shows ${ctx.scope === "fund" ? "the whole Fund's" : `the ${ctx.team ?? "team"} team's`} risk: positions at the ${ctx.asOf} close, measured over ${ctx.lookback} of daily returns.
- For questions about it (how risky the portfolio is, what drives the risk, concentration, beta, how much it could lose, how it would have done in a past crisis), call get_portfolio_risk with { ${args} } first: it returns the page's numbers. Explain them in plain language, lead with what matters most (usually volatility and beta against the S&P 500, then where the risk is concentrated), and end every line that uses one of its figures with its [src:ID].
- For where the tracking error comes from, use its activeRisk block: each holding's share of active risk against its weight, the benchmark side (the sector ETFs the Fund holds less of than the index; being underweight is a bet too), and marginal tracking error (how many percentage points tracking error moves for 1 pp more of a holding, funded from cash).
- These are statistical estimates from past returns, not forecasts: say so when quoting VaR or the stress test, and never present a risk figure as a recommendation to trade.`;
  }
  if (ctx.kind === "exposure") {
    const args = [`scope: ${q(ctx.scope)}`, ...(ctx.team ? [`team: ${q(ctx.team)}`] : []), `lookback: ${q(ctx.lookback)}`, `page: "exposure"`].join(", ");
    return `${head}
- The page shows ${ctx.scope === "fund" ? "the whole Fund's" : `the ${ctx.team ?? "team"} team's`} exposure at the ${ctx.asOf} close: each sector's weight against the ${ctx.scope === "fund" ? "S&P 500's" : "team's own sector benchmark"}, sorted by active weight (over- minus underweight), the largest active bet (by company and by sector), Active Share, top-10 weight, effective number of positions and cash, then the ETF look-through: each ETF replaced by its holdings, combined exposure per company, names held both directly and through ETFs, each ETF's coverage and as-of date, and stock-level over- and underweights against the benchmark's own holdings. A toggle shows sector weights through the ETFs.
- For questions about it (what the biggest bets are, how concentrated the book is, how far it is from the index, what the ETFs really hold), call get_portfolio_risk with { ${args} } first: it returns the page's numbers (sectors, largestActiveSectorBet, top10WeightPct, effectivePositions, cashPct, activeRisk for how much each bet adds to tracking error, and etfLookThrough for combined exposures, stock-level bets and Active Share). Lead with the largest active bets, then concentration, and end every line that uses one of its figures with its [src:ID].
- Sector bets are against the sector ETFs; stock-level bets and Active Share come from etfLookThrough and depend on each ETF's coverage (say so when an ETF is only partly looked through or its list is stale). Describe positioning; never present it as a recommendation to trade.
- The page also shows factor and macro sensitivities (market, size, value, momentum, rates, dollar, oil betas with t-stats): use factorSensitivities. A beta with |t| < 2 is not statistically significant; call it "no clear exposure" and never describe it as a position or a bet.`;
  }
  return head;
}
