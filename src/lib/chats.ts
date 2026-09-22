import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, profiles } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";

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

export type HoldingChatStats = {
  holdingId: string;
  chats: number;
  /** Distinct source ids returned by tools across every chat on the holding. */
  sources: number;
  lastActivity: Date;
  /** Set while any chat on the holding is still answering: who asked and what. */
  running?: { authorName: string | null; title: string };
};

/** Research activity per holding, for the agent index cards. */
export async function listHoldingChatStats(teamId: TeamIds): Promise<Map<string, HoldingChatStats>> {
  const ids = Array.isArray(teamId) ? teamId : [teamId];
  if (ids.length === 0) return new Map();
  const [stats, live] = await Promise.all([
    db.execute<{ holding_id: string; chats: string; sources: string; last_activity: string }>(sql`
      select c.holding_id,
             count(distinct c.id) as chats,
             count(distinct s->>'id') as sources,
             max(c.updated_at) as last_activity
      from chats c
      left join chat_messages m on m.chat_id = c.id and m.role = 'assistant'
      left join lateral jsonb_array_elements(m.parts) p on true
      left join lateral jsonb_array_elements(
        case when jsonb_typeof(p->'output'->'sources') = 'array' then p->'output'->'sources' else '[]'::jsonb end
      ) s on true
      where c.team_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and c.holding_id is not null
      group by c.holding_id
    `),
    db
      .select({ c: chats, authorName: profiles.fullName })
      .from(chats)
      .leftJoin(profiles, eq(profiles.id, chats.createdBy))
      .where(and(inTeams(chats.teamId, teamId), eq(chats.runStatus, "running"))),
  ]);
  const map = new Map<string, HoldingChatStats>();
  for (const r of stats) {
    map.set(r.holding_id, { holdingId: r.holding_id, chats: Number(r.chats), sources: Number(r.sources), lastActivity: new Date(r.last_activity) });
  }
  for (const { c, authorName } of live) {
    if (!c.holdingId || effectiveRunStatus(c) !== "running") continue;
    const row = map.get(c.holdingId);
    if (row && !row.running) row.running = { authorName, title: c.title };
  }
  return map;
}

export type HoldingChat = { c: typeof chats.$inferSelect; authorName: string | null; questions: number };

/** Every chat pinned to one holding, newest first, with how many questions each holds. */
export async function listHoldingChats(holdingId: string): Promise<HoldingChat[]> {
  const rows = await db
    .select({
      c: chats,
      authorName: profiles.fullName,
      questions: sql<number>`(select count(*) from chat_messages m where m.chat_id = ${chats.id} and m.role = 'user')`,
    })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .where(eq(chats.holdingId, holdingId))
    .orderBy(desc(chats.updatedAt))
    .limit(100);
  return rows.map((r) => ({ ...r, questions: Number(r.questions) }));
}

export type GeneralChat = { c: typeof chats.$inferSelect; authorName: string | null; questions: number };

/**
 * Hoot conversations that aren't about one holding (asked from attribution, backtesting, Today…), newest first.
 * Chats that never got a question are left out: Hoot creates the chat before the first message is sent.
 */
export async function listGeneralChats(teamId: TeamIds, limit = 50): Promise<GeneralChat[]> {
  if (Array.isArray(teamId) && teamId.length === 0) return [];
  const questions = sql<number>`(select count(*) from chat_messages m where m.chat_id = ${chats.id} and m.role = 'user')`;
  const rows = await db
    .select({ c: chats, authorName: profiles.fullName, questions })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .where(and(inTeams(chats.teamId, teamId), isNull(chats.holdingId), sql`${questions} > 0`))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, questions: Number(r.questions) }));
}
