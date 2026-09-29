import "server-only";
import { writeFileSync } from "node:fs";
import { and, eq, gte, lte } from "drizzle-orm";
import { generateText, type ToolSet } from "ai";
import { db } from "@/db/client";
import { earnings, holdings, teams } from "@/db/schema";
import type { Source } from "@/lib/providers/types";
import { nextTradingDay, todayNY } from "@/lib/providers/calendar";
import { fmtDay } from "@/lib/format";
import { PREP_BUILD_TRADING_DAYS } from "@/lib/earnings-calendar";
import { agentConfigured } from "@/lib/agent/model";
import { buildAgentDefinition, prepareAgentStep } from "@/lib/agent/definition";
import { bulletCount, extractJsonObject, prepAttempts, selectPrepCandidates, validatePrepPack, type PrepValidation } from "@/lib/agent/prep-pack";
import type { PrepPack } from "@/lib/agent/prep-types";
import { rememberMemory } from "@/lib/agent/memory/store";
import { queueNotification } from "./notify";
import { teamRecipients } from "./recipients";

/** Reports this many NY trading days ahead get a pack. */
export const PREP_HORIZON_DAYS = PREP_BUILD_TRADING_DAYS;
/** Packs built per morning run, to stay inside the free-tier request budget. */
export const PREP_PER_RUN = 3;

const SYSTEM_USER = { id: "system", fullName: "The Owl's Nest", role: "system" };

const PREP_ADDENDUM = `

THIS RUN IS AN EARNINGS PREP PACK, NOT A CHAT. There is no student to talk to; you are assembling evidence that a student will read before the report. Everything above about citations, the learning boundary and tool use still applies. When your research is done, reply with JSON only, no prose before or after, in exactly this shape:
{"sections":[{"key":"last_quarter","bullets":[{"text":"","sourceIds":[""]}]},{"key":"prior_guidance","bullets":[]},{"key":"consensus","bullets":[]},{"key":"team_questions","bullets":[]},{"key":"watch_items","bullets":[]},{"key":"not_retrieved","bullets":[{"text":"","sourceIds":[]}]}]}
Bullet rules: one fact or one question per bullet, under 40 words, with unit and period; every bullet outside not_retrieved cites at least one sourceId returned by a tool in this run (the bare id, no brackets, only in sourceIds, never in the text); consensus bullets say "consensus"; team_questions holds questions and thesis-change criteria found in the team's own documents and notes, quoted or paraphrased with their source; watch_items are things the report or call could clarify, phrased as questions or "watch for", never as your expectation. Never write what you expect, what is likely, or whether the company will beat or miss. At most six bullets per section; keep the whole object under 2,500 words. Empty sections are fine. "sections" must be an array in the order shown.`;

const PREP_FINAL_NUDGE = `Your research budget is used up. Reply now with the JSON object described above, built only from evidence you already retrieved, listing under not_retrieved anything you could not get.`;

function prepPrompt(h: { ticker: string; companyName: string }, e: { reportDate: string; fiscalPeriod: string | null; reportHour: string | null }) {
  return `Build the pre-earnings evidence pack for ${h.ticker} (${h.companyName}), which reports ${e.fiscalPeriod ? `${e.fiscalPeriod} ` : ""}results on ${e.reportDate}${e.reportHour ? ` (${e.reportHour.toUpperCase()})` : ""}.
Gather, with as few steps as possible and independent lookups in the same step:
1. last_quarter: get_key_financials (quarter, 4 periods) for the reported figures and their trend.
2. prior_guidance: what management said about the outlook in the most recent earnings release (get_filings forms ["8-K"], list_filing_documents for EX-99.1, read_filing) and the latest 10-Q MD&A (read_filing item 2). Quote the guidance language with its source.
3. consensus: get_earnings_calendar and get_analyst_estimates, labeled as consensus.
4. team_questions: recall, get_team_context, and search_documents for the team's key questions, catalysts and thesis-change criteria in the initiating report and past earnings updates.
5. watch_items: recent 8-Ks, get_news for the last 30 days, get_insider_transactions, and anything the filings flag as pending (segment changes, one-offs, regulatory items), phrased as what to watch for.
Then reply with the JSON object only.`;
}

/**
 * Build and store the evidence pack for one earnings event. Never writes expectations or a forecast;
 * the validator drops any bullet that reads like one or that cites a source the run did not retrieve.
 */
