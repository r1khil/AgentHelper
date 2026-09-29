import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { chatMessages, hootProposals } from "@/db/schema";
import type { Db } from "@/lib/prices";
import { claimProposal, saveChatMessages, settleProposal } from "./proposal-store";
import { proposalsOf, type HootProposal, type ProposalOutcome } from "./proposals";
import { auditProposal, auditRow } from "./proposal-audit";

// An in-memory Postgres with the two tables a proposal lives in, and (unless `audit` is false, as in production before
// migration 0026) its audit table. Member ids are text here: the tests use readable ids, not uuids.
async function setup({ audit = true } = {}) {
  const pg = new PGlite();
  if (audit)
    await pg.exec(`
    CREATE TABLE hoot_proposals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid, tool_call_id text NOT NULL, kind text NOT NULL,
      summary text NOT NULL, proposal jsonb NOT NULL, proposed_by text, proposed_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'proposed', decided_by text, decided_at timestamptz,
      result jsonb, history jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT hoot_proposals_chat_call UNIQUE (chat_id, tool_call_id)
    );
  `);
  await pg.exec(`
    CREATE TABLE chats (id uuid PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE chat_messages (
      id text PRIMARY KEY, chat_id uuid NOT NULL REFERENCES chats(id), role text NOT NULL, parts jsonb NOT NULL,
      metadata jsonb, seq integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (chat_id, seq)
    );
    INSERT INTO chats (id) VALUES ('00000000-0000-4000-8000-000000000001');
  `);
  return drizzle(pg, { schema }) as unknown as Db;
}

const CHAT = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-29T15:00:00Z");
const proposal: HootProposal = {
  kind: "pin_chat",
  forUserId: "exec-1",
  summary: "Pin this conversation to META's research board (C&CS)",
  expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
  chatId: CHAT,
  ticker: "META",
  teamSlug: "consumer",
  teamName: "Consumer & Communication Services",
};
const question = { id: "u1", role: "user", parts: [{ type: "text", text: "pin this chat to META's board" }] };
const answer = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "tool-pin_chat", toolCallId: "call-1", state: "output-available", input: { ticker: "META" }, output: { data: { proposal, note: "Proposed, not done" }, sources: [] } },
    { type: "text", text: "The card below pins this chat to META's board once you confirm." },
  ],
};

async function outcome(db: Db): Promise<ProposalOutcome | null> {
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.chatId, CHAT)).orderBy(asc(chatMessages.seq));
  return rows.flatMap((r) => proposalsOf(r.parts as never[]))[0]?.outcome ?? null;
}

describe("Hoot proposal store", () => {
  let db: Db;
  beforeEach(async () => {
    db = await setup();
    await saveChatMessages(db, CHAT, [question, answer]);
  });

  it("claims a proposal once: a second Confirm (double click, another tab) is refused", async () => {
    const first = await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    expect(first).toMatchObject({ ok: true, proposal: { kind: "pin_chat", ticker: "META" }, outcome: { status: "pending" } });
    const second = await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    expect(second).toMatchObject({ ok: false, error: expect.stringMatching(/already being made/) });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "done", message: "Pinned.", at: NOW.toISOString(), by: "exec-1" } });
    expect((await outcome(db))?.status).toBe("done");
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "cancel", now: NOW })).toMatchObject({ ok: false, error: expect.stringMatching(/already made/) });
  });

  it("refuses a teammate who can see the chat but didn't ask", async () => {
    const r = await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "teammate", decision: "confirm", now: NOW });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Only the member who asked/) });
    expect(await outcome(db)).toBeNull();
  });

  it("refuses an expired proposal and one that isn't in the chat", async () => {
    const late = new Date(NOW.getTime() + 2 * 3600_000);
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: late })).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-9", userId: "exec-1", decision: "confirm", now: NOW })).toMatchObject({ ok: false });
    expect(await outcome(db)).toBeNull();
  });

  it("records a Cancel, which nothing can then confirm", async () => {
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "cancel", now: NOW })).toMatchObject({ ok: true, outcome: { status: "cancelled" } });
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW })).toMatchObject({ ok: false, error: expect.stringMatching(/cancelled/) });
  });

  it("keeps a Confirm when the turn saves its older copy of the messages afterwards", async () => {
    await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "done", message: "Pinned.", at: NOW.toISOString(), by: "exec-1" } });
    // The run's final save, and the next turn's saves, still hold the proposal without its outcome.
    await saveChatMessages(db, CHAT, [question, { ...answer, metadata: { ms: 1200 } }]);
    await saveChatMessages(db, CHAT, [question, answer, { id: "u2", role: "user", parts: [{ type: "text", text: "thanks" }] }]);
    expect((await outcome(db))?.status).toBe("done");
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW })).toMatchObject({ ok: false });
  });

  it("lets a failed change be confirmed again (nothing was written)", async () => {
    await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "failed", message: "META isn't an active holding.", at: NOW.toISOString(), by: "exec-1" } });
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW })).toMatchObject({ ok: true, outcome: { status: "pending" } });
  });
});

