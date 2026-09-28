import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, profiles, teams } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";
import { LEGACY_CALL_PROMPT } from "@/lib/agent/hidden-prompt";

/** Who is listing chats: members who aren't execs or admins never see fund-only chats (those that read the PT sheet). */
export type ChatViewer = { fundWide: boolean };

const visibleTo = (viewer: ChatViewer): SQL | undefined => (viewer.fundWide ? undefined : eq(chats.fundOnly, false));

/** Questions a member asked: user messages less a job's hidden prompt (the SQL twin of `isMemberQuestion`). */
const questionCount = sql<number>`(select count(*) from chat_messages m where m.chat_id = ${chats.id} and m.role = 'user'
  and m.metadata->'hiddenPrompt' is null and coalesce(m.parts->0->>'text', '') !~ ${LEGACY_CALL_PROMPT})`;
const hasMessages = sql`exists (select 1 from chat_messages m where m.chat_id = ${chats.id})`;

/** Mark a chat fund-only. Called by Hoot's PT sheet tool before it returns anything; it never goes back. */
export async function markChatFundOnly(chatId: string) {
  await db.update(chats).set({ fundOnly: true }).where(eq(chats.id, chatId));
}

export async function listChats(teamId: string, viewer: ChatViewer) {
  return db
    .select({ c: chats, authorName: profiles.fullName, ticker: holdings.ticker })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .leftJoin(holdings, eq(holdings.id, chats.holdingId))
    .where(and(eq(chats.teamId, teamId), visibleTo(viewer)))
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
export async function listHoldingChatStats(teamId: TeamIds, viewer: ChatViewer): Promise<Map<string, HoldingChatStats>> {
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
      where c.team_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and c.holding_id is not null${viewer.fundWide ? sql`` : sql` and not c.fund_only`}
      group by c.holding_id
    `),
    db
      .select({ c: chats, authorName: profiles.fullName })
      .from(chats)
      .leftJoin(profiles, eq(profiles.id, chats.createdBy))
      .where(and(inTeams(chats.teamId, teamId), eq(chats.runStatus, "running"), visibleTo(viewer))),
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
export async function listHoldingChats(holdingId: string, viewer: ChatViewer): Promise<HoldingChat[]> {
  const rows = await db
    .select({ c: chats, authorName: profiles.fullName, questions: questionCount })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .where(and(eq(chats.holdingId, holdingId), visibleTo(viewer)))
    .orderBy(desc(chats.updatedAt))
    .limit(100);
  return rows.map((r) => ({ ...r, questions: Number(r.questions) }));
}

export type GeneralChat = { c: typeof chats.$inferSelect; authorName: string | null; questions: number };

/**
 * Hoot conversations that aren't about one holding (asked from attribution, backtesting, Today…), newest first.
 * Empty chats are left out: Hoot creates the chat before the first message is sent. A call brief counts, question or not.
 */
export async function listGeneralChats(teamId: TeamIds, viewer: ChatViewer, limit = 50): Promise<GeneralChat[]> {
  if (Array.isArray(teamId) && teamId.length === 0) return [];
  const rows = await db
    .select({ c: chats, authorName: profiles.fullName, questions: questionCount })
    .from(chats)
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .where(and(inTeams(chats.teamId, teamId), isNull(chats.holdingId), hasMessages, visibleTo(viewer)))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, questions: Number(r.questions) }));
}

export type RecentHoldingChat = { c: typeof chats.$inferSelect; authorName: string | null; questions: number; ticker: string; teamSlug: string };

/**
 * Chats pinned to holdings across the given teams, newest first, for the Research sidebar. Like the general list,
 * empty chats are left out.
 */
export async function listRecentHoldingChats(teamId: TeamIds, viewer: ChatViewer, limit = 60): Promise<RecentHoldingChat[]> {
  if (Array.isArray(teamId) && teamId.length === 0) return [];
  const rows = await db
    .select({ c: chats, authorName: profiles.fullName, questions: questionCount, ticker: holdings.ticker, teamSlug: teams.slug })
    .from(chats)
    .innerJoin(holdings, eq(holdings.id, chats.holdingId))
    .innerJoin(teams, eq(teams.id, chats.teamId))
    .leftJoin(profiles, eq(profiles.id, chats.createdBy))
    .where(and(inTeams(chats.teamId, teamId), hasMessages, visibleTo(viewer)))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, questions: Number(r.questions) }));
}