export async function buildPrepPack(earningsId: string, opts: { notify?: boolean } = {}): Promise<{ ok: true; pack: PrepPack; dropped: PrepValidation["dropped"]; steps: number } | { ok: false; error: string }> {
  if (!agentConfigured()) return { ok: false, error: "Agent is not configured" };
  const [row] = await db.select({ e: earnings, h: holdings, teamSlug: teams.slug }).from(earnings).innerJoin(holdings, eq(holdings.id, earnings.holdingId)).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(earnings.id, earningsId)).limit(1);
  if (!row) return { ok: false, error: "Earnings event not found" };
  const { e, h } = row;
  const attempt = prepAttempts(e.prepPackError) + 1;
  try {
    const def = await buildAgentDefinition({ teamId: h.teamId, holdingId: h.id, user: SYSTEM_USER, purpose: "prep" });
    const instructions = def.instructions + PREP_ADDENDUM;
    const result = await generateText({
      model: def.model,
      instructions,
      prompt: prepPrompt(h, e),
      tools: def.tools as ToolSet,
      stopWhen: def.stopWhen,
      prepareStep: prepareAgentStep(instructions, PREP_FINAL_NUDGE),
      maxRetries: def.maxRetries,
      repairToolCall: def.repairToolCall,
      // The pack is one long JSON object; give it more room than a chat answer.
      maxOutputTokens: 8000,
    });
    const known = new Map<string, Source>();
    for (const step of result.steps) {
      for (const tr of step.toolResults) {
        const out = (tr as { output?: { sources?: Source[] } }).output;
        for (const s of Array.isArray(out?.sources) ? out.sources : []) if (s && typeof s.id === "string") known.set(s.id, s);
      }
    }
    const raw = extractJsonObject(result.text);
    if (!raw && process.env.PREP_DEBUG_DIR) writeFileSync(`${process.env.PREP_DEBUG_DIR}/prep-${h.ticker}-${Date.now()}.txt`, result.text);
    if (!raw) throw new Error(`The model did not return usable JSON (finish: ${result.finishReason}; head: ${result.text.replace(/\s+/g, " ").slice(0, 120)}… tail: …${result.text.replace(/\s+/g, " ").slice(-120)})`);
    const { pack, dropped } = validatePrepPack(raw, known, { reportDate: e.reportDate, model: def.modelId });
    if (dropped.samples.length) console.log(`[prep] ${h.ticker} dropped ${dropped.unknownSource} unsourced, ${dropped.predictive} predictive:`, dropped.samples.join(" | "));
    if (bulletCount(pack) === 0) throw new Error(`No sourced bullets survived validation (dropped: ${JSON.stringify(dropped)})`);
    await db.update(earnings).set({ prepPack: pack, prepPackAt: new Date(), prepPackModel: def.modelId, prepPackError: null }).where(eq(earnings.id, e.id));

    const appUrl = process.env.APP_URL ?? "";
    const boardUrl = `${appUrl}/t/${row.teamSlug}/agent/h/${h.ticker}`;
    const earningsUrl = `${appUrl}/t/${row.teamSlug}/earnings/${e.id}`;
    for (const r of opts.notify === false ? [] : await teamRecipients(h.teamId)) {
      await queueNotification({
        kind: "earnings",
        recipientId: r.id,
        recipientEmail: r.email,
        refId: e.id,
        dedupeKey: `prep:${e.id}:${r.id}`,
        subject: `Earnings prep pack ready: ${h.ticker} reports ${fmtDay(e.reportDate)}`,
        body: `The agent gathered ${bulletCount(pack)} sourced evidence bullets for ${h.ticker}'s ${e.fiscalPeriod ?? ""} report on ${fmtDay(e.reportDate)}: last quarter's figures, guidance on record, consensus, the team's own questions, and items to watch.\n\nIt contains no expectations; those are yours to write before the report.\n\n${h.ticker} research: ${boardUrl}\nEarnings page: ${earningsUrl}`,
      }).catch((err) => console.error("[prep] notify failed", err));
    }
    await rememberMemory({ scope: "holding", teamId: h.teamId, holdingId: h.id, kind: "log", body: `Built the earnings prep pack for the ${e.reportDate} report: ${bulletCount(pack)} sourced bullets across ${pack.sections.filter((s) => s.key !== "not_retrieved").length} sections.`, meta: { earningsId: e.id }, model: def.modelId }).catch(() => {});
    return { ok: true, pack, dropped, steps: result.steps.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.update(earnings).set({ prepPackError: `attempt ${attempt}: ${error}`.slice(0, 1000) }).where(eq(earnings.id, e.id)).catch(() => {});
    return { ok: false, error };
  }
}

/** The inclusive ISO date window for the next N trading days, starting today. */
export function prepWindow(today = todayNY(), days = PREP_HORIZON_DAYS) {
  let to = today;
  for (let i = 0; i < days; i++) to = nextTradingDay(to);
  return { from: today, to };
}

/** Morning step: build packs for upcoming reports in the window, a few per run. */
export async function prepEarnings(opts: { limit?: number; force?: boolean; notify?: boolean } = {}) {
  const window = prepWindow();
  const rows = await db
    .select({ id: earnings.id, reportDate: earnings.reportDate, status: earnings.status, prepPackAt: earnings.prepPackAt, prepPackError: earnings.prepPackError, ticker: holdings.ticker })
    .from(earnings)
    .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
    .where(and(eq(holdings.status, "active"), gte(earnings.reportDate, window.from), lte(earnings.reportDate, window.to)));
  const picked = opts.force ? rows.filter((r) => r.status === "upcoming").slice(0, opts.limit ?? PREP_PER_RUN) : selectPrepCandidates(rows, window, opts.limit ?? PREP_PER_RUN);
  const built: string[] = [];
  const failed: Record<string, string> = {};
  for (const r of picked) {
    const res = await buildPrepPack(r.id, { notify: opts.notify });
    if (res.ok) built.push(r.ticker);
    else failed[r.ticker] = res.error;
  }
  return { window, candidates: rows.length, built, failed };
}