describe("Hoot proposal audit trail (hoot_proposals)", () => {
  const audited = async (db: Db) => db.select().from(hootProposals);

  it("records the proposal once, then each decision and result with the member who made it", async () => {
    const db = await setup();
    await saveChatMessages(db, CHAT, [question, answer]);
    await auditProposal(db, { chatId: CHAT, toolCallId: "call-1", proposal });
    await auditProposal(db, { chatId: CHAT, toolCallId: "call-1", proposal }); // a replayed tool call adds nothing
    expect(await audited(db)).toMatchObject([{ kind: "pin_chat", status: "proposed", proposedBy: "exec-1", summary: proposal.summary, history: [{ status: "proposed" }] }]);

    await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "failed", message: "META isn't an active holding.", at: NOW.toISOString(), by: "exec-1" } });
    await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "done", message: "Pinned.", href: "/t/consumer/agent/h/META", at: NOW.toISOString(), by: "exec-1" } });
    const [row] = await audited(db);
    expect(row).toMatchObject({ status: "done", decidedBy: "exec-1", result: { message: "Pinned.", href: "/t/consumer/agent/h/META" } });
    expect(row.history.map((h) => h.status)).toEqual(["proposed", "pending", "failed", "pending", "done"]);
  });

  it("starts the trail at the decision when the proposal wasn't recorded, and records a Cancel", async () => {
    const db = await setup();
    await saveChatMessages(db, CHAT, [question, answer]);
    await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "cancel", now: NOW });
    expect(await audited(db)).toMatchObject([{ status: "cancelled", decidedBy: "exec-1", result: null, history: [{ status: "cancelled", by: "exec-1" }] }]);
  });

  it("never blocks a Confirm when the table isn't there (before migration 0026 is applied)", async () => {
    const db = await setup({ audit: false });
    await saveChatMessages(db, CHAT, [question, answer]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claimProposal(db, { chatId: CHAT, toolCallId: "call-1", userId: "exec-1", decision: "confirm", now: NOW })).toMatchObject({ ok: true, outcome: { status: "pending" } });
    await settleProposal(db, { chatId: CHAT, toolCallId: "call-1", outcome: { status: "done", message: "Pinned.", at: NOW.toISOString(), by: "exec-1" } });
    expect((await outcome(db))?.status).toBe("done");
    expect(errors).toHaveBeenCalledWith("[hoot] proposal audit failed", "call-1", expect.any(String));
    errors.mockRestore();
  });

  it("maps an outcome to the row: expired is never stored, results only for done or failed", () => {
    expect(auditRow({ chatId: CHAT, toolCallId: "c", proposal, outcome: { status: "expired", message: "Expired.", at: NOW.toISOString(), by: "exec-1" } })).toMatchObject({ status: "proposed", decidedBy: null, result: null });
    expect(auditRow({ chatId: CHAT, toolCallId: "c", proposal, outcome: { status: "pending", message: "Making the change…", at: NOW.toISOString(), by: "exec-1" } })).toMatchObject({ status: "pending", decidedBy: "exec-1", result: null });
  });
});
