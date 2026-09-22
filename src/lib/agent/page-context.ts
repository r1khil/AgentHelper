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

const backtesting = z.object({
  kind: z.literal("backtesting"),
  path,
  title,
  from: iso,
  to: iso,
  benchmark: z.enum(["SPY", "QQQ", "IWM"]),
  /** Weights the member changed from the saved portfolio, in percent. */
  changed: z.array(z.object({ ticker, savedPct: z.number().min(0).max(100), scenarioPct: z.number().min(0).max(100) })).max(60),
  /** Whether a result is on screen and still matches the inputs above. */
  ran: z.boolean(),
});

const page = z.object({ kind: z.literal("page"), path, title });

export const pageContextSchema = z.discriminatedUnion("kind", [attribution, backtesting, page]);
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
- For questions about it (why the Fund under- or outperformed, what drove a number, which holdings or sectors hurt), call get_attribution with { ${args} } first: it returns the page's numbers. Explain them in plain language: lead with the headline versus the S&P 500, then the sector-benchmark bridge (allocation, selection, interaction), then the holdings and sectors that moved it most. Cite its source id.
- Then, when the question is about causes, look up news, filings or peer moves for the two or three biggest contributors or detractors in that window, and say plainly when nothing explains a move.
- Attribution uses closing prices, so "today" before the close means the last completed session (${ctx.end}); say so.`;
  }
  if (ctx.kind === "backtesting") {
    const weights = ctx.changed.length ? `{ ${ctx.changed.map((c) => `${q(c.ticker)}: ${c.scenarioPct}`).join(", ")} }` : null;
    return `${head}
- Their scenario: ${ctx.from} to ${ctx.to} against ${ctx.benchmark}${ctx.changed.length ? `, with ${ctx.changed.map((c) => `${c.ticker} ${c.savedPct}% → ${c.scenarioPct}%`).join(", ")}` : ", saved weights unchanged"}.${ctx.ran ? "" : " They have not run it with these inputs yet."}
- For questions about it, call run_backtest with { from: ${q(ctx.from)}, to: ${q(ctx.to)}, benchmark: ${q(ctx.benchmark)}${weights ? `, weights: ${weights}` : ""} } first, then explain what changed and why in plain language (which holdings' contributions moved), with its source id. A backtest is hindsight on today's holdings: say so, and never present it as a recommendation.`;
  }
  return head;
}
