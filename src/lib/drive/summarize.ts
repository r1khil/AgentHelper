import "server-only";
import { generateText } from "ai";
import { agentModelId, chatModel } from "@/lib/agent/model";
import type { DriveFileMeta } from "./index";
import { parseSummaryJson, summaryInput, summaryInstructions, type DocSummary } from "./summary";

/** A cheaper model can be set for summaries; by default they use the chat model. */
export async function summaryModelId(): Promise<string> {
  return process.env.SUMMARY_MODEL || (await agentModelId());
}

/**
 * One model call per document version. The prompt forbids adding anything the document does not say. Throws when
 * the reply is cut off or holds no summary, so the ingest job records summary_error and retries later.
 */
export async function summarizeDocument(meta: Pick<DriveFileMeta, "name" | "kind" | "ticker" | "modifiedTime">, text: string): Promise<{ summary: DocSummary; model: string }> {
  const model = await summaryModelId();
  const instructions = summaryInstructions({ name: meta.name, kind: meta.kind, ticker: meta.ticker, modifiedTime: meta.modifiedTime ? meta.modifiedTime.toISOString().slice(0, 10) : null });
  // Reasoning tokens count toward the cap: Ling spends 600-1700 thinking before a JSON of up to ~1700. At 1500, most replies were cut off.
  const { text: reply, finishReason, usage } = await generateText({ model: chatModel(model), instructions, prompt: `DOCUMENT TEXT:\n\n${summaryInput(text)}`, maxRetries: 2, maxOutputTokens: 8000 });
  // A cut-off reply could be repaired into valid JSON, but it would silently drop the fields after the cut.
  const summary = finishReason === "length" ? null : parseSummaryJson(reply);
  if (!summary) {
    const tokens = `${usage.outputTokens ?? "?"} output tokens, ${usage.outputTokenDetails?.reasoningTokens ?? "?"} reasoning`;
    console.error(`[summary] ${meta.name}: no parseable summary (${model}, finish ${finishReason}, ${tokens}):`, reply.replace(/\s+/g, " ").slice(0, 400));
    throw new Error(`The summary reply was not parseable (finish ${finishReason})`);
  }
  return { summary, model };
}
