"use server";

import { db } from "@/db/client";
import { canOpenChat, isFundWide, requireUser, type CurrentUser } from "@/lib/auth";
import { getChat } from "@/lib/chats";
import { claimProposal, settleProposal } from "@/lib/hoot/proposal-store";
import { cleanNoteBody, type HootProposal, type ProposalOutcome } from "@/lib/hoot/proposals";
import { pinChatToHolding } from "./chats";
import { addHoldingNote } from "./holdings";
import { dismissHootNudge } from "./preferences";
import { recordPastedTradeTickets } from "./tickets";

export type ProposalDecision = { ok: true; outcome: ProposalOutcome } | { ok: false; error: string; outcome?: ProposalOutcome | null };

type Applied = { ok: true; message: string; detail?: string; href?: string } | { ok: false; error: string };

/**
 * The member's Confirm or Cancel on one of Hoot's proposed changes. Confirm runs the same server action the page's own
 * control runs, so that action's permission checks apply exactly as if they had clicked it there; nothing is taken from
 * the browser but the decision and, for a note, the text the member edited in the card. The decision is saved on the
 * proposal before the change runs, so it is made at most once, and a reopened chat shows how it went.
 */
export async function decideHootProposal(input: { chatId: string; toolCallId: string; decision: "confirm" | "cancel"; noteBody?: string }): Promise<ProposalDecision> {
  const user = await requireUser();
  const { chatId, toolCallId, decision } = input ?? {};
  if (typeof chatId !== "string" || typeof toolCallId !== "string" || !toolCallId || toolCallId.length > 200 || (decision !== "confirm" && decision !== "cancel")) {
    return { ok: false, error: "That isn't a change Hoot proposed." };
  }
  // The member's own edit of a note, checked like the note Hoot proposed; ignored for every other change.
  let noteBody: string | undefined;
  if (decision === "confirm" && input.noteBody !== undefined) {
    const cleaned = cleanNoteBody(input.noteBody);
    if ("error" in cleaned) return { ok: false, error: cleaned.error };
    noteBody = cleaned.body;
  }
  const chat = await getChat(chatId).catch(() => null);
  if (!chat || !canOpenChat(user, chat)) return { ok: false, error: "That conversation isn't available to you." };

  const claim = await claimProposal(db, { chatId, toolCallId, userId: user.id, decision });
  if (!claim.ok) return claim;
  if (decision === "cancel") return { ok: true, outcome: claim.outcome };

  let applied: Applied;
  try {
    applied = await apply(claim.proposal, { user, chatId, noteBody });
  } catch (e) {
    console.error("[hoot] confirmed change failed", e);
    applied = { ok: false, error: "Something went wrong, and nothing was changed. Try again." };
  }
  const at = new Date().toISOString();
  const outcome: ProposalOutcome = applied.ok
    ? { status: "done", message: applied.message, ...(applied.detail ? { detail: applied.detail } : {}), ...(applied.href ? { href: applied.href } : {}), at, by: user.id }
    : { status: "failed", message: applied.error, at, by: user.id };
  await settleProposal(db, { chatId, toolCallId, outcome });
  return applied.ok ? { ok: true, outcome } : { ok: false, error: applied.error, outcome };
}

async function apply(p: HootProposal, ctx: { user: CurrentUser; chatId: string; noteBody?: string }): Promise<Applied> {
  switch (p.kind) {
    case "add_note": {
      const body = ctx.noteBody ?? p.body;
      const r = await addHoldingNote({ holdingId: p.holdingId, body });
      return r.ok ? { ok: true, message: r.message ?? `Note added to ${p.ticker}.`, ...(body !== p.body ? { detail: body } : {}) } : r;
    }
    case "pin_chat": {
      if (p.chatId !== ctx.chatId) return { ok: false, error: "That change is for another conversation." };
      const r = await pinChatToHolding({ chatId: p.chatId, ticker: p.ticker, teamSlug: p.teamSlug });
      return "error" in r ? { ok: false, error: r.error } : { ok: true, message: `Pinned to ${p.ticker}. It's on the holding's Threads tab.`, href: r.href };
    }
    case "dismiss_nudge": {
      const r = await dismissHootNudge(p.nudgeId);
      return r.ok ? { ok: true, message: `Dismissed “${p.title}”.` } : r;
    }
    case "record_trades_from_ticket": {
      // The action itself redirects anyone else away; say why here instead.
      if (!isFundWide(ctx.user)) return { ok: false, error: "Only execs and admins can record trades." };
      const r = await recordPastedTradeTickets(p.tickets);
      return r.ok ? { ok: true, message: r.message ?? "Recorded." } : r;
    }
  }
}
