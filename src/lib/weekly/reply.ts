import "server-only";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { db } from "@/db/client";
import { jobRuns, weeklyUpdates } from "@/db/schema";
import { agentConfigured, chatModel } from "@/lib/agent/model";
import { PT_SHEET_MODEL_ID } from "@/lib/agent/pt-sheet-guard";
import { bareAddress, newReplyText, type InboundEvent } from "@/lib/email/inbound";
import { downloadOpenMail } from "@/lib/email/ticket-intake";
import { verifyFundSender } from "@/lib/email/verify";
import { applyEdits, editInstructions, editReplyText, packForPrompt, parseEditPlan, weekFromReplySubject } from "./reply-edits";
import { getPack, normalizeAgenda, packFigures } from "./store";

/**
 * A reply in the thread of the Sunday weekly email is an edit request for that week's pack, not a question for Hoot's
 * research agent: the thread quotes PT sheet numbers, which only the sheet-safe model (Ling) may see, while the research
 * agent can fall back to other models. So these replies stay here, on Ling, and never reach the general answer flow.
 */

const JOB = "weekly_reply";
const OPENMAIL_API = "https://api.openmail.sh";

export type WeeklyReplyResult = {
  eventId: string;
  messageId: string;
  threadId: string;
  from: string;
  status: "edited" | "no_change" | "refused" | "failed";
  weekEnding: string;
  reason?: string;
  applied?: string[];
  skipped?: string[];
};

type Sender = { name: string; address: string; profileId: string | null; role: string };

/** Whether the thread holds the week's Sunday email (by the OpenMail message id recorded when it was sent). */
async function threadHasMessage(threadId: string, messageId: string): Promise<boolean> {
  const key = process.env.OPENMAIL_API_KEY;
  if (!key) return false;
  const res = await fetch(`${OPENMAIL_API}/v1/threads/${encodeURIComponent(threadId)}/messages`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return false;
  const { data } = (await res.json()) as { data?: { id: string }[] };
  return (data ?? []).some((m) => m.id === messageId);
}

/** The pack a message replies to, or null when it isn't a reply to a Sunday weekly email. */
export async function weeklyReplyTarget(ev: InboundEvent): Promise<string | null> {
  const week = weekFromReplySubject(ev.message.subject);
  if (!week) return null;
  const sent = (await getPack(week))?.sources?.email;
  if (sent?.status !== "ok") return null;
  // Emails sent before the message id was recorded match by subject; the role and DKIM checks still apply to any edit.
  if (!sent.messageId) return week;
  return (await threadHasMessage(ev.thread_id, sent.messageId)) ? week : null;
}

const refusal = (name: string, why: string) => [`Hi ${name},`, "", why, "", "Best,", "Hoot"].join("\n");

export async function handleWeeklyReply(opts: {
  ev: InboundEvent;
  weekEnding: string;
  sender: Sender;
  reply: (text: string) => Promise<void>;
  dryRun?: boolean;
}): Promise<WeeklyReplyResult> {
  const { ev, weekEnding, sender, reply } = opts;
  const base = { eventId: ev.event_id, messageId: ev.message.id, threadId: ev.thread_id, from: bareAddress(ev.message.from), weekEnding };
  const [jobRow] = opts.dryRun ? [] : await db.insert(jobRuns).values({ job: JOB, summary: { ...base, status: "running" } }).returning({ id: jobRuns.id });
  const finish = async (r: WeeklyReplyResult) => {
    if (jobRow) await db.update(jobRuns).set({ finishedAt: new Date(), ok: r.status !== "failed", summary: r as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    return r;
  };

  if (sender.role !== "exec" && sender.role !== "admin") {
    await reply(refusal(sender.name, "Only execs and admins can change the weekly pack by email."));
    return finish({ ...base, status: "refused", reason: `role ${sender.role}` });
  }
  if (!sender.profileId) {
    await reply(refusal(sender.name, "Sign in to The Owl's Nest once, then reply again and I'll make the changes."));
    return finish({ ...base, status: "refused", reason: "no profile yet" });
  }
  // As with trade tickets, the From address alone proves nothing; a theowlfund.com DKIM signature does.
  if (!opts.dryRun) {
    const raw = await downloadOpenMail(ev.message.raw_url);
    const check = raw ? await verifyFundSender(raw, ev.message.from) : ({ ok: false, reason: "the original message could not be downloaded" } as const);
    if (!check.ok) {
      await reply(refusal(sender.name, "I couldn't confirm this email came from your theowlfund.com account, so I didn't change the pack. Please make the change on the Weekly page."));
      return finish({ ...base, status: "refused", reason: `unverified sender: ${check.reason}` });
    }
  }

  const pack = await getPack(weekEnding);
  if (!pack) return finish({ ...base, status: "failed", reason: "the pack is gone" });
  if (pack.status === "sent") {
    await reply(refusal(sender.name, "This week's pack is marked sent, so I left it as it is. Reopen it on the Weekly page if it needs changes."));
    return finish({ ...base, status: "refused", reason: "pack marked sent" });
  }
  const text = newReplyText(ev.message.body_text ?? "");
  if (!text) return finish({ ...base, status: "no_change", reason: "empty reply" });
  if (!agentConfigured()) return finish({ ...base, status: "failed", reason: "the agent is not configured" });

  const agenda = normalizeAgenda(pack.agenda);
  const figures = packFigures(pack);
  let plan;
  try {
    // Sheet numbers are in the prompt, so this runs on the sheet-safe model only, with no fallback.
    const r = await generateText({
      model: chatModel(PT_SHEET_MODEL_ID),
      instructions: editInstructions(),
      prompt: `THE PACK NOW:\n\n${packForPrompt(agenda, figures)}\n\nTHE EMAIL:\n\n${text.slice(0, 6000)}`,
      // Ling's reasoning counts against this; a small budget has cut its answers off before.
      maxOutputTokens: 4000,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(90_000),
    });
    plan = parseEditPlan(r.text);
  } catch (e) {
    await reply(refusal(sender.name, "I couldn't read the changes from your email just now. Please make them on the Weekly page, or reply again in a few minutes."));
    return finish({ ...base, status: "failed", reason: e instanceof Error ? e.message : String(e) });
  }

  if (!plan.isEditRequest) {
    // A thank-you gets no reply. A question gets pointed to the app, where the sheet-safe model is enforced end to end.
    if (!text.includes("?")) return finish({ ...base, status: "no_change", reason: "not an edit request" });
    await reply(refusal(sender.name, "Replies here change this week's pack (for example \"drop Wholesale Trade, add ORCL on Tuesday\"). For questions, ask me in The Owl's Nest or start a new email."));
    return finish({ ...base, status: "no_change", reason: "a question, pointed to the app" });
  }

  const result = applyEdits(agenda, figures, plan.edits);
  if (result.applied.length && !opts.dryRun) {
    const now = new Date();
    await db
      .update(weeklyUpdates)
      .set({ agenda: result.agenda, figures: result.figures, editedAt: now, editedBy: sender.profileId, updatedAt: now })
      .where(eq(weeklyUpdates.weekEnding, weekEnding));
  }
  await reply(editReplyText({ name: sender.name, result, unhandled: plan.unhandled }));
  return finish({ ...base, status: result.applied.length ? "edited" : "no_change", applied: result.applied, skipped: [...result.skipped, ...plan.unhandled] });
}
