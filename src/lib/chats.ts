import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, profiles } from "@/db/schema";

export async function listChats(teamId: string) {
  return db
    .select({ c: chats, authorName: profiles.fullName, ticker: holdings.ticker })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .leftJoin(holdings, eq(holdings.id, chats.holdingId))
    .where(eq(chats.teamId, teamId))
    .orderBy(desc(chats.updatedAt))
    .limit(100);
}

export async function getChat(chatId: string) {
  const [c] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  return c ?? null;
}

export async function loadMessages(chatId: string): Promise<UIMessage[]> {
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(asc(chatMessages.seq));
  return rows.map((r) => ({ id: r.id, role: r.role as UIMessage["role"], parts: r.parts as UIMessage["parts"], metadata: r.metadata ?? undefined }));
}

export async function saveMessages(chatId: string, messages: UIMessage[]) {
  if (!messages.length) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      await tx
        .insert(chatMessages)
        .values({ id: m.id, chatId, role: m.role, parts: m.parts as unknown[], metadata: (m.metadata as Record<string, unknown> | undefined) ?? null, seq: i })
        .onConflictDoUpdate({ target: chatMessages.id, set: { parts: m.parts as unknown[], metadata: (m.metadata as Record<string, unknown> | undefined) ?? null, seq: i } });
    }
    await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
  });
}

export type RunStatus = "idle" | "running" | "error";

/** A run older than this is treated as dead (the function was killed before it could clear the flag). */
export const RUN_STALE_MS = 300_000;

export function effectiveRunStatus(chat: { runStatus: string; runStartedAt: Date | null }, now = Date.now()): RunStatus {
  if (chat.runStatus === "running") {
    const started = chat.runStartedAt?.getTime() ?? 0;
    return now - started < RUN_STALE_MS ? "running" : "error";
  }
  return chat.runStatus === "error" ? "error" : "idle";
}

export async function setRunStatus(chatId: string, status: RunStatus) {
  await db
    .update(chats)
    .set({ runStatus: status, runStartedAt: status === "running" ? new Date() : null })
    .where(eq(chats.id, chatId));
}

export async function maybeTitleChat(chatId: string, firstUserText: string) {
  const title = firstUserText.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!title) return;
  await db.update(chats).set({ title }).where(sql`${chats.id} = ${chatId} and ${chats.title} = 'New chat'`);
}
