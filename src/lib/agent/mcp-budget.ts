import "server-only";
import { and, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { getSetting } from "@/lib/settings";

/**
 * An optional daily call cap per MCP server, kept in app_settings so no migration is needed. The cap
 * lives at `mcp_daily_cap:<server name>` (a whole number; blank or missing means no cap) and the count
 * at `mcp_calls:<server name>:<YYYY-MM-DD>`, one row per UTC day. Uncapped servers are not counted.
 */
export const mcpCapKey = (server: string) => `mcp_daily_cap:${server}`;
export const mcpCountKey = (server: string, day = utcDay()) => `mcp_calls:${server}:${day}`;

export function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function parseCap(v: string | null | undefined): number | null {
  if (v == null || !v.trim()) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export type McpBudgetClaim = { ok: true } | { ok: false; cap: number };

/**
 * Take one call from the server's budget for today. One upsert: it inserts 1 or adds 1 only while the
 * stored count is under the cap, so parallel calls can never push it past. A database error lets the
 * call through (the cap protects a provider quota, not money) and is logged.
 */
export async function claimMcpCall(server: string): Promise<McpBudgetClaim> {
  try {
    const cap = parseCap(await getSetting(mcpCapKey(server)));
    if (cap === null) return { ok: true };
    if (cap === 0) return { ok: false, cap };
    const key = mcpCountKey(server);
    const rows = await db
      .insert(appSettings)
      .values({ key, value: "1", updatedBy: null })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: sql`(${appSettings.value}::int + 1)::text`, updatedAt: new Date() },
        setWhere: sql`${appSettings.value}::int < ${cap}`,
      })
      .returning({ value: appSettings.value });
    if (!rows.length) return { ok: false, cap };
    // First call of a new day: earlier days' counters are no longer read, so drop them.
    if (rows[0].value === "1") {
      db.delete(appSettings)
        .where(and(sql`starts_with(${appSettings.key}, ${`mcp_calls:${server}:`})`, ne(appSettings.key, key)))
        .catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    console.error(`[mcp:${server}] budget check failed; allowing the call`, e);
    return { ok: true };
  }
}

export function budgetExhaustedMessage(server: string, cap: number) {
  return `Daily budget for ${server} is used up (${cap} calls); try again tomorrow or use a native tool`;
}

/** Cap and today's count for each server, for the Admin page. */
export async function mcpBudgets(servers: string[]): Promise<Record<string, { cap: number | null; used: number }>> {
  const out: Record<string, { cap: number | null; used: number }> = {};
  if (!servers.length) return out;
  const day = utcDay();
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, servers.flatMap((s) => [mcpCapKey(s), mcpCountKey(s, day)])));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  for (const s of servers) out[s] = { cap: parseCap(byKey.get(mcpCapKey(s))), used: Number(byKey.get(mcpCountKey(s, day)) ?? 0) || 0 };
  return out;
}
