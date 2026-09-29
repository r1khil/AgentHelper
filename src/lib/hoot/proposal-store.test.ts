import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { chatMessages } from "@/db/schema";
import type { Db } from "@/lib/prices";
import { claimProposal, saveChatMessages, settleProposal } from "./proposal-store";
import { proposalsOf, type HootProposal, type ProposalOutcome } from "./proposals";

// An in-memory Postgres with the two tables a proposal lives in.
async function setup() {
  const pg = new PGlite();
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
