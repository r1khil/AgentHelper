import "server-only";
import { generateText } from "ai";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weeklyRequests, weeklyUpdates } from "@/db/schema";
import { agentConfigured, chatModel } from "@/lib/agent/model";
import { summaryModelId } from "@/lib/drive/summarize";
import { stripQuotedReply } from "./inbound";
import { combineReplyItems, htmlToText, shouldHoldReplies } from "./merge";
import { fallbackItems, parseItemsJson, processUpdateInstructions } from "./parse";
import { getPack, listRequests, noteSource, normalizeAgenda } from "./store";
import type { AgendaItem } from "./types";

export type RecordReplyResult = { status: "ok" | "skipped"; reason?: string; items?: number; merged?: boolean };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Split the exec's reply into items. The model only parses; the fallback is one item per line. */
export async function parseProcessUpdates(text: string): Promise<{ items: AgendaItem[]; model: string | null; error: string | null }> {
  if (!text.trim()) return { items: [], model: null, error: null };
  if (!agentConfigured()) return { items: fallbackItems(text), model: null, error: "skipped: AI_GATEWAY_API_KEY is not set" };
  try {
    const model = await summaryModelId();
    const { text: reply } = await generateText({
      model: chatModel(model),
      instructions: processUpdateInstructions(),
      prompt: `EMAIL REPLY:\n\n${text.slice(0, 8000)}`,
      maxRetries: 2,
      maxOutputTokens: 800,
    });
    return { items: parseItemsJson(reply), model, error: null };
  } catch (e) {
    return { items: fallbackItems(text), model: null, error: message(e) };
  }
}

/**
 * Apply one inbound reply. The raw text is stored before any parsing is attempted, so a model
 * failure never loses what an exec wrote. Idempotent: the same Resend email id is applied once.
 */
export async function recordReply(input: { emailId: string; weekEnding: string; token: string }): Promise<RecordReplyResult> {
  const [request] = await db
    .select()
    .from(weeklyRequests)
    .where(and(eq(weeklyRequests.token, input.token), eq(weeklyRequests.weekEnding, input.weekEnding)))
    .limit(1);
  if (!request) return { status: "skipped", reason: "no request for that token" };
  if (request.replyEmailId === input.emailId) return { status: "skipped", reason: "already recorded" };

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.receiving.get(input.emailId);
  if (error || !data) throw new Error(error?.message ?? "Resend returned no email");

  const body = data.text ?? (data.html ? htmlToText(data.html) : "");
  const replyText = stripQuotedReply(body);
  await db
    .update(weeklyRequests)
    .set({ replyEmailId: input.emailId, replyFrom: data.from ?? null, replyText, repliedAt: new Date() })
    .where(eq(weeklyRequests.id, request.id));

  const parsed = await parseProcessUpdates(replyText);
  await db
    .update(weeklyRequests)
    .set({ parsedItems: parsed.items, parseModel: parsed.model, parseError: parsed.error })
    .where(eq(weeklyRequests.id, request.id));

  const merged = await mergeReplies(input.weekEnding);
  return { status: "ok", items: parsed.items.length, merged };
}

/**
 * Fold the replies into the pack's Process Updates — unless an exec has edited the pack since the
 * reply arrived, in which case the page shows a banner and the exec decides.
 */
export async function mergeReplies(weekEnding: string): Promise<boolean> {
  const pack = await getPack(weekEnding);
  if (!pack) return false;
  const requests = await listRequests(weekEnding);
  const replied = requests.filter((r) => r.repliedAt);
  if (!replied.length) return false;

  const newest = replied.reduce((max, r) => (r.repliedAt! > max ? r.repliedAt! : max), replied[0].repliedAt!);
  const hold = shouldHoldReplies(pack, newest);
  const agenda = normalizeAgenda(pack.agenda);
  if (hold) {
    await db
      .update(weeklyUpdates)
      .set({
        sources: noteSource(pack.sources ?? {}, "replies", {
          status: "held",
          detail: pack.status === "sent" ? "the pack is marked sent" : "a reply arrived after this pack was edited",
        }),
        updatedAt: new Date(),
      })
      .where(eq(weeklyUpdates.weekEnding, weekEnding));
    return false;
  }
  const processUpdates = combineReplyItems(replied);
  await db
    .update(weeklyUpdates)
    .set({
      agenda: { ...agenda, processUpdates },
      sources: noteSource(pack.sources ?? {}, "replies", { status: "ok", detail: `${replied.length} replies, ${processUpdates.length} items` }),
      updatedAt: new Date(),
    })
    .where(eq(weeklyUpdates.weekEnding, weekEnding));
  return true;
}

export { combineReplyItems, htmlToText } from "./merge";
