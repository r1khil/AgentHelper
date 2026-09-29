import "server-only";
import { generateText } from "ai";
import { agentModelId, chatModel } from "@/lib/agent/model";
import type { DriveFileMeta } from "./index";
import { parseSummaryJson, summaryInput, summaryInstructions, type DocSummary } from "./summary";

/** A cheaper model can be set for summaries; by default they use the chat model. */
export async function summaryModelId(): Promise<string> {
  return process.env.OPENROUTER_SUMMARY_MODEL || (await agentModelId());
}

/**
 * Drive summaries run on free models (Rikhil, 2026-09-29) because on Luna they were most of the daily OpenRouter
 * spend. North first; Laguna when North is rate-limited or cut off, and Laguna's upstream is often rate-limited.
 * OPENROUTER_DRIVE_SUMMARY_MODEL overrides the list with a single model.
 */
export const DRIVE_SUMMARY_MODELS = ["cohere/north-mini-code:free", "poolside/laguna-xs-2.1:free"];

/**
 * One model call per document version. The prompt forbids adding anything the document does not say. Throws when
 * the reply is cut off or holds no summary, so the ingest job records summary_error and retries later.
 */
export async function summarizeDocument(meta: Pick<DriveFileMeta, "name" | "kind" | "ticker" | "modifiedTime">, text: string): Promise<{ summary: DocSummary; model: string }> {
  const models = process.env.OPENROUTER_DRIVE_SUMMARY_MODEL ? [process.env.OPENROUTER_DRIVE_SUMMARY_MODEL] : DRIVE_SUMMARY_MODELS;
  let lastError: unknown;
  for (const model of models) {
    try {
      return await summarizeWith(model, meta, text);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function summarizeWith(model: string, meta: Pick<DriveFileMeta, "name" | "kind" | "ticker" | "modifiedTime">, text: string): Promise<{ summary: DocSummary; model: string }> {
  const instructions = summaryInstructions({ name: meta.name, kind: meta.kind, ticker: meta.ticker, modifiedTime: meta.modifiedTime ? meta.modifiedTime.toISOString().slice(0, 10) : null });
  // Reasoning tokens count toward the cap: Ling spends 600-1700 thinking before a JSON of up to ~1700. At 1500, most replies were cut off.
  const { text: reply, finishReason, usage } = await generateText({ model: chatModel(model), instructions, prompt: `DOCUMENT TEXT:\n\n${summaryInput(text)}`, maxRetries: 2, maxOutputTokens: 8000, providerOptions: { openrouter: { reasoning: { effort: "low" } } } });
  // A cut-off reply could be repaired into valid JSON, but it would silently drop the fields after the cut.
  const summary = finishReason === "length" ? null : parseSummaryJson(reply);
  if (!summary) {
    const tokens = `${usage.outputTokens ?? "?"} output tokens, ${usage.outputTokenDetails?.reasoningTokens ?? "?"} reasoning`;
    console.error(`[summary] ${meta.name}: no parseable summary (${model}, finish ${finishReason}, ${tokens}):`, reply.replace(/\s+/g, " ").slice(0, 400));
    throw new Error(`The summary reply was not parseable (finish ${finishReason})`);
  }
  return { summary, model };
}
