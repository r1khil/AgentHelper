import "server-only";
import { generateText } from "ai";
import { agentModelId, chatModel } from "@/lib/agent/model";
import type { DriveFileMeta } from "./index";
import { parseSummaryJson, summaryInput, summaryInstructions, type DocSummary } from "./summary";

/** A cheaper model can be set for summaries; by default they use the chat model. */
export function summaryModelId(): string {
  return process.env.OPENROUTER_SUMMARY_MODEL || agentModelId();
}

/** One model call per document version. The prompt forbids adding anything the document does not say. */
export async function summarizeDocument(meta: Pick<DriveFileMeta, "name" | "kind" | "ticker" | "modifiedTime">, text: string): Promise<{ summary: DocSummary; model: string }> {
  const model = summaryModelId();
  const instructions = summaryInstructions({ name: meta.name, kind: meta.kind, ticker: meta.ticker, modifiedTime: meta.modifiedTime ? meta.modifiedTime.toISOString().slice(0, 10) : null });
  const { text: reply } = await generateText({ model: chatModel(model), instructions, prompt: `DOCUMENT TEXT:\n\n${summaryInput(text)}`, maxRetries: 2, maxOutputTokens: 1500 });
  return { summary: parseSummaryJson(reply), model };
}
