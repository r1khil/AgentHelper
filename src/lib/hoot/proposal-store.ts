// Where the outcome of a Hoot proposal is kept: on its own tool part in the saved chat. Every write here and every
// save of the chat's messages (saveMessages) takes the chat's row lock first, so a Confirm clicked while an answer is
// still streaming, or during a later turn, is never overwritten by the turn's older copy of the messages.
import { and, eq, sql } from "drizzle-orm";
import { chatMessages, chats } from "@/db/schema";
import type { Db } from "@/lib/prices";
import { auditProposal } from "./proposal-audit";
import { canDecide, carryOutcomes, outcomesOf, proposalsOf, withOutcome, type HootProposal, type ProposalOutcome } from "./proposals";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Hold the chat's row until the transaction ends. */
export async function lockChat(tx: Tx, chatId: string) {
  await tx.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).for("update");
}

const holding = (json: unknown) => sql`${chatMessages.parts} @> ${JSON.stringify(json)}::jsonb`;

/** Outcomes already saved on this chat's proposals, by tool call. Inside a transaction that holds the chat lock. */
export async function savedOutcomes(tx: Tx, chatId: string): Promise<Map<string, ProposalOutcome>> {
  const rows = await tx
    .select({ parts: chatMessages.parts })
    .from(chatMessages)
    .where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.role, "assistant"), holding([{ output: { data: { outcome: {} } } }])));
  const out = new Map<string, ProposalOutcome>();
  for (const r of rows) for (const [id, o] of outcomesOf(r.parts as never[])) out.set(id, o);
  return out;
}

async function findProposal(tx: Tx, chatId: string, toolCallId: string) {
  const [row] = await tx
    .select({ id: chatMessages.id, parts: chatMessages.parts })
    .from(chatMessages)
    .where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.role, "assistant"), holding([{ toolCallId }])))
    .limit(1);
  const found = row ? proposalsOf(row.parts as never[]).find((p) => p.toolCallId === toolCallId) : undefined;
  return row && found ? { row, ...found } : null;
}

export type Claim = { ok: true; proposal: HootProposal; outcome: ProposalOutcome } | { ok: false; error: string; outcome?: ProposalOutcome | null };

/**
 * Record a member's decision on a proposal before anything runs: "cancelled", or "pending" while the change is made.
 * Refuses a proposal made for someone else (chats are visible to the whole team), one that expired, and one already
 * decided, so a double click, a second tab or a reopened chat can never make the same change twice.
 */
export async function claimProposal(db: Db, input: { chatId: string; toolCallId: string; userId: string; decision: "confirm" | "cancel"; now?: Date }): Promise<Claim> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockChat(tx, input.chatId);
    const found = await findProposal(tx, input.chatId, input.toolCallId);
    if (!found) return { ok: false, error: "That change isn't in this conversation yet. Try again in a moment." };
    if (found.proposal.forUserId !== input.userId) return { ok: false, error: "Only the member who asked Hoot can confirm or cancel this." };
    const allowed = canDecide(found.proposal, found.outcome, now.getTime());
    if (!allowed.ok) return { ok: false, error: allowed.error, outcome: found.outcome };
    const outcome: ProposalOutcome =
      input.decision === "cancel"
        ? { status: "cancelled", message: "Cancelled. Nothing was changed.", at: now.toISOString(), by: input.userId }
        : { status: "pending", message: "Making the change…", at: now.toISOString(), by: input.userId };
    await tx.update(chatMessages).set({ parts: withOutcome(found.row.parts as never[], input.toolCallId, outcome)! }).where(eq(chatMessages.id, found.row.id));
    await auditProposal(tx, { chatId: input.chatId, toolCallId: input.toolCallId, proposal: found.proposal, outcome });
    return { ok: true, proposal: found.proposal, outcome };
  });
}

type SavedMessage = { id: string; role: string; parts: unknown[]; metadata?: unknown };

/**
 * Save a chat's messages in order (lib/chats.ts saveMessages). When they carry proposals, the chat lock is taken first
 * and outcomes already saved win over this copy's.
 */
export async function saveChatMessages(db: Db, chatId: string, messages: SavedMessage[]) {
  if (!messages.length) return;
  await db.transaction(async (tx) => {
    let rows = messages;
    if (messages.some((m) => proposalsOf(m.parts as never[]).length)) {
      await lockChat(tx, chatId);
      rows = carryOutcomes(messages as (SavedMessage & { parts: never[] })[], await savedOutcomes(tx, chatId));
    }
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      const metadata = (m.metadata as Record<string, unknown> | undefined) ?? null;
      await tx
        .insert(chatMessages)
        .values({ id: m.id, chatId, role: m.role, parts: m.parts, metadata, seq: i })
        .onConflictDoUpdate({ target: chatMessages.id, set: { parts: m.parts, metadata, seq: i } });
    }
    await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
  });
}

/** Record how a confirmed change went ("done" or "failed"). */
export async function settleProposal(db: Db, input: { chatId: string; toolCallId: string; outcome: ProposalOutcome }) {
  await db.transaction(async (tx) => {
    await lockChat(tx, input.chatId);
    const found = await findProposal(tx, input.chatId, input.toolCallId);
    if (!found) return;
    await tx.update(chatMessages).set({ parts: withOutcome(found.row.parts as never[], input.toolCallId, input.outcome)! }).where(eq(chatMessages.id, found.row.id));
    await auditProposal(tx, { chatId: input.chatId, toolCallId: input.toolCallId, proposal: found.proposal, outcome: input.outcome });
  });
}
