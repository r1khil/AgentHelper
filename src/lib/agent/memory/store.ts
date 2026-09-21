import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agentMemories, type AgentMemory, type MemoryKind, type MemoryMeta, type MemoryScope } from "@/db/schema";
import type { Source } from "@/lib/providers/types";
import { embeddingConfigured, embedTexts } from "@/lib/agent/embeddings";
import type { MemoryEntry } from "./prompt";

/** Cosine similarity above which a new fact is treated as a repeat of an existing one. */
export const DUPLICATE_SIMILARITY = 0.92;
/** Market-related facts expire after this many days unless a later turn re-confirms them. */
export const MARKET_FACT_TTL_DAYS = 120;

export type NewMemory = {
  scope: MemoryScope;
  teamId: string | null;
  holdingId: string | null;
  kind: MemoryKind;
  body: string;
  sources?: Source[];
  meta?: MemoryMeta;
  sourceChatId?: string | null;
  evidenceAt?: Date | null;
  expiresAt?: Date | null;
  createdBy?: string;
  model?: string | null;
};

export function toEntry(r: AgentMemory): MemoryEntry {
  return {
    id: r.id,
    kind: r.kind,
    scope: r.scope,
    body: r.body,
    sources: Array.isArray(r.sources) ? r.sources : [],
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
    evidenceAt: r.evidenceAt?.toISOString() ?? null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

async function embedOrNull(text: string): Promise<number[] | null> {
  if (!embeddingConfigured()) return null;
  try {
    const [v] = await embedTexts([text.slice(0, 4000)]);
    return v ?? null;
  } catch (e) {
    console.error("[memory] embedding failed", e);
    return null;
  }
}

function mergeSources(a: Source[], b: Source[]) {
  const seen = new Set(a.map((s) => s.id));
  return [...a, ...b.filter((s) => !seen.has(s.id))];
}

const scopeCondition = (scope: MemoryScope, teamId: string | null, holdingId: string | null) =>
  scope === "fund" ? eq(agentMemories.scope, "fund") : scope === "team" ? and(eq(agentMemories.scope, "team"), teamId ? eq(agentMemories.teamId, teamId) : sql`false`) : and(eq(agentMemories.scope, "holding"), holdingId ? eq(agentMemories.holdingId, holdingId) : sql`false`);

/**
 * Save a memory. For facts and lessons with an embedding, a near-duplicate in the same scope is
 * updated instead: `verified_at` moves to now, new sources are appended, and the evidence date and
 * expiry move forward. Returns the row id and whether it was merged into an existing one.
 */
export async function rememberMemory(input: NewMemory): Promise<{ id: string; merged: boolean }> {
  const embedding = await embedOrNull(input.body);
  const now = new Date();
  if (embedding && input.kind !== "log") {
    const literal = JSON.stringify(embedding);
    const distance = sql<number>`${agentMemories.embedding} <=> ${literal}::vector`;
    const [near] = await db
      .select({ row: agentMemories, distance: distance.mapWith(Number) })
      .from(agentMemories)
      .where(and(scopeCondition(input.scope, input.teamId, input.holdingId), eq(agentMemories.kind, input.kind), sql`${agentMemories.embedding} is not null`))
      .orderBy(distance)
      .limit(1);
    if (near && 1 - near.distance >= DUPLICATE_SIMILARITY) {
      const sources = mergeSources(near.row.sources ?? [], input.sources ?? []);
      const evidenceAt = [near.row.evidenceAt, input.evidenceAt ?? null].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const expiresAt = near.row.expiresAt === null || input.expiresAt === null ? null : ([near.row.expiresAt, input.expiresAt ?? null].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null);
      await db.update(agentMemories).set({ verifiedAt: now, sources, evidenceAt, expiresAt, updatedAt: now }).where(eq(agentMemories.id, near.row.id));
      return { id: near.row.id, merged: true };
    }
  }
  const [row] = await db
    .insert(agentMemories)
    .values({
      scope: input.scope,
      teamId: input.teamId,
      holdingId: input.holdingId,
      kind: input.kind,
      body: input.body,
      sources: input.sources ?? [],
      meta: input.meta,
      sourceChatId: input.sourceChatId ?? null,
      embedding,
      model: input.model ?? null,
      evidenceAt: input.evidenceAt ?? null,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy ?? "agent",
    })
    .returning({ id: agentMemories.id });
  return { id: row.id, merged: false };
}

/** Every memory on a holding, newest first, for the prompt block and the board card. */
export async function listHoldingMemories(holdingId: string, limit = 60): Promise<MemoryEntry[]> {
  const rows = await db.select().from(agentMemories).where(eq(agentMemories.holdingId, holdingId)).orderBy(desc(agentMemories.createdAt)).limit(limit);
  return rows.map(toEntry);
}

/** Unexpired fund-wide facts and lessons, most used first. */
export async function listFundMemories(limit = 5): Promise<MemoryEntry[]> {
  const rows = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, "fund"), or(isNull(agentMemories.expiresAt), gt(agentMemories.expiresAt, new Date()))))
    .orderBy(desc(agentMemories.useCount), desc(agentMemories.createdAt))
    .limit(limit);
  return rows.map(toEntry);
}

