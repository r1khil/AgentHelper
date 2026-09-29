// The durable record of Hoot's proposed changes (hoot_proposals, migration 0026). The live state is on the proposal in
// the chat (proposal-store.ts); this keeps who proposed, confirmed or cancelled what and how it went, even after the
// chat is deleted. An audit write never blocks the change it records: it runs in its own savepoint and only logs if it
// fails (before the migration is applied, for one).
import { sql } from "drizzle-orm";
import { hootProposals } from "@/db/schema";
import type { Db } from "@/lib/prices";
import type { HootProposal, ProposalOutcome } from "./proposals";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Writer = Db | Tx;

export type AuditStep = { status: "proposed" | ProposalOutcome["status"]; at: string; by: string | null; message?: string };

type AuditInput = { chatId: string | null; toolCallId: string; proposal: HootProposal; outcome?: ProposalOutcome | null };

/** What a proposal's row holds: the proposal and its current state. Pure, so the mapping is tested without a database. */
export function auditRow(input: AuditInput) {
  const { proposal: p } = input;
  const decided = input.outcome && input.outcome.status !== "expired" ? input.outcome : null;
  const result = decided && (decided.status === "done" || decided.status === "failed") ? { message: decided.message, ...(decided.detail ? { detail: decided.detail } : {}), ...(decided.href ? { href: decided.href } : {}) } : null;
  return {
    chatId: input.chatId,
    toolCallId: input.toolCallId,
    kind: p.kind,
    summary: p.summary,
    proposal: p as unknown as Record<string, unknown>,
    proposedBy: p.forUserId,
    expiresAt: new Date(p.expiresAt),
    status: decided?.status ?? "proposed",
    decidedBy: decided?.by ?? null,
    decidedAt: decided ? new Date(decided.at) : null,
    result,
  };
}

/** One entry in the row's history: the proposal itself, or a decision or result on it. */
export function auditStep(outcome: ProposalOutcome | null | undefined, proposal: HootProposal, now = new Date()): AuditStep {
  return outcome ? { status: outcome.status, at: outcome.at, by: outcome.by, message: outcome.message } : { status: "proposed", at: now.toISOString(), by: proposal.forUserId };
}

async function write(db: Writer, input: AuditInput) {
  const row = auditRow(input);
  const step = auditStep(input.outcome, input.proposal);
  await db
    .insert(hootProposals)
    .values({ ...row, history: [step] })
    .onConflictDoUpdate({
      target: [hootProposals.chatId, hootProposals.toolCallId],
      // The proposal itself never changes; its state and the trail do. A replayed "proposed" leaves the row as it was.
      set: input.outcome
        ? { status: row.status, decidedBy: row.decidedBy, decidedAt: row.decidedAt, result: row.result, history: sql`${hootProposals.history} || ${JSON.stringify([step])}::jsonb`, updatedAt: new Date() }
        : { updatedAt: sql`${hootProposals.updatedAt}` },
    });
}

/** Record a proposal as Hoot makes it, or a decision or result on it. Never throws. */
export async function auditProposal(db: Writer, input: AuditInput) {
  try {
    // A nested transaction is a savepoint: inside a caller's transaction a failure here rolls back only this write.
    await db.transaction(async (tx) => write(tx, input));
  } catch (e) {
    console.error("[hoot] proposal audit failed", input.toolCallId, e instanceof Error ? e.message : e);
  }
}
