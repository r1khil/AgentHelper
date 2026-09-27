import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";

/**
 * What keeps the price target sheet's numbers where they belong once Hoot has read them: which model may see them,
 * and how to tell that a chat or a source came from the sheet (so memory and email leave it out).
 */

export const PT_SHEET_TOOL = "read_pt_sheet";
export const PT_SHEET_SOURCE_PREFIX = "ptsheet";

/**
 * The only model that may receive sheet data: Rikhil confirmed on 2026-09-26 that this route is zero-data-retention.
 * The fallbacks (DeepSeek, Nemotron) are not confirmed, so a turn that has the sheet in context never falls back.
 */
export const PT_SHEET_MODEL_ID = "inclusionai/ling-3.0-flash-fin:free";

export const PT_SHEET_MODEL_UNAVAILABLE =
  "Hoot's sheet-safe model is unavailable right now, so it can't answer from the price target sheet. Try again in a few minutes.";

/** True when any message in the conversation holds a PT sheet tool call or result. */
export function usesPtSheet(messages: Pick<UIMessage, "parts">[]): boolean {
  return messages.some((m) => m.parts.some((p) => p.type === `tool-${PT_SHEET_TOOL}` || (p.type === "dynamic-tool" && "toolName" in p && p.toolName === PT_SHEET_TOOL)));
}

export function isPtSheetSource(s: Pick<Source, "id">): boolean {
  return s.id.startsWith(`${PT_SHEET_SOURCE_PREFIX}-`);
}

/**
 * A model that behaves like `base` until `pinned()` turns true (the sheet was read in this turn or earlier in the chat),
 * then sends every call to `safe` only. A failure on `safe` is never retried on another model.
 */
export function sheetSafeModel(base: LanguageModelV4, safe: () => LanguageModelV4, pinned: () => boolean): LanguageModelV4 {
  const unavailable = (e: unknown): never => {
    console.error("[agent] sheet-safe model failed", e);
    throw new Error(PT_SHEET_MODEL_UNAVAILABLE, { cause: e });
  };
  return {
    specificationVersion: "v4",
    get provider() {
      return pinned() ? safe().provider : base.provider;
    },
    get modelId() {
      return pinned() ? safe().modelId : base.modelId;
    },
    get supportedUrls() {
      return pinned() ? safe().supportedUrls : base.supportedUrls;
    },
    doGenerate: (options) => (pinned() ? safe().doGenerate(options).then((r) => r, unavailable) : base.doGenerate(options)),
    doStream: (options) => (pinned() ? safe().doStream(options).then((r) => r, unavailable) : base.doStream(options)),
  };
}