export type MemoryHit = MemoryEntry & { score: number | null };

/**
 * Memories the agent may draw on for a question: the holding's, the team's and the fund's, unexpired.
 * Semantic when embeddings are configured, else newest first. Bumps use counts on what it returns.
 */
export async function searchMemories(p: { query: string; teamId: string; holdingId?: string | null; limit?: number; kinds?: MemoryKind[] }): Promise<MemoryHit[]> {
  const limit = p.limit ?? 8;
  const visible = or(eq(agentMemories.scope, "fund"), and(eq(agentMemories.scope, "team"), eq(agentMemories.teamId, p.teamId)), p.holdingId ? and(eq(agentMemories.scope, "holding"), eq(agentMemories.holdingId, p.holdingId)) : sql`false`);
  const conds = [visible, or(isNull(agentMemories.expiresAt), gt(agentMemories.expiresAt, new Date()))];
  if (p.kinds?.length) conds.push(inArray(agentMemories.kind, p.kinds));
  const vec = await embedOrNull(p.query);
  let hits: MemoryHit[];
  if (vec) {
    const distance = sql<number>`${agentMemories.embedding} <=> ${JSON.stringify(vec)}::vector`;
    const rows = await db
      .select({ row: agentMemories, distance: distance.mapWith(Number) })
      .from(agentMemories)
      .where(and(...conds, sql`${agentMemories.embedding} is not null`))
      .orderBy(distance)
      .limit(limit);
    hits = rows.map((r) => ({ ...toEntry(r.row), score: +(1 - r.distance).toFixed(4) }));
  } else {
    const rows = await db.select().from(agentMemories).where(and(...conds)).orderBy(desc(agentMemories.createdAt)).limit(limit);
    hits = rows.map((r) => ({ ...toEntry(r), score: null }));
  }
  if (hits.length) {
    await db
      .update(agentMemories)
      .set({ useCount: sql`${agentMemories.useCount} + 1`, lastUsedAt: new Date() })
      .where(inArray(agentMemories.id, hits.map((h) => h.id)))
      .catch(() => {});
  }
  return hits;
}

export async function getMemory(id: string) {
  const [row] = await db.select().from(agentMemories).where(eq(agentMemories.id, id)).limit(1);
  return row ?? null;
}

export async function deleteMemoryRow(id: string) {
  await db.delete(agentMemories).where(eq(agentMemories.id, id));
}

/** Morning housekeeping: drop expired rows. Stale-but-unexpired facts stay (recallable, just not injected). */
export async function purgeExpiredMemories(): Promise<number> {
  const rows = await db.delete(agentMemories).where(lt(agentMemories.expiresAt, new Date())).returning({ id: agentMemories.id });
  return rows.length;
}
